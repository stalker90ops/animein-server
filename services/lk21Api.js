import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const LK21_BASE = 'https://tv12.lk21official.cc';
const LK21_SEARCH_API = 'https://gudangvape.com/search.php';
const LK21_POSTER_BASE = 'https://poster.assetsy.de/wp-content/uploads/';

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

// Helper to normalize genre name to LK21 URL slug
function toLk21GenreSlug(g) {
  if (!g) return '';
  const clean = g.trim().toLowerCase();
  if (clean === 'music') return 'musical';
  if (clean === 'sci-fi' || clean === 'scifi') return 'sci-fi';
  return clean.replace(/\s+/g, '-');
}

// In-memory cache for resolved stream URLs (TTL: 2 hours)
const streamCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// Helper to execute fetch with browser user-agent
async function curlFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': `${LK21_BASE}/`
      },
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      return await res.text();
    }
  } catch (err) {
    // Fall back to CLI curl if fetch fails
  }

  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const cmd = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

// Parse movie article elements from HTML
function parseArticles(html) {
  const articles = [];
  const articleRegex = /<article[^>]*itemtype="https:\/\/schema\.org\/Movie"[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const art = match[1];

    const urlMatch = art.match(/href="([^"]+)"/);
    const titleMatch = art.match(/itemprop="name"[^>]*>([^<]+)<\/h3>/) ||
                       art.match(/class="poster-title"[^>]*>([^<]+)<\/h3>/) ||
                       art.match(/itemprop="name"[^>]*>([^<]+)<\/span>/) ||
                       art.match(/alt="([^"]+)"/);
    const imgMatch = art.match(/<img[^>]*\bdata-src="(https?:\/\/[^"]+)"/i) ||
                     art.match(/<source[^>]*type="image\/jpeg"[^>]*\b(?:data-srcset|srcset)="(https?:\/\/[^"\s]+)"/i) ||
                     art.match(/<img[^>]*\bsrc="(https?:\/\/[^"]+)"/i) ||
                     art.match(/data-src="([^"]+)"/) ||
                     art.match(/src="([^"]+)"/);
    const ratingMatch = art.match(/itemprop="ratingValue">([^<]+)<\/span>/) ||
                        art.match(/class="rating"[^>]*>[\s\S]*?(\d+(?:\.\d+)?)[\s\S]*?<\/span>/);
    const genreMatch = art.match(/itemprop="genre"\s+content="([^"]+)"/) ||
                       art.match(/class="genre"[^>]*>([^<]+)<\/div>/);
    const yearMatch = art.match(/class="year"[^>]*>([^<]+)<\/span>/);
    const qualityMatch = art.match(/class="label label-([^"]+)"/);

    if (urlMatch && titleMatch) {
      const rawUrl = urlMatch[1];
      const slug = rawUrl.replace(/^\//, '').replace(/\/$/, '');
      // Skip series items when on movie listings if needed, or keep clean title
      const rawTitle = decodeEntities(titleMatch[1].trim());
      const rawQuality = qualityMatch ? qualityMatch[1].toUpperCase() : 'HD';
      const isTrailer = rawQuality.toLowerCase().includes('trailer') || 
                        rawTitle.toLowerCase().includes('trailer') ||
                        slug.toLowerCase().includes('trailer') ||
                        slug.toLowerCase().includes('teaser') ||
                        /label-trailer/i.test(art) ||
                        /class="label[^"]*trailer/i.test(art);

      const yearVal = yearMatch ? yearMatch[1].trim() : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');
      const cleanTitle = yearVal && !rawTitle.includes(`(${yearVal})`) ? `${rawTitle} (${yearVal})` : rawTitle;

      articles.push({
        id: `lk21_${slug}`,
        source: 'lk21',
        slug,
        title: cleanTitle,
        poster: imgMatch ? imgMatch[1] : '',
        rating: ratingMatch ? ratingMatch[1].trim() : '7.5',
        genres: genreMatch ? genreMatch[1].trim() : 'Action, Drama',
        year: yearVal,
        quality: rawQuality,
        isTrailer,
        url: `${LK21_BASE}/${slug}`
      });
    }
  }

  return articles;
}

