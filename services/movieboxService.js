import https from 'node:https';
import http from 'node:http';

const API_BASE = 'https://h5-api.aoneroom.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// In-memory catalog cache to ensure blazing fast response times
let catalogCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const imdbCache = new Map();

/**
 * Resolve IMDb ID from movie/series title using IMDb's suggestion API
 */
export async function getImdbIdFromTitle(title) {
  if (!title) return null;
  const clean = title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
  if (!clean) return null;
  const cacheKey = clean.toLowerCase();
  if (imdbCache.has(cacheKey)) {
    return imdbCache.get(cacheKey);
  }

  return new Promise((resolve) => {
    const q = encodeURIComponent(clean);
    https.get(`https://v3.sg.media-imdb.com/suggestion/x/${q}.json`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 5000
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(b);
          const first = (data.d || []).find(item => item.id && item.id.startsWith('tt') && (item.q === 'feature' || item.q === 'TV series' || item.q === 'TV mini series' || item.q === 'movie'));
          const id = first ? first.id : null;
          if (id) imdbCache.set(cacheKey, id);
          resolve(id);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Make an HTTPS request to MovieBox API with all required spoofed headers
 */
function apiRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`);
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://mzfi.me',
      'Referer': options.headers?.Referer || 'https://mzfi.me/',
      'User-Agent': USER_AGENT,
      'X-Client-Info': JSON.stringify({ timezone: 'Asia/Jakarta' }),
      'X-Vip-Restrict': '1',
      ...(options.headers || {})
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers,
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch {
          resolve({ code: -1, raw: data });
        }
      });
    });

    req.on('error', (err) => {
      console.warn(`[MovieboxService] Request error to ${endpoint}:`, err.message);
      resolve({ code: -1, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn(`[MovieboxService] Request timeout for ${endpoint}`);
      resolve({ code: -1, error: 'timeout' });
    });

    if (body) req.write(body);
    req.end();
  });
}

/**
 * Build unified catalog item representation
 */
function formatCatalogItem(raw) {
  if (!raw || !raw.subjectId) return null;
  const isSeries = Number(raw.subjectType) === 2;
  const coverUrl = raw.cover?.url || raw.cover || '';
  
  // Format rating
  let rating = 'N/A';
  if (raw.imdbRatingValue && raw.imdbRatingValue !== '0') {
    rating = String(raw.imdbRatingValue);
  }

  // Parse genres
  let genres = [];
  if (raw.genre) {
    genres = String(raw.genre).split(',').map(g => g.trim()).filter(Boolean);
  }

  return {
    id: String(raw.subjectId),
    subjectId: String(raw.subjectId),
    detailPath: raw.detailPath || '',
    title: raw.title || 'Untitled',
    description: raw.description || '',
    poster: coverUrl,
    type: isSeries ? 'series' : 'movie',
    typeLabel: isSeries ? 'Series' : 'Movie',
    genre: genres,
    rating,
    year: raw.releaseDate ? raw.releaseDate.split('-')[0] : '',
    releaseDate: raw.releaseDate || '',
    country: raw.countryName || '',
    duration: raw.duration || 0,
    hasResource: raw.hasResource !== false,
    subtitles: raw.subtitles || '',
    source: 'moviebox'
  };
}

/**
 * Fetch and build the full catalog from MovieBox
 */
async function fetchFullCatalog() {
  const now = Date.now();
  if (catalogCache && (now - lastCacheTime < CACHE_TTL_MS)) {
    return catalogCache;
  }

  try {
    const [homeRes, trendingRes, trending2Res, hotRes] = await Promise.all([
      apiRequest('/wefeed-h5api-bff/home').catch(() => null),
      apiRequest('/wefeed-h5api-bff/subject/trending?page=1&perPage=48').catch(() => null),
      apiRequest('/wefeed-h5api-bff/subject/trending?page=2&perPage=48').catch(() => null),
      apiRequest('/wefeed-h5api-bff/subject/everyone-search').catch(() => null)
    ]);

    const banners = [];
    const itemMap = new Map();
    const categoriesMap = new Map();

    // 1. Process Home Response (Banners & 36 Categories)
    if (homeRes?.data?.operatingList) {
      for (const op of homeRes.data.operatingList) {
        // Hero banners
        if (op.type === 'BANNER' && op.banner?.items?.length) {
          for (const b of op.banner.items) {
            if (b.subjectId && b.image?.url) {
              banners.push({
                id: String(b.subjectId),
                title: b.title || b.subject?.title || '',
                bannerUrl: b.image.url,
                posterUrl: b.subject?.cover?.url || b.image.url,
                genres: b.subject?.genre ? b.subject.genre.split(',') : [],
                releaseDate: b.subject?.releaseDate || '',
                type: b.subjectType === 2 ? 'series' : 'movie',
                detailPath: b.subject?.detailPath || ''
              });
              if (b.subject) {
                const formatted = formatCatalogItem(b.subject);
                if (formatted) itemMap.set(formatted.id, formatted);
              }
            }
          }
        }

        // Category items
        if (op.subjects && Array.isArray(op.subjects)) {
          const categoryTitle = (op.title || '').trim();
          const catList = [];
          for (const sub of op.subjects) {
            const formatted = formatCatalogItem(sub);
            if (formatted) {
              itemMap.set(formatted.id, formatted);
              catList.push(formatted);
            }
          }
          if (catList.length > 0 && categoryTitle) {
            categoriesMap.set(categoryTitle, catList);
          }
        }
      }
    }

    // 2. Process Trending Pages
    const trendingItems = [
      ...(trendingRes?.data?.subjectList || []),
      ...(trending2Res?.data?.subjectList || [])
    ];
    for (const sub of trendingItems) {
      const formatted = formatCatalogItem(sub);
      if (formatted) {
        itemMap.set(formatted.id, formatted);
      }
    }

    // 3. Process Everyone-search / Hot Items
    if (hotRes?.data?.hot) {
      for (const cat of hotRes.data.hot) {
        if (cat.items && Array.isArray(cat.items)) {
          for (const item of cat.items) {
            const formatted = formatCatalogItem(item);
            if (formatted) itemMap.set(formatted.id, formatted);
          }
        }
      }
    }

    const allItems = Array.from(itemMap.values());

    catalogCache = {
      banners: banners.slice(0, 8),
      items: allItems,
      categories: Array.from(categoriesMap.entries()).map(([title, items]) => ({ title, count: items.length })),
      categoriesMap
    };
    lastCacheTime = now;

    console.log(`[MovieboxService] Ingested ${allItems.length} titles and ${banners.length} banners from themoviebox.xyz`);
    return catalogCache;
  } catch (error) {
    console.error('[MovieboxService] Error fetching catalog:', error);
    if (catalogCache) return catalogCache;
    return { banners: [], items: [], categories: [], categoriesMap: new Map() };
  }
}

/**
 * Get catalog with filtering, category grouping, and pagination
 */
export async function getMovieboxCatalog({ category = 'all', page = 1, search = '', limit = 24 }) {
  const catalog = await fetchFullCatalog();
  let list = [...catalog.items];

  // Search filter
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(item => 
      item.title.toLowerCase().includes(q) ||
      item.genre.some(g => g.toLowerCase().includes(q)) ||
      item.country.toLowerCase().includes(q)
    );
  } else {
    // Category filter
    const cat = category.toLowerCase();
    if (cat === 'movie' || cat === 'movies') {
      list = list.filter(i => i.type === 'movie');
    } else if (cat === 'series' || cat === 'drama') {
      list = list.filter(i => i.type === 'series');
    } else if (cat === 'indonesia' || cat === 'indo') {
      list = list.filter(i => 
        i.country.toLowerCase().includes('indonesia') || 
        i.title.toLowerCase().includes('indonesian') || 
        i.title.toLowerCase().includes('indo')
      );
    } else if (cat === 'kdrama' || cat === 'k-drama') {
      list = list.filter(i => 
        i.genre.some(g => g.toLowerCase().includes('k-drama')) || 
        i.country.toLowerCase().includes('korea')
      );
    } else if (cat === 'anime') {
      list = list.filter(i => 
        i.genre.some(g => g.toLowerCase().includes('animation') || g.toLowerCase().includes('anime')) ||
        i.country.toLowerCase().includes('japan')
      );
    } else if (cat === 'horror') {
      list = list.filter(i => i.genre.some(g => g.toLowerCase().includes('horror')));
    } else if (cat === 'trending') {
      // Keep natural order from trending API
      list = list.slice(0, 60);
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const perPage = Math.max(1, parseInt(limit, 10));
  const total = list.length;
  const totalPages = Math.ceil(total / perPage);
  const startIndex = (pageNum - 1) * perPage;
  const paginatedItems = list.slice(startIndex, startIndex + perPage);

  return {
    success: true,
    banners: catalog.banners,
    data: paginatedItems,
    pagination: {
      page: pageNum,
      limit: perPage,
      total,
      totalPages,
      hasMore: pageNum < totalPages
    },
    counts: {
      total,
      movies: list.filter(i => i.type === 'movie').length,
      series: list.filter(i => i.type === 'series').length
    }
  };
}

/**
 * Get detailed metadata for a movie or series
 */
export async function getMovieboxDetail(subjectId, detailPath = '') {
  if (!subjectId) return { success: false, message: 'subjectId wajib disertakan' };

  try {
    const res = await apiRequest(`/wefeed-h5api-bff/detail?subjectId=${subjectId}`);
    if (res?.code !== 0 || !res?.data) {
      return { success: false, message: 'Detail film tidak ditemukan di MovieBox' };
    }

    const { subject, resource, stars, dubs } = res.data;
    const isSeries = Number(subject.subjectType) === 2;
    const coverUrl = subject.cover?.url || '';

    // Extract seasons and episodes
    const seasonsList = [];
    if (resource?.seasons && Array.isArray(resource.seasons)) {
      for (const s of resource.seasons) {
        const episodes = [];
        if (s.allEp) {
          const epArray = s.allEp.split(',').map(e => parseInt(e.trim(), 10)).filter(n => !isNaN(n));
          for (const epNum of epArray) {
            episodes.push({
              season: s.se,
              episode: epNum,
              label: `Episode ${epNum}`
            });
          }
        } else {
          const maxEp = s.maxEp || 1;
          for (let ep = 1; ep <= maxEp; ep++) {
            episodes.push({
              season: s.se,
              episode: ep,
              label: `Episode ${ep}`
            });
          }
        }

        seasonsList.push({
          season: s.se,
          label: s.se === 0 ? 'Full Movie' : `Season ${s.se}`,
          episodesCount: episodes.length || 1,
          episodes: episodes.length > 0 ? episodes : [{ season: s.se, episode: 0, label: 'Tonton Film Lengkap' }]
        });
      }
    }

    // Cast & Crew
    const cast = (stars || []).map(st => ({
      name: st.name || '',
      character: st.character || '',
      avatar: st.avatar?.url || ''
    }));

    return {
      success: true,
      data: {
        id: String(subject.subjectId),
        subjectId: String(subject.subjectId),
        detailPath: subject.detailPath || detailPath || '',
        title: subject.title || '',
        description: subject.description || '',
        poster: coverUrl,
        backdrop: subject.cover?.url || '',
        rating: subject.imdbRatingValue && subject.imdbRatingValue !== '0' ? subject.imdbRatingValue : 'N/A',
        ratingCount: subject.imdbRatingCount || 0,
        releaseDate: subject.releaseDate || '',
        year: subject.releaseDate ? subject.releaseDate.split('-')[0] : '',
        duration: subject.duration || 0,
        country: subject.countryName || '',
        genre: subject.genre ? subject.genre.split(',').map(g => g.trim()) : [],
        type: isSeries ? 'series' : 'movie',
        typeLabel: isSeries ? 'Series' : 'Movie',
        subtitlesAvailable: subject.subtitles || '',
        hasResource: resource?.hasResource !== false,
        seasons: seasonsList,
        cast,
        dubs: (dubs || []).map(d => ({
          subjectId: String(d.subjectId),
          title: d.title,
          lanName: d.lanName
        }))
        // Note: trailer is intentionally excluded from play options to satisfy "hindari menampilkan trailer"
      }
    };
  } catch (error) {
    console.error('[MovieboxService] Detail fetch error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Get playable streams, resolutions, soft subtitles, and download links
 */
export async function getMovieboxStream({ subjectId, detailPath = '', se = 0, ep = 0, title = '' }) {
  if (!subjectId) return { success: false, message: 'subjectId wajib disertakan' };

  try {
    const curSe = Number(se) || 0;
    const curEp = curSe === 0 ? 0 : (Number(ep) || 1);

    // Parallel fetch: detail metadata + play streams for minimal latency
    const detailPromise = (title && detailPath)
      ? Promise.resolve({ success: true, data: { title, detailPath, type: curSe > 0 ? 'series' : 'movie' } })
      : getMovieboxDetail(subjectId, detailPath).catch(() => null);

    const playUrl = `/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${curSe}&ep=${curEp}&detailPath=${detailPath || ''}&streamSignType=0`;
    const playPromise = apiRequest(playUrl, {
      headers: {
        'Origin': 'https://mzfi.me',
        'Referer': `https://mzfi.me/spa/videoPlayPage/movies/${detailPath || 'watch'}?id=${subjectId}&type=/movie/detail&detailSe=${curSe}&detailEp=${curEp}&lang=id`
      }
    }).catch(() => null);

    const [movieDetailRes, playRes] = await Promise.all([detailPromise, playPromise]);
    const movieDetail = movieDetailRes?.data || null;
    const resolvedTitle = title || movieDetail?.title || '';
    const actualDetailPath = detailPath || movieDetail?.detailPath || '';
    const isSeries = movieDetail?.type === 'series' || curSe > 0;
    const embedUrl = `https://mzfi.me/spa/videoPlayPage/movies/${actualDetailPath}?id=${subjectId}&type=/movie/detail&detailSe=${curSe}&detailEp=${curEp}&lang=id`;

    // Fast IMDb ID lookup (cached in memory)
    const imdbId = await getImdbIdFromTitle(resolvedTitle);

    const embedServers = [];
    if (imdbId) {
      if (isSeries) {
        // Fast Server 1: VidSrc.to (Very fast v2 player)
        embedServers.push({
          id: 'vidsrc_to',
          name: 'Server 1 (VidSrc Fast 1080p)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          isPrimary: true,
          isDefault: true,
          link: `https://vidsrc.to/embed/tv/${imdbId}/${curSe || 1}/${curEp || 1}`
        });

        // Fast Server 2: MultiEmbed VIP (Aggregator with multi-CDN)
        embedServers.push({
          id: 'multiembed',
          name: 'Server 2 (MultiEmbed VIP)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          link: `https://multiembed.mov/?video_id=${imdbId}&s=${curSe || 1}&e=${curEp || 1}`
        });

        // Server 3: VidSrc PM
        embedServers.push({
          id: 'vidsrc_pm',
          name: 'Server 3 (VidSrc PM)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          link: `https://vidsrc.pm/embed/tv?imdb=${imdbId}&season=${curSe || 1}&episode=${curEp || 1}`
        });

        // Server 4: 2Embed HD
        embedServers.push({
          id: 'twoembed',
          name: 'Server 4 (2Embed HD)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          link: `https://www.2embed.cc/embedtv/${imdbId}&s=${curSe || 1}&e=${curEp || 1}`
        });
      } else {
        // Fast Server 1: VidSrc.to (Very fast v2 player)
        embedServers.push({
          id: 'vidsrc_to',
          name: 'Server 1 (VidSrc Fast 1080p)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          isPrimary: true,
          isDefault: true,
          link: `https://vidsrc.to/embed/movie/${imdbId}`
        });

        // Fast Server 2: MultiEmbed VIP (Aggregator with multi-CDN)
        embedServers.push({
          id: 'multiembed',
          name: 'Server 2 (MultiEmbed VIP)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          link: `https://multiembed.mov/?video_id=${imdbId}`
        });

        // Server 3: VidSrc PM
        embedServers.push({
          id: 'vidsrc_pm',
          name: 'Server 3 (VidSrc PM)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          link: `https://vidsrc.pm/embed/movie?imdb=${imdbId}`
        });

        // Server 4: 2Embed HD
        embedServers.push({
          id: 'twoembed',
          name: 'Server 4 (2Embed HD)',
          quality: '1080p',
          resolution: '1080',
          type: 'embed',
          isDirect: false,
          link: `https://www.2embed.cc/embed/${imdbId}`
        });
      }
    }

    // MovieBox Cloud Player
    embedServers.push({
      id: `mb_embed_${subjectId}_${curSe}_${curEp}`,
      name: `Server ${embedServers.length + 1} (MovieBox Cloud)`,
      quality: '1080p',
      resolution: '1080',
      type: 'embed',
      isDirect: false,
      isPrimary: embedServers.length === 0,
      isDefault: embedServers.length === 0,
      link: embedUrl,
      format: 'EMBED'
    });

    const streams = playRes?.data?.streams || [];
    const hls = playRes?.data?.hls || [];

    // Fetch Soft Subtitles
    let captions = [];
    const streamIdForCaption = streams.find(s => s.id)?.id || hls[0]?.id;
    if (streamIdForCaption) {
      const capFormat = hls.length > 0 ? 'HLS' : 'MP4';
      const captionUrl = `/wefeed-h5api-bff/subject/caption?format=${capFormat}&id=${streamIdForCaption}&subjectId=${subjectId}&detailPath=${actualDetailPath}`;
      const capRes = await apiRequest(captionUrl, {
        headers: {
          'Origin': 'https://mzfi.me',
          'Referer': embedUrl
        }
      }).catch(() => null);
      captions = capRes?.data?.captions || [];
    }

    // Format Playable Direct Streams
    const directServers = streams
      .filter(s => s.url && !s.vipLocked)
      .map(s => {
        const res = s.resolutions ? `${s.resolutions}p` : 'HD';
        return {
          id: String(s.id),
          name: `Server Direct (${res})`,
          quality: res,
          resolution: s.resolutions,
          link: `/api/moviebox/stream-proxy?url=${encodeURIComponent(s.url)}`,
          rawLink: s.url,
          type: 'direct',
          isDirect: true,
          format: s.format || 'MP4',
          duration: s.duration || 0,
          size: s.size || 0,
          codec: s.codecName || 'h264'
        };
      })
      .sort((a, b) => parseInt(b.resolution || 0, 10) - parseInt(a.resolution || 0, 10));

    const formattedServers = [...embedServers, ...directServers];

    // Format Soft Subtitles
    const formattedSubtitles = captions.map(c => {
      const isIndo = c.lan === 'in_id' || c.lan === 'id';
      return {
        id: c.id,
        lan: c.lan,
        lanName: c.lanName || (isIndo ? 'Bahasa Indonesia' : c.lan.toUpperCase()),
        rawUrl: c.url,
        vttUrl: `/api/moviebox/subtitle?url=${encodeURIComponent(c.url)}&lang=${c.lan}`,
        isDefault: isIndo
      };
    });

    formattedSubtitles.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));

    return {
      success: true,
      title: resolvedTitle,
      subjectId: String(subjectId),
      detailPath: actualDetailPath,
      season: curSe,
      episode: curEp,
      imdbId: imdbId || '',
      servers: formattedServers,
      subtitles: formattedSubtitles
    };
  } catch (error) {
    console.error('[MovieboxService] Stream error:', error);
    return { success: false, message: error.message, servers: [], subtitles: [] };
  }
}

