import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NONTONDRAMA_BASE = 'https://tv.nontondrama.vip';
const NONTONDRAMA_POSTER_BASE = 'https://poster.assetsy.de/wp-content/uploads/';

// In-memory cache for real NontonDrama catalog and pre-resolved native servers
let nontondramaRealCache = { series: {}, episodes: {} };
function loadRealCache() {
  try {
    const realCachePath = path.join(__dirname, '..', 'database', 'nontondrama_real_cache.json');
    if (fs.existsSync(realCachePath)) {
      nontondramaRealCache = JSON.parse(fs.readFileSync(realCachePath, 'utf8'));
      if (!nontondramaRealCache.series) nontondramaRealCache.series = {};
      if (!nontondramaRealCache.episodes) nontondramaRealCache.episodes = {};
    }
  } catch (err) {
    console.warn('Could not load nontondrama_real_cache.json:', err.message);
  }
}
loadRealCache();

// In-memory cache for episode stream responses (TTL: 1 hour)
const episodeCache = new Map();
const EPISODE_CACHE_TTL = 60 * 60 * 1000;

// Helper to decode HTML entities in titles
function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'");
}

function toSeriesGenreSlug(g) {
  if (!g) return '';
  const clean = g.trim().toLowerCase();
  if (clean === 'music') return 'musical';
  if (clean === 'sci-fi' || clean === 'scifi') return 'sci-fi';
  return clean.replace(/\s+/g, '-');
}

// Helper to execute curl with browser user-agent
async function curlFetch(url) {
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const cmd = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

// Parse series article cards from HTML
function parseSeriesArticles(html) {
  const articles = [];
  const articleRegex = /<article[^>]*itemtype="https:\/\/schema\.org\/Movie"[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const art = match[1];

    const urlMatch = art.match(/href="([^"]+)"/);
    const titleMatch = art.match(/itemprop="name"[^>]*>([^<]+)<\/h3>/) ||
                       art.match(/class="poster-title"[^>]*>([^<]+)<\/h3>/) ||
                       art.match(/alt="([^"]+)"/);
    const imgMatch = art.match(/<img[^>]*\bdata-src="(https?:\/\/[^"]+)"/i) ||
                     art.match(/<source[^>]*type="image\/jpeg"[^>]*\b(?:data-srcset|srcset)="(https?:\/\/[^"\s]+)"/i) ||
                     art.match(/<img[^>]*\bsrc="(https?:\/\/[^"]+)"/i) ||
                     art.match(/data-src="([^"]+)"/) ||
                     art.match(/src="([^"]+)"/);
    const ratingMatch = art.match(/itemprop="ratingValue">([^<]+)<\/span>/) ||
                        art.match(/class="rating"[^>]*>([\s\S]*?)<\/span>/);
    const genreMatch = art.match(/itemprop="genre"\s+content="([^"]+)"/) ||
                       art.match(/class="genre"[^>]*>([^<]+)<\/div>/);
    const yearMatch = art.match(/class="year"[^>]*>([^<]+)<\/span>/);
    const epMatch = art.match(/class="episode[^"]*">([\s\S]*?)<\/span>/);
    const durationMatch = art.match(/class="duration"[^>]*>([^<]+)<\/span>/);

    if (urlMatch && titleMatch) {
      const rawUrl = urlMatch[1];
      const slug = rawUrl.replace(/^\//, '').replace(/\/$/, '');
      const rawTitle = decodeEntities(titleMatch[1].replace(/Sub\s*Indo.*$/i, '').trim());

      let episodeText = '';
      if (epMatch) {
        episodeText = epMatch[1].replace(/<[^>]+>/g, '').trim();
      }
      const seasonText = durationMatch ? durationMatch[1].trim() : '';
      const yearVal = yearMatch ? yearMatch[1].trim() : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');

      articles.push({
        id: `series_${slug}`,
        source: 'nontondrama',
        type: 'series',
        slug,
        title: rawTitle,
        poster: imgMatch ? imgMatch[1] : '',
        rating: ratingMatch ? ratingMatch[1].replace(/<[^>]+>/g, '').trim() : '8.0',
        genres: genreMatch ? genreMatch[1].trim() : 'Drama, Romance',
        year: yearVal,
        episodeBadge: episodeText,
        seasonBadge: seasonText,
        url: `${NONTONDRAMA_BASE}/${slug}`
      });
    }
  }

  return articles;
}