// 1. Get LK21 Movie List by category, genre(s), year, or search (filters out trailers by default)
export async function getLk21Movies({ category = 'populer', genre = '', genres = '', page = 1, includeTrailers = false, year = '', search = '' } = {}) {
  const genreList = (genres || genre || '')
    .split(',')
    .map(g => g.trim())
    .filter(g => g && g !== 'All');

  // Direct JSON Search via LK21's gudangvape search API
  if (search && search.trim()) {
    try {
      const searchUrl = `${LK21_SEARCH_API}?s=${encodeURIComponent(search.trim())}&page=${page || 1}`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': LK21_BASE,
          'Referer': `${LK21_BASE}/`
        },
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const json = await res.json();
        const items = json?.data || json?.items || [];
        let list = items
          .filter(item => !item.type || item.type === 'movie')
          .map(item => {
            const slug = String(item.slug || '').replace(/^\//, '').replace(/\/$/, '');
            const rawTitle = decodeEntities(item.title || slug);
            const rawQuality = String(item.quality || 'HD').toUpperCase();
            const isTrailer = rawQuality.toLowerCase().includes('trailer') ||
                              rawTitle.toLowerCase().includes('trailer') ||
                              slug.toLowerCase().includes('trailer') ||
                              slug.toLowerCase().includes('teaser');
            const posterUrl = item.poster
              ? (item.poster.startsWith('http') ? item.poster : `${LK21_POSTER_BASE}${item.poster.replace(/^\//, '')}`)
              : '';
            const itemYear = item.year ? String(item.year) : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');

            return {
              id: `lk21_${slug}`,
              source: 'lk21',
              slug,
              title: rawTitle,
              poster: posterUrl,
              rating: item.rating && Number(item.rating) > 0 ? String(item.rating) : '7.5',
              genres: genreList.length > 0 ? genreList.join(', ') : 'Movie, LK21',
              year: itemYear,
              quality: rawQuality || 'HD',
              isTrailer,
              url: `${LK21_BASE}/${slug}`
            };
          });

        if (year && /^\d{4}$/.test(String(year))) {
          list = list.filter(m => String(m.year) === String(year) || m.title.includes(String(year)));
        }
        if (!includeTrailers) {
          list = list.filter(m => !m.isTrailer);
        }
        return list;
      }
    } catch (err) {
      console.error('Error in LK21 JSON search API:', err.message);
    }
  }

  // Build native LK21 multi-filter or category URL
  const hasMultiFilter = (genreList.length >= 2) || (genreList.length >= 1 && year && /^\d{4}$/.test(String(year)));
  let targetUrl = LK21_BASE;

  if (hasMultiFilter) {
    const baseOrder = category === 'rating' ? 'rating' : category === 'latest' ? 'latest' : category === 'release' ? 'release' : 'populer';
    let pathParts = [baseOrder, 'type', 'movie'];
    if (genreList[0]) pathParts.push('genre1', toLk21GenreSlug(genreList[0]));
    if (genreList[1]) pathParts.push('genre2', toLk21GenreSlug(genreList[1]));
    if (year && /^\d{4}$/.test(String(year))) pathParts.push('year', String(year));
    if (page > 1) pathParts.push('page', String(page));
    targetUrl = `${LK21_BASE}/${pathParts.join('/')}/`;
  } else if (year && /^\d{4}$/.test(String(year))) {
    targetUrl = `${LK21_BASE}/year/${year}/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (genreList.length === 1) {
    const cleanGenre = toLk21GenreSlug(genreList[0]);
    targetUrl = `${LK21_BASE}/genre/${cleanGenre}/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'rating') {
    targetUrl = `${LK21_BASE}/rating/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'latest') {
    targetUrl = `${LK21_BASE}/latest/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'release') {
    targetUrl = `${LK21_BASE}/release/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else {
    targetUrl = `${LK21_BASE}/populer/`;
    if (page > 1) targetUrl += `page/${page}/`;
  }

  try {
    const html = await curlFetch(targetUrl);
    let list = parseArticles(html);

    // If user selected 3+ genres, filter remaining genres in-memory against full itemprop="genre"
    if (genreList.length > 2) {
      list = list.filter(m =>
        genreList.slice(2).every(g => (m.genres || '').toLowerCase().includes(g.toLowerCase()))
      );
    }
    if (year && /^\d{4}$/.test(String(year))) {
      list = list.filter(m => !m.year || String(m.year) === String(year) || m.title.includes(String(year)));
    }

    if (!list || list.length === 0) {
      // Fall back to direct LK21 JSON API
      const searchTerms = ['a', 'the', '2025', '2026', '2024'];
      const term = searchTerms[(page - 1) % searchTerms.length] || 'a';
      const searchRes = await fetch(`${LK21_SEARCH_API}?s=${term}&page=${page || 1}`, {
        headers: {
          'Origin': LK21_BASE,
          'Referer': `${LK21_BASE}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (searchRes && searchRes.ok) {
        const json = await searchRes.json().catch(() => null);
        const items = json?.data || json?.items || [];
        list = items
          .filter(item => !item.type || item.type === 'movie')
          .map(item => {
            const slug = String(item.slug || '').replace(/^\//, '').replace(/\/$/, '');
            const rawTitle = decodeEntities(item.title || slug);
            const posterUrl = item.poster
              ? (item.poster.startsWith('http') ? item.poster : `${LK21_POSTER_BASE}${item.poster.replace(/^\//, '')}`)
              : '';
            const itemYear = item.year ? String(item.year) : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');
            return {
              id: `lk21_${slug}`,
              source: 'lk21',
              slug,
              title: rawTitle,
              poster: posterUrl,
              rating: item.rating && Number(item.rating) > 0 ? String(item.rating) : '7.5',
              genres: genreList.length > 0 ? genreList.join(', ') : 'Movie, LK21',
              year: itemYear,
              quality: String(item.quality || 'HD').toUpperCase(),
              isTrailer: false,
              url: `${LK21_BASE}/${slug}`
            };
          });
      }
    }

    if (!includeTrailers) {
      return list.filter(m => !m.isTrailer);
    }
    return list;
  } catch (error) {
    console.error(`Error fetching LK21 movies (${targetUrl}):`, error.message);
    return [];
  }
}

