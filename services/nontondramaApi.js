import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory series catalog loaded from offline pre-indexed database
let seriesStreamsCatalog = {};
try {
  const catalogPath = path.join(__dirname, '..', 'database', 'series_streams_cache.json');
  if (fs.existsSync(catalogPath)) {
    seriesStreamsCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  }
} catch (err) {
  console.warn('Could not load series_streams_cache.json:', err.message);
}

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

// Helper to execute fetch with browser user-agent
async function curlFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': `${NONTONDRAMA_BASE}/`
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

// 1. Get Series List from Verified Catalog & NontonDrama
export async function getNontondramaSeries({ category = 'latest', genre = '', genres = '', year = '', page = 1, search = '' } = {}) {
  const p = Math.max(1, parseInt(page) || 1);
  const pageSize = 24;
  const genreList = (genres || genre || '')
    .split(',')
    .map(g => g.trim())
    .filter(g => g && g !== 'All');

  // Direct Search Mode
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    const catalogMatches = Object.values(seriesStreamsCatalog).filter(s => {
      const matchTitle = (s.title || '').toLowerCase().includes(q);
      const matchSlug = (s.slug || '').toLowerCase().includes(q);
      const matchGenre = (s.genres || '').toLowerCase().includes(q);
      const matchCountry = (s.country || '').toLowerCase().includes(q);
      const matchYear = !year || String(s.year) === String(year);
      return (matchTitle || matchSlug || matchGenre || matchCountry) && matchYear;
    });

    // Also query gudangvape search API for live results
    let apiMatches = [];
    try {
      const searchUrl = `${NONTONDRAMA_SEARCH_API}?s=${encodeURIComponent(search.trim())}&page=${p}`;
      const res = await fetch(searchUrl, {
        headers: {
          'Origin': NONTONDRAMA_BASE,
          'Referer': `${NONTONDRAMA_BASE}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const json = await res.json();
        const items = json?.data || [];
        apiMatches = items
          .filter(it => it.type === 'series' || Number(it.episode) > 0 || Number(it.season) > 0)
          .map(it => {
            const slug = String(it.slug || '').replace(/^\//, '').replace(/\/$/, '');
            const catEntry = seriesStreamsCatalog[slug];
            const rawTitle = decodeEntities((it.title || slug).replace(/\s*-\s*Series$/i, '').trim());
            const posterUrl = it.poster
              ? (it.poster.startsWith('http') ? it.poster : `${NONTONDRAMA_POSTER_BASE}${it.poster.replace(/^\//, '')}`)
              : (catEntry?.poster || '');
            return {
              id: `series_${slug}`,
              source: 'nontondrama',
              type: 'series',
              slug,
              title: catEntry?.title || rawTitle,
              poster: posterUrl,
              rating: it.rating && Number(it.rating) > 0 ? String(it.rating) : (catEntry?.rating || '8.0'),
              genres: catEntry?.genres || (genreList.length > 0 ? genreList.join(', ') : 'Drama, TV Series'),
              year: it.year ? String(it.year) : (catEntry?.year || ''),
              episodeBadge: it.episode ? `EPS${it.episode}` : (catEntry?.totalEpisodes ? `EPS${catEntry.totalEpisodes}` : ''),
              seasonBadge: it.season ? `S.${it.season}` : '',
              url: `${NONTONDRAMA_BASE}/${slug}`
            };
          });
      }
    } catch (e) {
      console.warn('NontonDrama search API error:', e.message);
    }

    const seen = new Set();
    const merged = [];
    for (const m of [...catalogMatches, ...apiMatches]) {
      if (!seen.has(m.slug)) {
        seen.add(m.slug);
        merged.push(m);
      }
    }
    return merged.slice((p - 1) * pageSize, p * pageSize);
  }

  // Browse Catalog Pool (497 pre-indexed series with verified seasons/episodes)
  const allCatalog = Object.values(seriesStreamsCatalog);
  if (allCatalog.length > 0) {
    let pool = [...allCatalog];

    // Filter by Category
    const catLower = (category || 'latest').toLowerCase();
    if (catLower === 'drakor') {
      pool = pool.filter(s =>
        s.category === 'drakor' ||
        (s.country || '').toLowerCase().includes('korea') ||
        (s.genres || '').toLowerCase().includes('korean') ||
        (s.title || '').toLowerCase().includes('korea')
      );
    } else if (catLower === 'asian') {
      pool = pool.filter(s =>
        s.category === 'asian' ||
        (s.country || '').toLowerCase().includes('asia') ||
        (s.country || '').toLowerCase().includes('china') ||
        (s.country || '').toLowerCase().includes('japan') ||
        (s.country || '').toLowerCase().includes('thai')
      );
    } else if (catLower === 'west') {
      pool = pool.filter(s =>
        s.category === 'west' ||
        (s.country || '').toLowerCase().includes('united states') ||
        (s.country || '').toLowerCase().includes('uk')
      );
    } else if (catLower === 'ongoing') {
      pool = pool.filter(s => s.status === 'Ongoing' || (s.year && Number(s.year) >= 2025));
    } else if (catLower === 'complete') {
      pool = pool.filter(s => s.status === 'Completed' || (s.year && Number(s.year) < 2025));
    } else if (catLower === 'top' || catLower === 'populer' || catLower === 'rating') {
      pool.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    } else {
      // Default: Latest series sorted by year descending
      pool.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
    }

    // Filter by Genre
    if (genreList.length > 0) {
      pool = pool.filter(s => {
        const itemGenres = (s.genres || '').toLowerCase();
        return genreList.some(g => itemGenres.includes(g.toLowerCase()));
      });
    }

    // Filter by Year
    if (year && /^\d{4}$/.test(String(year))) {
      pool = pool.filter(s => String(s.year) === String(year) || s.title.includes(String(year)));
    }

    const startIndex = (p - 1) * pageSize;
    const paginated = pool.slice(startIndex, startIndex + pageSize);

    if (paginated.length > 0) {
      return paginated.map(s => ({
        id: s.id || `series_${s.slug}`,
        source: 'nontondrama',
        type: 'series',
        slug: s.slug,
        title: s.title,
        poster: s.poster,
        rating: s.rating || '8.0',
        genres: s.genres || 'Drama, Series',
        year: s.year || '',
        episodeBadge: s.totalEpisodes ? `EPS${s.totalEpisodes}` : '',
        seasonBadge: s.totalSeasons ? `S.${s.totalSeasons}` : '',
        url: s.url || `${NONTONDRAMA_BASE}/${s.slug}`
      }));
    }
  }

  // Fallback to Live Scraping if catalog empty
  try {
    const searchTerms = ['series', '2026', '2025', 'korea'];
    const term = searchTerms[(p - 1) % searchTerms.length] || 'series';
    const searchRes = await fetch(`${NONTONDRAMA_SEARCH_API}?s=${term}&page=${p}`, {
      headers: {
        'Origin': NONTONDRAMA_BASE,
        'Referer': `${NONTONDRAMA_BASE}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(8000)
    }).catch(() => null);

    if (searchRes && searchRes.ok) {
      const json = await searchRes.json().catch(() => null);
      const items = json?.data || [];
      return items
        .filter(item => item.type === 'series' || item.season || item.episode)
        .map(item => {
          const slug = String(item.slug || '').replace(/^\//, '').replace(/\/$/, '');
          const rawTitle = decodeEntities(item.title || slug);
          const posterUrl = item.poster
            ? (item.poster.startsWith('http') ? item.poster : `${NONTONDRAMA_POSTER_BASE}${item.poster.replace(/^\//, '')}`)
            : '';
          const itemYear = item.year ? String(item.year) : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');
          return {
            id: `series_${slug}`,
            source: 'nontondrama',
            slug,
            title: rawTitle,
            poster: posterUrl,
            rating: item.rating && Number(item.rating) > 0 ? String(item.rating) : '7.8',
            genres: 'Drama, TV Series',
            year: itemYear,
            episodeBadge: item.episode ? `EPS${item.episode}` : '',
            seasonBadge: item.season ? `S.${item.season}` : '',
            url: `${NONTONDRAMA_BASE}/${slug}`
          };
        });
    }
    return [];
  } catch (error) {
    console.error(`Error fetching nontondrama series fallback:`, error.message);
    return [];
  }
}

// 2. Get Series Detail & Full Season/Episode Tree
export async function getNontondramaDetail(slug) {
  const cleanSlug = (slug || '').replace(/^series_/, '');

  // 1. Check verified offline catalog first for instant response
  const cached = seriesStreamsCatalog[cleanSlug];
  if (cached) {
    return {
      ...cached,
      id: cached.id || `series_${cleanSlug}`,
      source: 'nontondrama',
      type: 'series',
      url: cached.url || `${NONTONDRAMA_BASE}/${cleanSlug}`
    };
  }

  // 2. Fallback to scraping / live search API
  const url = `${NONTONDRAMA_BASE}/${cleanSlug}`;
  try {
    let finalTitle = cleanSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let finalSynopsis = `Tonton serial drama ${finalTitle} subtitle Indonesia lengkap semua season dan episode.`;
    let finalPoster = '';
    let finalRating = '8.0';
    let finalYear = '';
    let episodesBySeason = {};

    const searchWords = cleanSlug
      .replace(/-(19\d\d|20\d\d)$/, '')
      .replace(/-/g, ' ')
      .trim();

    let maxSeason = 1;
    let maxEpisode = 12;

    try {
      const searchRes = await fetch(`${NONTONDRAMA_SEARCH_API}?s=${encodeURIComponent(searchWords)}`, {
        headers: {
          'Origin': NONTONDRAMA_BASE,
          'Referer': `${NONTONDRAMA_BASE}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (searchRes.ok) {
        const json = await searchRes.json().catch(() => null);
        const items = json?.data || [];
        const matched =
          items.find(it => String(it.slug || '').replace(/^\//, '').replace(/\/$/, '') === cleanSlug) ||
          items[0];
        if (matched) {
          finalTitle = decodeEntities(matched.title || searchWords);
          if (matched.poster) {
            finalPoster = matched.poster.startsWith('http')
              ? matched.poster
              : `${NONTONDRAMA_POSTER_BASE}${matched.poster.replace(/^\//, '')}`;
          }
          if (matched.rating && Number(matched.rating) > 0) {
            finalRating = String(matched.rating);
          }
          if (matched.year) {
            finalYear = String(matched.year);
          }
          if (matched.season && Number(matched.season) > 0) {
            maxSeason = Math.min(Number(matched.season), 10);
          }
          if (matched.episode && Number(matched.episode) > 0) {
            maxEpisode = Math.min(Number(matched.episode), 50);
          }
        }
      }
    } catch (e) {
      // ignore search fallback error
    }

    for (let s = 1; s <= maxSeason; s++) {
      const sKey = String(s);
      episodesBySeason[sKey] = [];
      const epCount = s === maxSeason ? maxEpisode : 10;
      for (let ep = 1; ep <= epCount; ep++) {
        episodesBySeason[sKey].push({
          s,
          episode_no: ep,
          title: `Season ${s} Episode ${ep}`,
          slug: `${cleanSlug}-season-${s}-episode-${ep}`
        });
      }
    }

    let totalEpisodesCount = 0;
    for (const eps of Object.values(episodesBySeason)) {
      totalEpisodesCount += (eps?.length || 0);
    }

    return {
      id: `series_${cleanSlug}`,
      source: 'nontondrama',
      type: 'series',
      slug: cleanSlug,
      title: finalTitle,
      synopsis: finalSynopsis,
      poster: finalPoster,
      banner: finalPoster,
      genres: 'Drama, TV Series',
      rating: finalRating,
      year: finalYear,
      totalSeasons: Object.keys(episodesBySeason).length,
      totalEpisodes: totalEpisodesCount,
      seasons: episodesBySeason,
      url
    };
  } catch (error) {
    console.error(`Error fetching nontondrama series detail (${cleanSlug}):`, error.message);
    throw error;
  }
}

// 3. Get Episode Stream Servers with Verified Multi-Source High Quality Players
export async function getNontondramaEpisode(episodeSlug) {
  try {
    const epMatch = episodeSlug.match(/^(.*?)-season-(\d+)-episode-(\d+)/i);
    const seriesSlug = epMatch ? epMatch[1] : episodeSlug;
    const seasonNum = epMatch ? parseInt(epMatch[2], 10) || 1 : 1;
    const epNum = epMatch ? parseInt(epMatch[3], 10) || 1 : 1;

    const catEntry = seriesStreamsCatalog[seriesSlug];
    const yearInSlug = (seriesSlug.match(/-(19\d\d|20\d\d)$/) || [])[1] || catEntry?.year || '';
    const cleanSeriesName = catEntry?.title || seriesSlug
      .replace(/-(19\d\d|20\d\d)$/, '')
      .replace(/-/g, ' ')
      .trim();

    const title = `${cleanSeriesName} - Season ${seasonNum} Episode ${epNum}`;
    let imdbId = catEntry?.imdbId || '';

    // If no IMDb ID in cache, resolve quickly using IMDb suggestion API
    if (!imdbId) {
      try {
        const imdbQuery = `${cleanSeriesName} ${yearInSlug}`.trim().toLowerCase();
        const firstChar = (cleanSeriesName[0] || 'a').toLowerCase().replace(/[^a-z0-9]/, 'a');
        const imdbRes = await fetch(
          `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(imdbQuery)}.json`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (imdbRes.ok) {
          const imdbJson = await imdbRes.json().catch(() => null);
          const candidates = (imdbJson?.d || []).filter(item => item.id && item.id.startsWith('tt'));
          const best =
            candidates.find(item => item.qid === 'tvSeries' || item.qid === 'tvMiniSeries') ||
            candidates[0];
          if (best) {
            imdbId = best.id;
          }
        }
      } catch (e) {
        // ignore IMDb error
      }
    }

    const servers = [];

    // Working Embed Providers for TV Series with Indonesian Subtitles and No Frame Blocking
    if (imdbId) {
      // 1. VidSrc SH (High speed, clean player, supports auto Sub Indo)
      servers.push({
        name: 'Server VidSrc VIP (Sub Indo)',
        serverType: 'vidsrc_sh',
        embedUrl: `https://vidsrc.sh/embed/tv?imdb=${imdbId}&season=${seasonNum}&episode=${epNum}&ds_lang=id`,
        directStreamUrl: null,
        embedProxyUrl: `https://vidsrc.sh/embed/tv?imdb=${imdbId}&season=${seasonNum}&episode=${epNum}&ds_lang=id`
      });

      // 2. MultiEmbed VIP (Ultra reliable multi-host player)
      servers.push({
        name: 'Server MultiEmbed VIP',
        serverType: 'multiembed',
        embedUrl: `https://multiembed.mov/?video_id=${imdbId}&s=${seasonNum}&e=${epNum}`,
        directStreamUrl: null,
        embedProxyUrl: `https://multiembed.mov/?video_id=${imdbId}&s=${seasonNum}&e=${epNum}`
      });

      // 3. 2Embed Pro (Fast HD streaming)
      servers.push({
        name: 'Server 2Embed Pro',
        serverType: '2embed',
        embedUrl: `https://2embed.cc/embedtv/${imdbId}&s=${seasonNum}&e=${epNum}`,
        directStreamUrl: null,
        embedProxyUrl: `https://2embed.cc/embedtv/${imdbId}&s=${seasonNum}&e=${epNum}`
      });

      // 4. VidSrc Me (Legacy stable provider)
      servers.push({
        name: 'Server VidSrc Me',
        serverType: 'vidsrc_me',
        embedUrl: `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${seasonNum}&episode=${epNum}`,
        directStreamUrl: null,
        embedProxyUrl: `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${seasonNum}&episode=${epNum}`
      });
    } else {
      // Fallback search embed when IMDb ID not available
      servers.push({
        name: 'Server MultiEmbed Search',
        serverType: 'multiembed',
        embedUrl: `https://multiembed.mov/?video_id=${encodeURIComponent(cleanSeriesName)}&s=${seasonNum}&e=${epNum}`,
        directStreamUrl: null,
        embedProxyUrl: `https://multiembed.mov/?video_id=${encodeURIComponent(cleanSeriesName)}&s=${seasonNum}&e=${epNum}`
      });
    }

    const primary = servers[0];
    const streamUrl = primary ? (primary.directStreamUrl || '') : '';

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
