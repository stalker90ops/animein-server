import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const NONTONDRAMA_BASE = 'https://tv.nontondrama.vip';
const NONTONDRAMA_SEARCH_API = 'https://gudangvape.com/search.php';
const NONTONDRAMA_POSTER_BASE = 'https://poster.assetsy.de/wp-content/uploads/';

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
  const cmd = `curl.exe -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
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
                        art.match(/class="rating"[^>]*>[\s\S]*?(\d+(?:\.\d+)?)[\s\S]*?<\/span>/);
    const genreMatch = art.match(/itemprop="genre"\s+content="([^"]+)"/) ||
                       art.match(/class="genre"[^>]*>([^<]+)<\/div>/);
    const yearMatch = art.match(/class="year"[^>]*>([^<]+)<\/span>/);
    const epMatch = art.match(/class="episode[^"]*">([\s\S]*?)<\/span>/);
    const durationMatch = art.match(/class="duration"[^>]*>([^<]+)<\/span>/);

    if (urlMatch && titleMatch) {
      const rawUrl = urlMatch[1];
      const slug = rawUrl.replace(/^\//, '').replace(/\/$/, '');
      const rawTitle = decodeEntities(titleMatch[1].replace(/Sub\s*Indo.*$/i, '').trim());

      // Clean episode badge
      let episodeText = '';
      if (epMatch) {
        episodeText = epMatch[1].replace(/<[^>]+>/g, '').trim(); // e.g. "EPS9"
      }
      const seasonText = durationMatch ? durationMatch[1].trim() : ''; // e.g. "S.10"
      const yearVal = yearMatch ? yearMatch[1].trim() : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');

      articles.push({
        id: `series_${slug}`,
        source: 'nontondrama',
        type: 'series',
        slug,
        title: rawTitle,
        poster: imgMatch ? imgMatch[1] : '',
        rating: ratingMatch ? ratingMatch[1].trim() : '8.0',
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

// 1. Get Series List from tv.nontondrama.vip
export async function getNontondramaSeries({ category = 'latest', genre = '', genres = '', year = '', page = 1, search = '' } = {}) {
  const genreList = (genres || genre || '')
    .split(',')
    .map(g => g.trim())
    .filter(g => g && g !== 'All');

  // Direct JSON Search via gudangvape search API
  if (search && search.trim()) {
    try {
      const searchUrl = `${NONTONDRAMA_SEARCH_API}?s=${encodeURIComponent(search.trim())}&page=${page || 1}`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': NONTONDRAMA_BASE,
          'Referer': `${NONTONDRAMA_BASE}/`
        },
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const json = await res.json();
        const items = json?.data || json?.items || [];
        let list = items
          .filter(item => item.type === 'series' || Number(item.episode) > 0 || Number(item.season) > 0)
          .map(item => {
            const slug = String(item.slug || '').replace(/^\//, '').replace(/\/$/, '');
            const rawTitle = decodeEntities((item.title || slug).replace(/\s*-\s*Series$/i, '').trim());
            const posterUrl = item.poster
              ? (item.poster.startsWith('http') ? item.poster : `${NONTONDRAMA_POSTER_BASE}${item.poster.replace(/^\//, '')}`)
              : '';
            const itemYear = item.year ? String(item.year) : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');

            return {
              id: `series_${slug}`,
              source: 'nontondrama',
              type: 'series',
              slug,
              title: rawTitle,
              poster: posterUrl,
              rating: item.rating && Number(item.rating) > 0 ? String(item.rating) : '8.0',
              genres: genreList.length > 0 ? genreList.join(', ') : 'Drama, Series',
              year: itemYear,
              episodeBadge: item.episode ? `EPS${item.episode}` : '',
              seasonBadge: item.season ? `S.${item.season}` : '',
              url: `${NONTONDRAMA_BASE}/${slug}`
            };
          });

        if (year && /^\d{4}$/.test(String(year))) {
          list = list.filter(m => String(m.year) === String(year) || m.title.includes(String(year)));
        }
        return list;
      }
    } catch (err) {
      console.error('Error in NontonDrama JSON search API:', err.message);
    }
  }

  // Build native NontonDrama multi-filter or category URL
  const hasMultiFilter = (genreList.length >= 2) || (year && /^\d{4}$/.test(String(year)));
  let targetUrl = `${NONTONDRAMA_BASE}/latest-series/`;

  if (hasMultiFilter) {
    const baseOrder = category === 'top' || category === 'populer' ? 'populer' : category === 'rating' ? 'rating' : category === 'release' ? 'release' : 'latest';
    let pathParts = [baseOrder, 'type', 'series'];
    if (genreList[0]) pathParts.push('genre1', toSeriesGenreSlug(genreList[0]));
    if (genreList[1]) pathParts.push('genre2', toSeriesGenreSlug(genreList[1]));
    if (category === 'drakor') pathParts.push('country', 'south-korea');
    else if (category === 'west') pathParts.push('country', 'usa');
    else if (category === 'asian') pathParts.push('country', 'china');
    if (year && /^\d{4}$/.test(String(year))) pathParts.push('year', String(year));
    if (page > 1) pathParts.push('page', String(page));
    targetUrl = `${NONTONDRAMA_BASE}/${pathParts.join('/')}/`;
  } else if (genreList.length === 1) {
    const cleanGenre = toSeriesGenreSlug(genreList[0]);
    targetUrl = `${NONTONDRAMA_BASE}/genre/${cleanGenre}/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'top') {
    targetUrl = `${NONTONDRAMA_BASE}/top-series-today/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'drakor') {
    targetUrl = `${NONTONDRAMA_BASE}/maraton-drakor/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'asian') {
    targetUrl = `${NONTONDRAMA_BASE}/series/asian/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'west') {
    targetUrl = `${NONTONDRAMA_BASE}/series/west/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'ongoing') {
    targetUrl = `${NONTONDRAMA_BASE}/series/ongoing/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else if (category === 'complete') {
    targetUrl = `${NONTONDRAMA_BASE}/series/complete/`;
    if (page > 1) targetUrl += `page/${page}/`;
  } else {
    if (page > 1) targetUrl = `${NONTONDRAMA_BASE}/latest-series/page/${page}/`;
  }

  try {
    const html = await curlFetch(targetUrl);
    let list = parseSeriesArticles(html);
    if (genreList.length > 2) {
      list = list.filter(m =>
        genreList.slice(2).every(g => (m.genres || '').toLowerCase().includes(g.toLowerCase()))
      );
    }
    if (year && /^\d{4}$/.test(String(year))) {
      list = list.filter(m => !m.year || String(m.year) === String(year) || m.title.includes(String(year)));
    }
    return list;
  } catch (error) {
    console.error(`Error fetching nontondrama series (${targetUrl}):`, error.message);
    return [];
  }
}