/**
 * Fetch and convert an SRT subtitle to WebVTT
 */
export async function getVttSubtitle(srtUrl) {
  if (!srtUrl) throw new Error('URL subtitle tidak boleh kosong');

  return new Promise((resolve, reject) => {
    https.get(srtUrl, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Gagal mengunduh subtitle: HTTP ${res.statusCode}`));
      }
      let rawSrt = '';
      res.on('data', chunk => rawSrt += chunk);
      res.on('end', () => {
        // Convert SRT to WebVTT
        // 1. Replace comma timestamp with dot: 00:00:20,353 -> 00:00:20.353
        const converted = rawSrt
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

        const vttContent = `WEBVTT\n\n${converted}`;
        resolve(vttContent);
      });
    }).on('error', reject);
  });
}

/**
 * Proxy video stream with Range header support to bypass CDN hotlinking block
 */
export function proxyVideoStream(req, res, targetUrl) {
  if (!targetUrl) {
    return res.status(400).send('Target stream URL missing');
  }

  const parsedUrl = new URL(targetUrl);
  const clientHeaders = {
    'User-Agent': USER_AGENT,
    'Referer': 'https://mzfi.me/',
    'Origin': 'https://mzfi.me'
  };

  if (req.headers.range) {
    clientHeaders['Range'] = req.headers.range;
  }

  const proxyReq = https.request({
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: clientHeaders,
    timeout: 15000
  }, (proxyRes) => {
    // If upstream returns error status (like 426 or 429 on datacenter IPs), redirect directly to targetUrl
    if (proxyRes.statusCode >= 400 && proxyRes.statusCode !== 416) {
      console.warn(`[MovieboxService] Stream proxy upstream returned ${proxyRes.statusCode}, redirecting to raw URL`);
      return res.redirect(302, targetUrl);
    }

    res.status(proxyRes.statusCode);

    // Forward necessary video streaming headers
    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    for (const h of forwardHeaders) {
      if (proxyRes.headers[h]) {
        res.setHeader(h, proxyRes.headers[h]);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.warn('[MovieboxService] Stream proxy error:', err.message);
    if (!res.headersSent) {
      res.redirect(302, targetUrl);
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
}