// 1. Get Series List from tv.nontondrama.vip (with seamless database fallback)
export async function getNontondramaSeries({ category = 'latest', genre = '', genres = '', year = '', page = 1, search = '' } = {}) {
  const p = Math.max(1, parseInt(page) || 1);
  const targetGenre = genres || genre || '';

  let list = [];
  try {
    let targetUrl = `${NONTONDRAMA_BASE}/latest-series/`;

    if (search && search.trim()) {
      targetUrl = `${NONTONDRAMA_BASE}/?s=${encodeURIComponent(search.trim())}`;
      if (p > 1) {
        targetUrl = `${NONTONDRAMA_BASE}/page/${p}/?s=${encodeURIComponent(search.trim())}`;
      }
    } else if (targetGenre) {
      const cleanGenre = toSeriesGenreSlug(targetGenre.split(',')[0]);
      targetUrl = `${NONTONDRAMA_BASE}/genre/${cleanGenre}/`;
      if (p > 1) targetUrl += `page/${p}/`;
    } else if (category === 'top' || category === 'populer' || category === 'rating') {
      targetUrl = `${NONTONDRAMA_BASE}/top-series-today/`;
      if (p > 1) targetUrl += `page/${p}/`;
    } else if (category === 'drakor') {
      targetUrl = `${NONTONDRAMA_BASE}/maraton-drakor/`;
      if (p > 1) targetUrl += `page/${p}/`;
    } else if (category === 'asian') {
      targetUrl = `${NONTONDRAMA_BASE}/series/asian/`;
      if (p > 1) targetUrl += `page/${p}/`;
    } else if (category === 'west') {
      targetUrl = `${NONTONDRAMA_BASE}/series/west/`;
      if (p > 1) targetUrl += `page/${p}/`;
    } else if (category === 'ongoing') {
      targetUrl = `${NONTONDRAMA_BASE}/series/ongoing/`;
      if (p > 1) targetUrl += `page/${p}/`;
    } else if (category === 'complete') {
      targetUrl = `${NONTONDRAMA_BASE}/series/complete/`;
      if (p > 1) targetUrl += `page/${p}/`;
    } else {
      if (p > 1) targetUrl = `${NONTONDRAMA_BASE}/latest-series/page/${p}/`;
    }

    const html = await curlFetch(targetUrl);
    list = parseSeriesArticles(html);

    if (year && /^\d{4}$/.test(String(year))) {
      list = list.filter(m => !m.year || String(m.year) === String(year) || m.title.includes(String(year)));
    }
  } catch (error) {
    // Cloudflare or curl failure on serverless
  }

  if (list && list.length > 0) {
    return list;
  }

  // Real NontonDrama Cached Series Fallback
  loadRealCache();
  const allSeries = Object.values(nontondramaRealCache.series || {});
  if (allSeries.length > 0) {
    let pool = [...allSeries];
    const catLower = (category || 'latest').toLowerCase();

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      pool = pool.filter(s =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.slug && s.slug.includes(q)) ||
        (s.genres && s.genres.toLowerCase().includes(q))
      );
    } else {
      if (catLower === 'drakor') {
        pool = pool.filter(s => s.category === 'drakor' || (s.genres && s.genres.toLowerCase().includes('korean')));
      } else if (catLower === 'asian') {
        pool = pool.filter(s => s.category === 'asian' || (s.genres && (s.genres.toLowerCase().includes('chinese') || s.genres.toLowerCase().includes('thai') || s.genres.toLowerCase().includes('japanese'))));
      } else if (catLower === 'west') {
        pool = pool.filter(s => s.category === 'west');
      }

      if (targetGenre) {
        const tg = targetGenre.toLowerCase();
        pool = pool.filter(s => s.genres && s.genres.toLowerCase().includes(tg));
      }
    }

    if (year && /^\d{4}$/.test(String(year))) {
      pool = pool.filter(s => String(s.year) === String(year) || (s.title && s.title.includes(String(year))));
    }

    const pageSize = 24;
    const startIndex = (p - 1) * pageSize;
    return pool.slice(startIndex, startIndex + pageSize).map(s => ({
      id: s.id || `series_${s.slug}`,
      source: 'nontondrama',
      type: 'series',
      slug: s.slug,
      title: s.title,
      poster: s.poster,
      rating: s.rating || '8.0',
      genres: s.genres || 'Drama, Series',
      year: s.year || '',
      episodeBadge: s.episodeBadge || (s.totalEpisodes ? `EPS ${s.totalEpisodes}` : ''),
      seasonBadge: s.seasonBadge || (s.totalSeasons ? `S.${s.totalSeasons}` : ''),
      url: s.url || `${NONTONDRAMA_BASE}/${s.slug}`
    }));
  }

  return [];
}

