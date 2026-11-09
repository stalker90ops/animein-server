/**
 * Dubbindo Service - Scraper & Grouper for https://www.dubbindo.site
 * Supports Film Movie, Anime Movie, TV Series, and Anime Series Dubbing Indonesia.
 * Resolves direct Wasabi/S3 MP4 video streams and embed fallbacks.
 */

const BASE_URL = 'https://www.dubbindo.site';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data) {
  cache.set(key, { time: Date.now(), data });
}

// Clean HTML entities and unwanted characters
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/⁣/g, '') // zero-width space
    .trim();
}

/**
 * Intelligent parser to detect whether a video is part of a Series or a standalone Movie,
 * and extract the base series name and episode number.
 */
export function parseTitleAndEpisode(rawTitle, categoryId = '') {
  const title = cleanText(rawTitle);
  let cleanTitle = title;

  let isSeries = categoryId === '3' || categoryId === '5';
  let epNumber = null;
  let season = null;

  // Patterns for episodes:
  // 1. S1 E4 or S4 E15A
  const sPattern = /(?:S|Season|Musim)\s*(\d+)\s*(?:E|EPS|Episode)\s*(\d+[a-zA-Z]?)/i;
  // 2. S6 EPS 4b
  const sEpsPattern = /S(\d+)\s*EPS\s*(\d+[a-zA-Z]?)/i;
  // 3. Episode 5 & 6 or Episode 5
  const epPattern = /(?:Episode|EPS|EP)\s*(\d+(?:\s*(?:&|dan|-)\s*\d+)?)/i;
  // 4. Musim 2 - 16
  const musimPattern = /Musim\s*(\d+)\s*-\s*(\d+)/i;
  // 5. - 02 at the end (e.g. Aikatsu! Encore - 02)
  const dashNumPattern = /-\s*0*(\d{1,3})\s*(?:\(.*\))?$/i;

  let m = cleanTitle.match(sPattern);
  if (m) {
    isSeries = true;
    season = `S${m[1]}`;
    epNumber = m[2];
  } else if ((m = cleanTitle.match(sEpsPattern))) {
    isSeries = true;
    season = `S${m[1]}`;
    epNumber = m[2];
  } else if ((m = cleanTitle.match(epPattern))) {
    isSeries = true;
    epNumber = m[1];
  } else if ((m = cleanTitle.match(musimPattern))) {
    isSeries = true;
    season = `S${m[1]}`;
    epNumber = m[2];
  } else if ((m = cleanTitle.match(dashNumPattern))) {
    isSeries = true;
    epNumber = m[1];
  }

  // Remove episode and tag text from base series name
  let baseName = cleanTitle
    .replace(/(?:S|Season|Musim)\s*\d+\s*(?:E|EPS|Episode)\s*\d+[a-zA-Z]?/gi, '')
    .replace(/S\d+\s*EPS\s*\d+[a-zA-Z]?/gi, '')
    .replace(/(?:Episode|EPS|EP)\s*\d+(?:\s*(?:&|dan|-)\s*\d+)?(?:\s*Tamat)?/gi, '')
    .replace(/Musim\s*\d+\s*-\s*\d+/gi, '')
    .replace(/-\s*0*\d{1,3}\s*(?:\(.*\))?$/gi, '')
    .replace(/\[\s*Bahasa\s*Indonesia\s*\]/gi, '')
    .replace(/\(?\s*Dubbing\s*(?:Bahasa\s*)?Indonesia\s*\)?/gi, '')
    .replace(/\(?\s*Indonesian\s*Dubbed\s*\)?/gi, '')
    .replace(/\(?\s*Dub\s*Indo\s*\)?/gi, '')
    .replace(/\(?\s*Sulih\s*Suara\s*Indonesia\s*\)?/gi, '')
    .replace(/\b(?:1080p|720p|480p|HD|CAM|WEB-DL|BD|Tamat)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing dashes or colons
  baseName = baseName.replace(/[-–—:]\s*$/g, '').trim();

  // If still series without specific episode number, default to Episode 1
  let epLabel = epNumber ? `Episode ${epNumber}` : (isSeries ? 'Episode 1' : null);
  if (season && epNumber) {
    epLabel = `${season} Episode ${epNumber}`;
  }

  return {
    rawTitle: title,
    baseName: baseName || title,
    isSeries,
    season,
    episode: epLabel
  };
}

/**
 * Fetch video items from a specific category page
 */
async function fetchCategoryVideos(categoryId, page = 1) {
  const cacheKey = `cat_${categoryId}_p${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/videos/category/${categoryId}?page_id=${page}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) return [];
    const html = await res.text();

    const items = [];
    const itemRegex = /<a[^>]+href=["']https?:\/\/www\.dubbindo\.site\/watch\/([^"'\.]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;

    while ((m = itemRegex.exec(html)) !== null) {
      const slug = m[1];
      const inner = m[2];
      const imgMatch = inner.match(/src=["']([^"']+)["']/i);
      const titleMatch = inner.match(/title=["']([^"']+)["']/i) || inner.match(/alt=["']([^"']+)["']/i);
      const durationMatch = inner.match(/class=["'](?:time|duration)["'][^>]*>([^<]+)<\/span>/i);

      if (!items.some(i => i.slug === slug)) {
        const rawTitle = titleMatch ? cleanText(titleMatch[1]) : slug;
        const parsed = parseTitleAndEpisode(rawTitle, categoryId);

        let catName = 'Film Movie';
        if (categoryId === '4') catName = 'Anime Movie';
        if (categoryId === '3') catName = 'TV Series';
        if (categoryId === '5') catName = 'Anime Series';

        items.push({
          slug,
          rawTitle,
          title: parsed.baseName,
          episodeTitle: parsed.episode,
          isSeries: parsed.isSeries,
          type: parsed.isSeries ? 'series' : 'movie',
          category: catName,
          thumbnail: imgMatch ? imgMatch[1] : '',
          duration: durationMatch ? durationMatch[1].trim() : '',
          pageUrl: `${BASE_URL}/watch/${slug}.html`
        });
      }
    }

    setCached(cacheKey, items);
    return items;
  } catch (err) {
    console.error(`Error fetching category ${categoryId}:`, err.message);
    return [];
  }
}

/**
 * Group raw video items into unified Series (with multiple episodes) and standalone Movies
 */
function groupVideos(rawItems) {
  const seriesMap = new Map();
  const movies = [];

  for (const item of rawItems) {
    if (item.isSeries) {
      // Normalize base key
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const existing = seriesMap.get(key);

      const epObj = {
        slug: item.slug,
        episodeTitle: item.episodeTitle || 'Episode 1',
        rawTitle: item.rawTitle,
        thumbnail: item.thumbnail,
        duration: item.duration
      };

      if (!existing) {
        seriesMap.set(key, {
          id: `dub_series_${item.slug}`,
          slug: item.slug,
          title: item.title,
          poster: item.thumbnail,
          banner: item.thumbnail,
          type: 'series',
          category: item.category,
          source: 'dubbindo',
          badge: 'Dub Indo',
          episodes: [epObj]
        });
      } else {
        if (!existing.episodes.some(e => e.slug === item.slug)) {
          existing.episodes.push(epObj);
        }
      }
    } else {
      movies.push({
        id: `dub_movie_${item.slug}`,
        slug: item.slug,
        title: item.title,
        poster: item.thumbnail,
        banner: item.thumbnail,
        type: 'movie',
        category: item.category,
        duration: item.duration,
        source: 'dubbindo',
        badge: 'Dub Indo'
      });
    }
  }

  // Final series formatting with episode counts
  const seriesList = Array.from(seriesMap.values()).map(s => ({
    ...s,
    totalEpisodes: s.episodes.length,
    latestEpisode: s.episodes[s.episodes.length - 1]?.episodeTitle || `${s.episodes.length} Episode`
  }));

  return { series: seriesList, movies };
}

/**
 * Get catalog of Dubbing Indo with filtering and pagination
 */
export async function getDubbindoCatalog({ category = 'all', page = 1, search = '' }) {
  const p = Math.max(parseInt(page, 10) || 1, 1);

  // If search query is provided
  if (search && search.trim()) {
    return await searchDubbindo(search.trim(), p);
  }

  // Determine which category IDs to fetch
  let catIds = [];
  if (category === 'movie') {
    catIds = ['1', '4']; // Film Movie + Anime Movie
  } else if (category === 'series') {
    catIds = ['3', '5']; // TV Series + Anime Series
  } else if (category === 'anime_movie') {
    catIds = ['4'];
  } else if (category === 'anime_series') {
    catIds = ['5'];
  } else if (category === 'tv_series') {
    catIds = ['3'];
  } else {
    // 'all'
    catIds = ['1', '4', '3', '5'];
  }

  // Fetch in parallel
  const fetches = catIds.map(id => fetchCategoryVideos(id, p));
  const results = await Promise.all(fetches);
  const rawList = results.flat();

  // Group into series and movies
  const grouped = groupVideos(rawList);

  let combinedList = [];
  if (category === 'movie' || category === 'anime_movie') {
    combinedList = grouped.movies;
  } else if (category === 'series' || category === 'anime_series' || category === 'tv_series') {
    combinedList = grouped.series;
  } else {
    // Interleave series and movies for an engaging mix
    const maxLen = Math.max(grouped.series.length, grouped.movies.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < grouped.series.length) combinedList.push(grouped.series[i]);
      if (i < grouped.movies.length) combinedList.push(grouped.movies[i]);
    }
  }

  return {
    success: true,
    page: p,
    hasMore: rawList.length >= 20,
    total: combinedList.length,
    seriesCount: grouped.series.length,
    moviesCount: grouped.movies.length,
    data: combinedList
  };
}

/**
 * Search videos on dubbindo.site
 */
export async function searchDubbindo(keyword, page = 1) {
  const cacheKey = `search_${keyword}_p${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/search?keyword=${encodeURIComponent(keyword)}&page_id=${page}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return { success: true, page, hasMore: false, data: [] };

    const html = await res.text();
    const items = [];
    const itemRegex = /<a[^>]+href=["']https?:\/\/www\.dubbindo\.site\/watch\/([^"'\.]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;

    while ((m = itemRegex.exec(html)) !== null) {
      const slug = m[1];
      const inner = m[2];
      const imgMatch = inner.match(/src=["']([^"']+)["']/i);
      const titleMatch = inner.match(/title=["']([^"']+)["']/i) || inner.match(/alt=["']([^"']+)["']/i);

      if (!items.some(i => i.slug === slug)) {
        const rawTitle = titleMatch ? cleanText(titleMatch[1]) : slug;
        const parsed = parseTitleAndEpisode(rawTitle);

        items.push({
          slug,
          rawTitle,
          title: parsed.baseName,
          episodeTitle: parsed.episode,
          isSeries: parsed.isSeries,
          type: parsed.isSeries ? 'series' : 'movie',
          category: parsed.isSeries ? 'Series Dubbing' : 'Film Dubbing',
          thumbnail: imgMatch ? imgMatch[1] : '',
          source: 'dubbindo'
        });
      }
    }

    const grouped = groupVideos(items);
    const combinedList = [...grouped.series, ...grouped.movies];

    const result = {
      success: true,
      page,
      hasMore: items.length >= 20,
      total: combinedList.length,
      data: combinedList
    };

    setCached(cacheKey, result);
    return result;
  } catch (err) {
    console.error('Search dubbindo error:', err.message);
    return { success: false, message: err.message, data: [] };
  }
}

/**
 * Fetch video watch page details and resolve direct MP4 video streams
 */
export async function getDubbindoDetail(slug) {
  const cacheKey = `detail_${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/watch/${slug}.html`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      return { success: false, message: 'Halaman video tidak ditemukan di Dubbindo' };
    }

    const html = await res.text();

    // Meta details
    const ogTitle = (html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i))?.[1] || '';
    const ogDesc = (html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<meta name="description" content="([^"]+)"/i))?.[1] || '';
    const ogImage = (html.match(/<meta property="og:image" content="([^"]+)"/i))?.[1] || '';

    const cleanDesc = cleanText(ogDesc).replace(/^⁣/, '');
    const cleanFullTitle = cleanText(ogTitle);
    const parsed = parseTitleAndEpisode(cleanFullTitle);

    // Extract direct MP4 stream sources from scripts
    const streams = [];
    const srcRegex = /src:\s*['"](https?:\/\/(?:stream\.dubbindo\.site|td\.wahyudin\.workers\.dev)\/[^'"]+)['"]/gi;
    let sm;
    while ((sm = srcRegex.exec(html)) !== null) {
      const streamUrl = sm[1];
      let label = 'HD';
      const resMatch = streamUrl.match(/_(\d+p)_/);
      if (resMatch) {
        label = resMatch[1];
      } else if (streamUrl.includes('1080p')) {
        label = '1080p';
      } else if (streamUrl.includes('720p')) {
        label = '720p';
      } else if (streamUrl.includes('480p')) {
        label = '480p';
      } else if (streamUrl.includes('360p')) {
        label = '360p';
      }

      if (!streams.some(s => s.url === streamUrl)) {
        streams.push({
          label,
          url: streamUrl,
          type: 'video/mp4'
        });
      }
    }

    // Extract shortCode for embed fallback
    const shortCodeMatch = slug.match(/_([a-zA-Z0-9]+)$/);
    const shortCode = shortCodeMatch ? shortCodeMatch[1] : '';
    const embedUrl = shortCode ? `${BASE_URL}/embed/${shortCode}` : `${BASE_URL}/watch/${slug}.html`;

    // Extract sidebar related videos (often contains other episodes of the same series!)
    const sidebarItems = [];
    const relRegex = /<a[^>]+href=["']https?:\/\/www\.dubbindo\.site\/watch\/([^"'\.]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
    let rm;
    while ((rm = relRegex.exec(html)) !== null) {
      const rSlug = rm[1];
      if (rSlug !== slug && !sidebarItems.some(i => i.slug === rSlug)) {
        const rTitleMatch = rm[2].match(/title=["']([^"']+)["']/i) || rm[2].match(/alt=["']([^"']+)["']/i);
        const rImgMatch = rm[2].match(/src=["']([^"']+)["']/i);
        if (rTitleMatch) {
          const rRaw = cleanText(rTitleMatch[1]);
          const rParsed = parseTitleAndEpisode(rRaw);
          sidebarItems.push({
            slug: rSlug,
            rawTitle: rRaw,
            title: rParsed.baseName,
            episodeTitle: rParsed.episode || 'Episode',
            isSeries: rParsed.isSeries,
            thumbnail: rImgMatch ? rImgMatch[1] : ''
          });
        }
      }
    }

    // Collect related episodes belonging to the SAME series base title
    const sameSeriesEpisodes = sidebarItems
      .filter(item => {
        const itemClean = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const currentClean = parsed.baseName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return itemClean.includes(currentClean) || currentClean.includes(itemClean);
      })
      .map(item => ({
        slug: item.slug,
        episodeTitle: item.episodeTitle,
        rawTitle: item.rawTitle,
        thumbnail: item.thumbnail
      }));

    // Add current episode to the list if not present
    if (parsed.isSeries && !sameSeriesEpisodes.some(e => e.slug === slug)) {
      sameSeriesEpisodes.unshift({
        slug,
        episodeTitle: parsed.episode || 'Episode Aktif',
        rawTitle: cleanFullTitle,
        thumbnail: ogImage
      });
    }

    // If it is a series and we have few episodes, search for other episodes by baseName
    if (parsed.isSeries && sameSeriesEpisodes.length <= 3) {
      try {
        const searchRes = await searchDubbindo(parsed.baseName, 1);
        if (searchRes?.data?.length > 0) {
          for (const item of searchRes.data) {
            if (item.episodes && Array.isArray(item.episodes)) {
              for (const ep of item.episodes) {
                if (!sameSeriesEpisodes.some(e => e.slug === ep.slug)) {
                  sameSeriesEpisodes.push(ep);
                }
              }
            } else if (item.slug) {
              if (!sameSeriesEpisodes.some(e => e.slug === item.slug)) {
                const epParsed = parseTitleAndEpisode(item.title);
                if (epParsed.isSeries) {
                  sameSeriesEpisodes.push({
                    slug: item.slug,
                    episodeTitle: epParsed.episode || item.title,
                    rawTitle: item.title,
                    thumbnail: item.poster || item.thumbnail || ''
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        // search fallback
      }
    }

    // Sort series episodes in natural numerical order (Episode 1, 2, 3...)
    if (sameSeriesEpisodes.length > 1) {
      const getEpNum = (str) => {
        const m = str?.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 99999;
      };
      sameSeriesEpisodes.sort((a, b) => getEpNum(a.episodeTitle) - getEpNum(b.episodeTitle));
    }

    const detail = {
      success: true,
      id: `dub_${slug}`,
      slug,
      title: parsed.baseName,
      rawTitle: cleanFullTitle,
      episodeTitle: parsed.episode,
      type: parsed.isSeries ? 'series' : 'movie',
      isSeries: parsed.isSeries,
      synopsis: cleanDesc || 'Tonton film/series dengan sulih suara (Dubbing) Bahasa Indonesia berkualitas jernih tanpa perlu membaca subtitle.',
      poster: ogImage,
      banner: ogImage,
      source: 'dubbindo',
      badge: 'Dub Indo',
      embedUrl,
      streams: streams.length > 0 ? streams : [{ label: 'Default', url: embedUrl, isEmbed: true }],
      episodes: sameSeriesEpisodes,
      totalEpisodes: sameSeriesEpisodes.length > 0 ? sameSeriesEpisodes.length : 1,
      recommendations: sidebarItems.slice(0, 12)
    };

    setCached(cacheKey, detail);
    return detail;
  } catch (err) {
    console.error('Error fetching dubbindo detail:', err.message);
    return { success: false, message: err.message };
  }
}