// 2. Get Series Detail & Full Season/Episode Tree
export async function getNontondramaDetail(slug) {
  const url = `${NONTONDRAMA_BASE}/${slug}`;
  try {
    const html = await curlFetch(url);

    // Isolate main series info BEFORE any related series slider (<div class="mob-related... or <article)
    const mainHtml = html.split(/<div[^>]*class="mob-related|<div[^>]*id="you-may-wrapper|<article\b/i)[0] || html;

    // Meta / Basic info
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
            .replace(/^Nonton\s*(?:Series|Drama|Serial)?\s*/i, '')
            .replace(/\s*Sub\s*Indo.*$/i, '')
            .replace(/\s*Series$/i, '')
            .replace(/\s*\|\s*.*$/i, '')
            .trim()
        )
      : slug;

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

    const posterMatch =
      html.match(/<meta[^>]*property="og:image"[^>]*content="(https?:\/\/[^"]+)"/i) ||
      html.match(/<meta[^>]*content="(https?:\/\/[^"]+)"[^>]*property="og:image"/i) ||
      html.match(/<meta[^>]*name="twitter:image"[^>]*content="(https?:\/\/[^"]+)"/i) ||
      mainHtml.match(/<div[^>]*class="meta-info"[\s\S]*?<img[^>]*(?:data-src|src)="(https?:\/\/[^"]+)"/i) ||
      mainHtml.match(/<img[^>]*itemprop="image"[^>]*(?:data-src|src)="(https?:\/\/[^"]+)"/i) ||
      mainHtml.match(/<source[^>]*type="image\/jpeg"[^>]*\b(?:data-srcset|srcset)="(https?:\/\/[^"\s]+)"/i);
    const poster = posterMatch ? posterMatch[1].trim() : '';

    const ratingMatch =
      mainHtml.match(/class="rating-number"[^>]*>([^<]+)<\/span>/i) ||
      mainHtml.match(/data-base-rating="([^"]+)"/i) ||
      mainHtml.match(/itemprop="ratingValue"[^>]*>([^<]+)<\/span>/i);

    const yearMatch =
      title.match(/\((\d{4})\)/) ||
      mainHtml.match(/<span>Release:\s*<\/span>[^<]*?\b(19\d\d|20\d\d)\b/i) ||
      mainHtml.match(/<div[^>]*class="info-tag"[\s\S]*?\b(19\d\d|20\d\d)\b/i) ||
      slug.match(/-(\d{4})$/);

    const tagListMatch = mainHtml.match(/<div[^>]*class="tag-list"[^>]*>([\s\S]*?)<\/div>/i);
    let genres = '';
    if (tagListMatch) {
      const gMatches = [...tagListMatch[1].matchAll(/href="\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi)];
      if (gMatches.length > 0) {
        genres = gMatches.map(m => decodeEntities(m[1].trim())).join(', ');
      }
    }
    if (!genres) genres = 'Drama, Series';

    // Extract Episodes JSON from embedded script
    let episodesBySeason = {};
    const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const s of scriptMatches) {
      const content = s[1].trim();
      if (content.includes('"episode_no"')) {
        try {
          // Check if clean JSON
          if (content.startsWith('{') && content.endsWith('}')) {
            episodesBySeason = JSON.parse(content);
          } else {
            const jsonMatch = content.match(/(\{["\d]+:\s*\[[\s\S]*?\]\})/);
            if (jsonMatch) {
              episodesBySeason = JSON.parse(jsonMatch[1]);
            }
          }
        } catch (e) {
          // ignore json parse error
        }
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

    // Count total episodes
    let totalEpisodesCount = 0;
    for (const eps of Object.values(episodesBySeason)) {
      totalEpisodesCount += (eps?.length || 0);
    }

    return {
      id: `series_${slug}`,
      source: 'nontondrama',
      type: 'series',
      slug,
      title,
      synopsis,
      poster,
      banner: poster,
      genres,
      rating: ratingMatch ? ratingMatch[1].trim() : '8.0',
      year: yearMatch ? yearMatch[1].trim() : '',
      totalSeasons: Object.keys(episodesBySeason).length,
      totalEpisodes: totalEpisodesCount,
      seasons: episodesBySeason,
      url
    };
  } catch (error) {
    console.error(`Error fetching nontondrama series detail (${slug}):`, error.message);
    throw error;
  }
}

// 3. Get Episode Stream Servers
export async function getNontondramaEpisode(episodeSlug) {
  const url = `${NONTONDRAMA_BASE}/${episodeSlug}`;
  try {
    const html = await curlFetch(url);

    const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*>([^<]+)<\/h1>/) ||
                       html.match(/<title>([^<]+)<\/title>/);
    let title = titleMatch ? titleMatch[1].replace(/^Lk21\s*Nonton\s*/i, '').replace(/Sub\s*Indo.*$/i, '').trim() : episodeSlug;

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
          directStreamUrl: `/api/movies/lk21/stream.m3u8?embedUrl=${encodeURIComponent(embedUrl)}`
        });
      }
    }

    // Sort servers so Server P2P is first
    servers.sort((a, b) => {
      if (a.serverType === 'p2p') return -1;
      if (b.serverType === 'p2p') return 1;
      return 0;
    });

    const primary = servers[0];
    const streamUrl = primary ? primary.directStreamUrl : '';

    return {
      slug: episodeSlug,
      title,
      streamUrl,
      servers
    };
  } catch (error) {
    console.error(`Error fetching episode stream (${episodeSlug}):`, error.message);
    throw error;
  }
}