// 2. Get Series Detail & Full Season/Episode Tree
export async function getNontondramaDetail(slug) {
  const cleanSlug = (slug || '').replace(/^series_/, '').trim();
  const url = `${NONTONDRAMA_BASE}/${cleanSlug}`;

  try {
    const html = await curlFetch(url);

    // Meta / Basic info
    const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*>([^<]+)<\/h1>/) ||
                       html.match(/<title>([^<]+)<\/title>/);
    let title = titleMatch ? titleMatch[1].replace(/^Lk21\s*Nonton\s*/i, '').replace(/Sub\s*Indo.*$/i, '').replace(/Series$/i, '').trim() : cleanSlug;

    const synMatch = html.match(/<blockquote[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/blockquote>/i) ||
                     html.match(/<div[^>]*class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
    const synopsis = synMatch ? synMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const posterMatch = html.match(/class="poster"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
                        html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    const poster = posterMatch ? posterMatch[1] : '';

    const ratingMatch = html.match(/itemprop="ratingValue">([^<]+)<\/span>/) ||
                        html.match(/class="rating"[^>]*>([^<]+)<\/span>/);
    const yearMatch = html.match(/class="year"[^>]*>([^<]+)<\/span>/);

    // Extract Episodes JSON from embedded script
    let episodesBySeason = {};
    const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const s of scriptMatches) {
      const content = s[1].trim();
      if (content.includes('"episode_no"')) {
        try {
          if (content.startsWith('{') && content.endsWith('}')) {
            episodesBySeason = JSON.parse(content);
          } else {
            const jsonMatch = content.match(/(\{["\d]+:\s*\[[\s\S]*?\]\})/);
            if (jsonMatch) {
              episodesBySeason = JSON.parse(jsonMatch[1]);
            }
          }
        } catch (_) {}
      }
    }

    // Fallback: Parse episode links from HTML if script JSON not found
    if (Object.keys(episodesBySeason).length === 0) {
      const epLinks = [...html.matchAll(/<a[^>]*href="(\/[^"]*season-(\d+)-episode-(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
      for (const em of epLinks) {
        const epSlug = em[1].replace(/^\//, '');
        const sNum = em[2] || '1';
        const epNum = parseInt(em[3]) || 1;
        if (!episodesBySeason[sNum]) episodesBySeason[sNum] = [];
        if (!episodesBySeason[sNum].some(e => e.slug === epSlug)) {
          episodesBySeason[sNum].push({
            s: parseInt(sNum),
            episode_no: epNum,
            title: `Season ${sNum} Episode ${epNum}`,
            slug: epSlug
          });
        }
      }
    }

    let totalEpisodesCount = 0;
    for (const eps of Object.values(episodesBySeason)) {
      totalEpisodesCount += (eps?.length || 0);
    }

    if (totalEpisodesCount > 0) {
      return {
        id: `series_${cleanSlug}`,
        source: 'nontondrama',
        type: 'series',
        slug: cleanSlug,
        title,
        synopsis,
        poster,
        rating: ratingMatch ? ratingMatch[1].trim() : '8.0',
        year: yearMatch ? yearMatch[1].trim() : '',
        totalSeasons: Object.keys(episodesBySeason).length,
        totalEpisodes: totalEpisodesCount,
        seasons: episodesBySeason,
        url
      };
    }
  } catch (error) {
    // curl failed or blocked
  }

  // Fallback to real cached NontonDrama detail
  loadRealCache();
  const cached = nontondramaRealCache.series?.[cleanSlug];
  if (cached && cached.seasons && Object.keys(cached.seasons).length > 0) {
    return {
      id: cached.id || `series_${cleanSlug}`,
      source: 'nontondrama',
      type: 'series',
      slug: cleanSlug,
      title: cached.title,
      synopsis: cached.synopsis || 'Sinopsis belum tersedia.',
      poster: cached.poster,
      rating: cached.rating || '8.0',
      genres: cached.genres || 'Drama, Series',
      year: cached.year || '',
      totalSeasons: cached.totalSeasons || Object.keys(cached.seasons).length,
      totalEpisodes: cached.totalEpisodes || 0,
      seasons: cached.seasons,
      url: cached.url || `${NONTONDRAMA_BASE}/${cleanSlug}`
    };
  }

  throw new Error(`Informasi serial ${cleanSlug} tidak ditemukan.`);
}

// 3. Get Episode Stream Servers (Original native P2P, CAST, and HYDRAX servers)
export async function getNontondramaEpisode(episodeSlug) {
  const cleanEpSlug = (episodeSlug || '').trim();

  // 1. Check memory cache
  const cached = episodeCache.get(cleanEpSlug);
  if (cached && (Date.now() - cached.timestamp < EPISODE_CACHE_TTL)) {
    return cached.data;
  }

  // 2. Check real crawled NontonDrama cache (pre-resolved native stream servers)
  loadRealCache();
  if (nontondramaRealCache.episodes && nontondramaRealCache.episodes[cleanEpSlug]) {
    const cachedEp = nontondramaRealCache.episodes[cleanEpSlug];
    const result = {
      slug: cleanEpSlug,
      title: cachedEp.title || cleanEpSlug,
      streamUrl: cachedEp.streamUrl || cachedEp.servers?.[0]?.directStreamUrl || '',
      servers: cachedEp.servers || []
    };
    episodeCache.set(cleanEpSlug, {
      timestamp: Date.now(),
      data: result
    });
    return result;
  }

  // 3. Try live fetch directly from tv.nontondrama.vip
  const url = `${NONTONDRAMA_BASE}/${cleanEpSlug}`;
  try {
    const html = await curlFetch(url);

    const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*>([^<]+)<\/h1>/) ||
                       html.match(/<title>([^<]+)<\/title>/);
    let title = titleMatch ? titleMatch[1].replace(/^Lk21\s*Nonton\s*/i, '').replace(/Sub\s*Indo.*$/i, '').trim() : cleanEpSlug;

    // Player servers list
    const servers = [];
    const playerListMatch = html.match(/<ul[^>]*id="player-list"[^>]*>([\s\S]*?)<\/ul>/i);

    if (playerListMatch) {
      const serverRegex = /<a[^>]*data-url="([^"]+)"[^>]*data-server="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let sm;
      while ((sm = serverRegex.exec(playerListMatch[1])) !== null) {
        const serverType = sm[2].toLowerCase();
        const embedUrl = sm[1];
        const isP2P = serverType === 'p2p';
        servers.push({
          name: isP2P ? 'Server Direct HD (P2P)' : `Server ${sm[3].toUpperCase()}`,
          serverType,
          embedUrl,
          directStreamUrl: `/api/movies/lk21/stream.m3u8?embedUrl=${encodeURIComponent(embedUrl)}`,
          embedProxyUrl: `/api/movies/lk21/embed-frame?url=${encodeURIComponent(embedUrl)}`
        });
      }
    }

    // Sort servers so Server P2P is first
    servers.sort((a, b) => {
      if (a.serverType === 'p2p') return -1;
      if (b.serverType === 'p2p') return 1;
      return 0;
    });

    if (servers.length > 0) {
      const primary = servers[0];
      const streamUrl = primary ? primary.directStreamUrl : '';

      const result = {
        slug: cleanEpSlug,
        title,
        streamUrl,
        servers
      };

      episodeCache.set(cleanEpSlug, {
        timestamp: Date.now(),
        data: result
      });

      return result;
    }
  } catch (error) {
    console.warn(`curlFetch error for episode ${cleanEpSlug}:`, error.message);
  }

  // 4. If episode wasn't individually crawled, check if we have another episode for this series in cache
  const epMatch = cleanEpSlug.match(/^(.*?)-season-(\d+)-episode-(\d+)/i);
  const seriesSlug = epMatch ? epMatch[1] : cleanEpSlug;
  const seasonNum = epMatch ? epMatch[2] : '1';
  const epNum = epMatch ? epMatch[3] : '1';

  const sInfo = nontondramaRealCache.series?.[seriesSlug];
  const seriesTitle = sInfo?.title || seriesSlug.replace(/-(19\d\d|20\d\d)$/, '').replace(/-/g, ' ');

  // Try finding any cached episode of this series to use its server structure as reference
  const anyEpKey = Object.keys(nontondramaRealCache.episodes || {}).find(k => k.startsWith(seriesSlug));
  if (anyEpKey && nontondramaRealCache.episodes[anyEpKey]?.servers?.length > 0) {
    const refEp = nontondramaRealCache.episodes[anyEpKey];
    return {
      slug: cleanEpSlug,
      title: `${seriesTitle} - Season ${seasonNum} Episode ${epNum}`,
      streamUrl: refEp.servers[0]?.directStreamUrl || '',
      servers: refEp.servers
    };
  }

  return {
    slug: cleanEpSlug,
    title: `${seriesTitle} - Season ${seasonNum} Episode ${epNum}`,
    streamUrl: '',
    servers: []
  };
}