// 2. Resolve direct HLS m3u8 stream from LK21 embed URL
export async function resolveLk21Stream(embedUrl) {
  if (!embedUrl) return null;

  // Check cache first
  const cached = streamCache.get(embedUrl);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.fileUrl;
  }

  // If already an m3u8 URL, return directly
  if (embedUrl.includes('.m3u8')) {
    return embedUrl;
  }

  try {
    // Expected format: https://videonode.de/iframe3/{host}/{id}
    const m = embedUrl.match(/iframe3\/([^/]+)\/([^/?]+)/);
    if (!m) return null;

    const host = m[1];
    const id = m[2];

    // Step 1: POST to videonode.de/api.php
    const res1 = await fetch('https://videonode.de/api.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://videonode.de/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `host=${encodeURIComponent(host)}&id=${encodeURIComponent(id)}`,
      signal: AbortSignal.timeout(10000)
    });

    if (!res1.ok) {
      console.warn(`videonode.de returned HTTP ${res1.status}`);
      return null;
    }

    const data1 = await res1.json();
    if (!data1?.embedUrl) return null;

    // Step 2: Extract playcdn slug if available
    const slugMatch = data1.embedUrl.match(/playcdn\.de\/([^/?]+)/);
    if (!slugMatch) {
      // If videonode resolved to external provider (like abyssplayer or mfw09)
      return null;
    }

    const slug = slugMatch[1];

    // Step 3: GET https://playcdn.de/verify/{slug}
    const res2 = await fetch(`https://playcdn.de/verify/${slug}`, {
      headers: {
        'Referer': 'https://playcdn.de/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res2.ok) return null;

    const data2 = await res2.json();
    if (data2?.status === 'success' && data2?.fileUrl) {
      streamCache.set(embedUrl, {
        fileUrl: data2.fileUrl,
        title: data2.title,
        timestamp: Date.now()
      });
      return data2.fileUrl;
    }

    return null;
  } catch (error) {
    console.error('Error resolving LK21 stream:', error.message);
    return null;
  }
}

// 3. Get LK21 Movie Details & Streaming Servers
export async function getLk21MovieDetail(slug) {
  const url = `${LK21_BASE}/${slug}`;
  try {
    const html = await curlFetch(url);

    // Isolate the main movie section BEFORE any related movies slider (<div class="mob-related... or <article)
    // so we NEVER accidentally match posters, years, ratings, or labels from random related movie cards
    const mainHtml = html.split(/<div[^>]*class="mob-related|<div[^>]*id="you-may-wrapper|<article\b/i)[0] || html;

    // Title
    const titleMatch =
      mainHtml.match(/<div[^>]*class="movie-info"[^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      mainHtml.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
      mainHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch
      ? decodeEntities(
          titleMatch[1]
            .replace(/<[^>]+>/g, '')
            .replace(/^Lk21\s*Nonton\s*/i, '')
            .replace(/^Nonton\s*(?:Film)?\s*/i, '')
            .replace(/\s*Sub\s*Indo.*$/i, '')
            .replace(/\s*\|\s*.*$/i, '')
            .trim()
        )
      : slug;

    // Synopsis (from <div class="synopsis ..."> inside mainHtml, never from unrelated widgets)
    const synDataFull = mainHtml.match(/<div[^>]*class="synopsis[^"]*"[^>]*data-full="([^"]+)"/i);
    const synDivMatch =
      mainHtml.match(/<div[^>]*class="synopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      mainHtml.match(/<blockquote[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/blockquote>/i) ||
      mainHtml.match(/<div[^>]*class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
    let synopsis = '';
    if (synDataFull && synDataFull[1]) {
      synopsis = decodeEntities(
        synDataFull[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
      );
    } else if (synDivMatch && synDivMatch[1]) {
      synopsis = decodeEntities(
        synDivMatch[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      );
    }
    if (!synopsis) {
      const ogDesc =
        html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
        html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
      if (ogDesc && ogDesc[1]) {
        synopsis = decodeEntities(ogDesc[1].trim());
      }
    }

    // Poster (Prioritize og:image, twitter:image, and meta-info itemprop="image" — NEVER related movie .poster cards)
    const posterMatch =
      html.match(/<meta[^>]*property="og:image"[^>]*content="(https?:\/\/[^"]+)"/i) ||
      html.match(/<meta[^>]*content="(https?:\/\/[^"]+)"[^>]*property="og:image"/i) ||
      html.match(/<meta[^>]*name="twitter:image"[^>]*content="(https?:\/\/[^"]+)"/i) ||
      mainHtml.match(/<div[^>]*class="meta-info"[\s\S]*?<img[^>]*(?:data-src|src)="(https?:\/\/[^"]+)"/i) ||
      mainHtml.match(/<img[^>]*itemprop="image"[^>]*(?:data-src|src)="(https?:\/\/[^"]+)"/i) ||
      mainHtml.match(/<source[^>]*type="image\/jpeg"[^>]*\b(?:data-srcset|srcset)="(https?:\/\/[^"\s]+)"/i);
    const poster = posterMatch ? posterMatch[1].trim() : '';

    // Rating
    const ratingMatch =
      mainHtml.match(/class="rating-number"[^>]*>([^<]+)<\/span>/i) ||
      mainHtml.match(/data-base-rating="([^"]+)"/i) ||
      mainHtml.match(/itemprop="ratingValue"[^>]*>([^<]+)<\/span>/i);
    const rating = ratingMatch ? ratingMatch[1].trim() : '7.8';

    // Year
    const yearMatch =
      title.match(/\((\d{4})\)/) ||
      mainHtml.match(/<span>Release:\s*<\/span>[^<]*?\b(19\d\d|20\d\d)\b/i) ||
      mainHtml.match(/<div[^>]*class="info-tag"[\s\S]*?\b(19\d\d|20\d\d)\b/i) ||
      slug.match(/-(\d{4})$/);
    const year = yearMatch ? yearMatch[1].trim() : '';

    // Genres & Country from .tag-list in mainHtml
    const tagListMatch = mainHtml.match(/<div[^>]*class="tag-list"[^>]*>([\s\S]*?)<\/div>/i);
    let genres = '';
    let country = '';
    if (tagListMatch) {
      const gMatches = [...tagListMatch[1].matchAll(/href="\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi)];
      if (gMatches.length > 0) {
        genres = gMatches.map(m => decodeEntities(m[1].trim())).join(', ');
      }
      const cMatches = [...tagListMatch[1].matchAll(/href="\/country\/[^"]+"[^>]*>([^<]+)<\/a>/gi)];
      if (cMatches.length > 0) {
        country = cMatches.map(m => decodeEntities(m[1].trim())).join(', ');
      }
    }
    if (!genres) genres = 'Action, Film Bioskop';

    // Quality & Duration from .info-tag in mainHtml (note: .info-tag contains nested <div class="broken-line"></div>)
    const infoTagMatch = mainHtml.match(/<div[^>]*class="info-tag"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:tag-list|movie-action|rating-box)")/i);
    let rawQuality = 'HD';
    let duration = '';
    if (infoTagMatch) {
      const spans = [...infoTagMatch[1].matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map(m => m[1].trim());
      const qParts = spans.filter(s => /^(WEBDL|BLURAY|HD|CAM|HDCAM|HDRIP|TVRIP|DVDRIP|TRAILER|4K|\d{3,4}p)$/i.test(s));
      if (qParts.length > 0) {
        rawQuality = qParts.join(' ').toUpperCase();
      }
      const durSpan = spans.find(s => /\d+\s*h|\d+\s*m/i.test(s) && !/^\d{3,4}p$/i.test(s));
      if (durSpan) duration = durSpan;
    }

    // Extract Director & Cast from .detail inside mainHtml
    const directorMatches = [...mainHtml.matchAll(/href="\/director\/[^"]+"[^>]*>([^<]+)<\/a>/gi)];
    const director = directorMatches.map(m => decodeEntities(m[1].trim())).join(', ');
    const castMatches = [...mainHtml.matchAll(/href="\/artist\/[^"]+"[^>]*>([^<]+)<\/a>/gi)];
    const cast = castMatches.map(m => decodeEntities(m[1].trim())).join(', ');

    const isTrailer =
      rawQuality.toLowerCase().includes('trailer') ||
      title.toLowerCase().includes('trailer') ||
      slug.toLowerCase().includes('trailer') ||
      slug.toLowerCase().includes('teaser');

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
          directStreamUrl: isP2P ? `/api/movies/lk21/stream.m3u8?embedUrl=${encodeURIComponent(embedUrl)}` : null,
          embedProxyUrl: `/api/movies/lk21/embed-frame?url=${encodeURIComponent(embedUrl)}`
        });
      }
    }

    // Fallback main player iframe
    if (!servers.length) {
      const iframeMatch = html.match(/<iframe[^>]*id="main-player"[^>]*src="([^"]+)"/i) ||
                          html.match(/<iframe[^>]*src="([^"]*(?:videonode|embed|player)[^"]*)"/i);
      if (iframeMatch) {
        const embedUrl = iframeMatch[1];
        servers.push({
          name: 'Server Direct HD (P2P)',
          serverType: 'p2p',
          embedUrl,
          directStreamUrl: `/api/movies/lk21/stream.m3u8?embedUrl=${encodeURIComponent(embedUrl)}`,
          embedProxyUrl: `/api/movies/lk21/embed-frame?url=${encodeURIComponent(embedUrl)}`
        });
      }
    }

    // Sort servers so Server P2P (direct streamable) is always first
    servers.sort((a, b) => {
      if (a.serverType === 'p2p') return -1;
      if (b.serverType === 'p2p') return 1;
      return 0;
    });

    // Fallback when LK21 HTML is blocked by Cloudflare on datacenter IPs (e.g. Vercel)
    let finalTitle = title;
    let finalSynopsis = synopsis;
    let finalPoster = poster;
    let finalRating = rating;
    let finalYear = year;
    let finalQuality = rawQuality;
    let finalDuration = duration;
    let finalCast = cast;

    const isCloudflareBlocked =
      !finalTitle ||
      finalTitle.toLowerCase().includes('just a moment') ||
      finalTitle.toLowerCase().includes('attention required') ||
      servers.length === 0;

    if (isCloudflareBlocked) {
      const searchWords = slug
        .replace(/-(19\d\d|20\d\d)$/, '')
        .replace(/-/g, ' ')
        .trim();

      try {
        const searchRes = await fetch(`${LK21_SEARCH_API}?s=${encodeURIComponent(searchWords)}`, {
          headers: {
            'Origin': LK21_BASE,
            'Referer': `${LK21_BASE}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(8000)
        });
        if (searchRes.ok) {
          const json = await searchRes.json().catch(() => null);
          const items = json?.data || json?.items || [];
          const matched =
            items.find(it => String(it.slug || '').replace(/^\//, '').replace(/\/$/, '') === slug) ||
            items[0];
          if (matched) {
            finalTitle = decodeEntities(matched.title || searchWords);
            if (matched.poster) {
              finalPoster = matched.poster.startsWith('http')
                ? matched.poster
                : `${LK21_POSTER_BASE}${matched.poster.replace(/^\//, '')}`;
            }
            if (matched.rating && Number(matched.rating) > 0) {
              finalRating = String(matched.rating);
            }
            if (matched.year) {
              finalYear = String(matched.year);
            }
            if (matched.quality) {
              finalQuality = String(matched.quality).toUpperCase();
            }
            if (matched.runtime) {
              finalDuration = String(matched.runtime);
            }
          }
        }
      } catch (e) {
        // ignore search fallback error
      }

      if (!finalTitle || finalTitle.toLowerCase().includes('just a moment')) {
        finalTitle = searchWords.replace(/\b\w/g, c => c.toUpperCase());
      }

      const cleanMovieName = finalTitle.replace(/\(\d{4}\)/g, '').trim();
      let imdbId = '';
      try {
        const imdbQuery = `${cleanMovieName} ${finalYear}`.trim().toLowerCase();
        const firstChar = (imdbQuery[0] || 'a').replace(/[^a-z0-9]/, 'a');
        const imdbRes = await fetch(
          `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(imdbQuery)}.json`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (imdbRes.ok) {
          const imdbJson = await imdbRes.json().catch(() => null);
          const candidates = (imdbJson?.d || []).filter(item => item.id && item.id.startsWith('tt'));
          const best =
            candidates.find(item => !finalYear || String(item.y) === String(finalYear)) ||
            candidates[0];
          if (best) {
            imdbId = best.id;
            if (!finalCast && best.s) finalCast = best.s;
            if (!finalPoster && best.i?.imageUrl) finalPoster = best.i.imageUrl;
            if (!finalYear && best.y) finalYear = String(best.y);
          }
        }
      } catch (e) {
        // ignore IMDb lookup error
      }

      if (!finalSynopsis) {
        finalSynopsis = `Tonton film ${finalTitle}${finalYear ? ` (${finalYear})` : ''} kualitas ${finalQuality} dengan subtitle Indonesia.${finalCast ? ` Dibintangi oleh ${finalCast}.` : ''}`;
      }

      if (servers.length === 0) {
        if (imdbId) {
          servers.push(
            {
              name: 'Server VidSrc HD (Auto Sub)',
              serverType: 'vidsrc',
              embedUrl: `https://vidsrc.cc/v2/embed/movie/${imdbId}`,
              directStreamUrl: null,
              embedProxyUrl: `https://vidsrc.cc/v2/embed/movie/${imdbId}`
            },
            {
              name: 'Server VidSrc Pro (Sub Indo)',
              serverType: 'vidsrc_xyz',
              embedUrl: `https://vidsrc.xyz/embed/movie?imdb=${imdbId}&ds_lang=id`,
              directStreamUrl: null,
              embedProxyUrl: `https://vidsrc.xyz/embed/movie?imdb=${imdbId}&ds_lang=id`
            },
            {
              name: 'Server MultiEmbed VIP',
              serverType: 'multiembed',
              embedUrl: `https://multiembed.mov/?video_id=${imdbId}`,
              directStreamUrl: null,
              embedProxyUrl: `https://multiembed.mov/?video_id=${imdbId}`
            },
            {
              name: 'Server AutoEmbed HD',
              serverType: 'autoembed',
              embedUrl: `https://player.autoembed.cc/embed/movie/${imdbId}`,
              directStreamUrl: null,
              embedProxyUrl: `https://player.autoembed.cc/embed/movie/${imdbId}`
            }
          );
        } else {
          const fallbackEmbed = `https://vidsrc.xyz/embed/movie?imdb=${encodeURIComponent(cleanMovieName)}`;
          servers.push({
            name: 'Server Global Stream HD',
            serverType: 'embed',
            embedUrl: fallbackEmbed,
            directStreamUrl: null,
            embedProxyUrl: fallbackEmbed
          });
        }
      }
    }

    // Primary stream URL for immediate direct playback
    const primaryServer = servers[0];
    const streamUrl = primaryServer ? (primaryServer.directStreamUrl || '') : '';

    return {
      id: `lk21_${slug}`,
      source: 'lk21',
      slug,
      title: finalTitle,
      synopsis: finalSynopsis,
      poster: finalPoster,
      banner: finalPoster,
      rating: finalRating,
      year: finalYear,
      genres,
      country,
      duration: finalDuration,
      director,
      cast: finalCast,
      url,
      quality: finalQuality,
      isTrailer,
      streamUrl,
      servers
    };
  } catch (error) {
    console.error(`Error fetching LK21 detail (${slug}):`, error.message);
    throw error;
  }
}
