import express from 'express';
import { db } from '../database/db.js';
import {
  getHomeData,
  exploreMovies,
  getGenres,
  getMovieDetail,
  getAllMovieEpisodes,
  getEpisodeStream
} from '../services/animeinApi.js';
import { proxyAndCacheImage } from '../services/imageProxy.js';
import { getAnimeRating, getBatchAnimeRatings } from '../services/ratingService.js';

const router = express.Router();

// Helper to format image URLs through local proxy & cache
function formatImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('animein.net') || url.includes('/assets/')) {
    // If it's a relative path, make it absolute first
    const fullUrl = url.startsWith('http') ? url : `https://api.animein.net${url}`;
    return `/api/anime/image-proxy?url=${encodeURIComponent(fullUrl)}`;
  }
  return url;
}

// Helper to format video URLs through local proxy to bypass Cloudflare hotlink protection
function formatVideoUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('storages.animein.net') || url.includes('animein.net') || (url.startsWith('http') && url.endsWith('.mp4'))) {
    return `/api/anime/video-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

// Endpoint to proxy and cache images from animeinweb.com
router.get('/image-proxy', (req, res) => {
  const { url } = req.query;
  proxyAndCacheImage(url, res);
});

// Endpoint to stream anime videos smoothly (bypasses Cloudflare hotlink & handles Range header)
router.get('/video-proxy', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL video diperlukan');

  const range = req.headers.range;
  const curlArgs = [
    '-s',
    '-i',
    '-L',
    '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-H', 'Referer: https://animeinweb.com/'
  ];

  if (range) {
    const cleanRange = range.replace('bytes=', '');
    curlArgs.push('-r', cleanRange);
  }

  curlArgs.push(url);

  import('node:child_process').then(({ spawn }) => {
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const curl = spawn(curlCmd, curlArgs);

    let headerBuffer = Buffer.alloc(0);
    let headersSent = false;

    req.on('close', () => {
      curl.kill();
    });

    curl.stdout.on('data', (chunk) => {
      if (!headersSent) {
        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        const sepIndex = headerBuffer.indexOf('\r\n\r\n');
        if (sepIndex !== -1) {
          headersSent = true;
          const headerText = headerBuffer.subarray(0, sepIndex).toString('latin1');
          const bodyStart = headerBuffer.subarray(sepIndex + 4);

          const lines = headerText.split('\r\n');
          const statusLine = lines[0] || '';
          const statusCode = parseInt(statusLine.split(' ')[1]) || (range ? 206 : 200);

          res.statusMessage = statusLine;
          res.statusCode = statusCode;

          for (let i = 1; i < lines.length; i++) {
            const colon = lines[i].indexOf(':');
            if (colon !== -1) {
              const key = lines[i].substring(0, colon).trim().toLowerCase();
              const val = lines[i].substring(colon + 1).trim();
              if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(key)) {
                res.setHeader(key, val);
              }
            }
          }
          res.setHeader('Access-Control-Allow-Origin', '*');

          if (bodyStart.length > 0) res.write(bodyStart);
        }
      } else {
        res.write(chunk);
      }
    });

    curl.stdout.on('end', () => res.end());
    curl.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).send('Streaming error');
      }
    });
  });
});

// Endpoint to resolve anime MyAnimeList rating
router.get('/rating/:title', async (req, res) => {
  try {
    const { title } = req.params;
    const rating = await getAnimeRating(title);
    res.json({ success: true, data: rating });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to calculate realistic anime MAL score fallback based on engagement metrics
function computeAnimeScore(m, cached) {
  if (cached && typeof cached.mal_score === 'number' && cached.mal_score > 0) {
    return cached.mal_score;
  }
  const favs = parseInt(m.favorites) || 0;
  const views = parseInt(m.views) || 0;
  if (favs >= 50000 || views >= 2000000) return 8.9;
  if (favs >= 20000 || views >= 1000000) return 8.6;
  if (favs >= 8000 || views >= 300000) return 8.2;
  if (favs >= 2000 || views >= 50000) return 7.8;
  if (favs >= 500 || views >= 10000) return 7.4;
  if (favs >= 100 || views >= 2000) return 7.1;
  return 6.8;
}

// Helper to upsert anime into SQLite cache
function cacheAnimeList(list = []) {
  if (!list || !list.length) return;
  const insertStmt = db.prepare(`
    INSERT INTO anime (id, title, synopsis, synonyms, poster, banner, status, type, year, views, favorites, genres, release_day, studio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      synopsis = excluded.synopsis,
      poster = excluded.poster,
      banner = excluded.banner,
      status = excluded.status,
      views = excluded.views,
      favorites = excluded.favorites
  `);

  for (const m of list) {
    try {
      insertStmt.run(
        parseInt(m.id),
        m.title || '',
        m.synopsis || '',
        m.synonyms || '',
        formatImageUrl(m.image_poster) || '',
        formatImageUrl(m.image_cover) || formatImageUrl(m.image_poster) || '',
        m.status || 'ONGOING',
        m.type || 'SERIES',
        m.year || '',
        m.views || '0',
        m.favorites || '0',
        m.genre || '',
        m.day || '',
        m.studio || ''
      );
    } catch (e) {
      // ignore individual duplicate/cache error
    }
  }
}

// In-memory cache for genre list to map names to IDs rapidly
let cachedGenreList = null;
async function getCachedGenres() {
  if (cachedGenreList) return cachedGenreList;
  try {
    const res = await getGenres();
    cachedGenreList = (res?.genre || []).map(g => ({
      id: String(g.id),
      name: g.name,
      group: g.group || 'Genre',
      image: formatImageUrl(g.image)
    }));
    return cachedGenreList;
  } catch (err) {
    return [];
  }
}

// GET all anime / search / filter from AnimeInWeb
router.get('/', async (req, res) => {
  try {
    const { status, genre, genres, genre_in, year, type, search, keyword, sort = 'views', page = 0 } = req.query;
    const queryKeyword = (keyword || search || '').trim();
    let queryGenreIn = (genre_in || '').trim();

    // Resolve single or comma-separated genre names (e.g. "Action,Fantasy" or "Sci-fi") to AnimeIn IDs
    const rawGenreNames = (genres || genre || '')
      .split(',')
      .map(g => g.trim())
      .filter(g => g && g !== 'All');

    if (!queryGenreIn && rawGenreNames.length > 0) {
      const allGenres = await getCachedGenres();
      const matchedIds = [];
      for (const gName of rawGenreNames) {
        const gLower = gName.toLowerCase().replace(/[\s-]+/g, '');
        const match = allGenres.find(
          ag => ag.name.toLowerCase().replace(/[\s-]+/g, '') === gLower || String(ag.id) === gName
        );
        if (match) matchedIds.push(match.id);
      }
      if (matchedIds.length > 0) {
        queryGenreIn = matchedIds.join(',');
      }
    }

    const hasFilter = Boolean(
      queryKeyword ||
      queryGenreIn ||
      (status && status !== 'All') ||
      (type && type !== 'All') ||
      (year && year !== 'All') ||
      (req.query.sort && req.query.sort !== 'default') ||
      Number(page) > 0
    );

    if (hasFilter) {
      const exploreStatus =
        status === 'Ongoing' || status === 'ONGOING'
          ? 'ONGOING'
          : status === 'Completed' || status === 'FINISHED'
          ? 'FINISHED'
          : '';
      const exploreSort = sort === 'latest' ? 'new' : sort === 'score' ? 'favorites' : sort || 'views';

      let movies = [];
      // If year filter is active without keyword, fetch up to 2 pages so in-memory year matching has a rich pool
      const pagesToFetch = year && year !== 'All' && !queryKeyword ? [0, 1] : [parseInt(page) || 0];
      for (const p of pagesToFetch) {
        try {
          const exploreData = await exploreMovies({
            keyword: queryKeyword,
            genre_in: queryGenreIn,
            status: exploreStatus,
            sort: exploreSort,
            page: p
          });
          if (exploreData?.movie?.length) {
            movies.push(...exploreData.movie);
          }
        } catch (e) {
          // ignore page error
        }
      }

      // Deduplicate by ID
      const seenIds = new Set();
      movies = movies.filter(m => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      });

      // Fall back to local SQLite database if remote fetch returned no movies
      if (movies.length === 0) {
        try {
          let sql = 'SELECT * FROM anime WHERE 1=1';
          const params = [];
          if (queryKeyword) {
            sql += ' AND (title LIKE ? OR synopsis LIKE ?)';
            params.push(`%${queryKeyword}%`, `%${queryKeyword}%`);
          }
          if (exploreStatus) {
            sql += ' AND status = ?';
            params.push(exploreStatus);
          }
          if (type && type !== 'All') {
            sql += ' AND UPPER(type) = UPPER(?)';
            params.push(type);
          }
          if (year && year !== 'All') {
            sql += ' AND (year = ? OR title LIKE ?)';
            params.push(String(year), `%${year}%`);
          }
          if (rawGenreNames.length > 0) {
            for (const g of rawGenreNames) {
              sql += ' AND genres LIKE ?';
              params.push(`%${g}%`);
            }
          }
          if (sort === 'score' || sort === 'rating') {
            sql += ' ORDER BY score DESC';
          } else if (sort === 'views' || sort === 'popular') {
            sql += ' ORDER BY CAST(views AS INTEGER) DESC';
          } else if (sort === 'latest') {
            sql += ' ORDER BY id DESC';
          } else {
            sql += ' ORDER BY id DESC';
          }
          sql += ' LIMIT 30 OFFSET ?';
          params.push((parseInt(page) || 0) * 30);

          const localRows = db.prepare(sql).all(...params);
          if (localRows.length > 0) {
            return res.json({
              success: true,
              count: localRows.length,
              page: parseInt(page) || 0,
              data: localRows.map(m => ({
                id: m.id,
                title: m.title,
                synopsis: m.synopsis,
                poster: formatImageUrl(m.poster),
                banner: formatImageUrl(m.banner) || formatImageUrl(m.poster),
                status: m.status === 'FINISHED' ? 'Completed' : 'Ongoing',
                type: m.type,
                year: m.year || '2025',
                score: m.score || 8.5,
                mal_score: m.score || 8.5,
                genres: m.genres,
                release_day: m.release_day,
                views: m.views,
                favorites: m.favorites
              }))
            });
          }
        } catch (dbErr) {
          console.warn('SQLite fallback query error:', dbErr.message);
        }
      }

      cacheAnimeList(movies);

      const titles = movies.map(m => m.title);
      const ratingsMap = getBatchAnimeRatings(titles);

      // Pre-warm ratings for items missing cache so sort and MAL ratings are accurate
      const missingTitles = movies.filter(m => !ratingsMap[m.title]).slice(0, 10);
      if (missingTitles.length > 0) {
        if (sort === 'score' || queryKeyword) {
          await Promise.allSettled(missingTitles.map(m => getAnimeRating(m.title)));
          Object.assign(ratingsMap, getBatchAnimeRatings(titles));
        } else {
          missingTitles.forEach(m => getAnimeRating(m.title).catch(() => {}));
        }
      }

      let mapped = movies.map(m => {
        const cached = ratingsMap[m.title];
        const malScore = computeAnimeScore(m, cached);
        const airedYear = m.aired_start ? String(m.aired_start).slice(0, 4) : '';
        const itemYear = m.year ? String(m.year) : (airedYear || '2025');
        return {
          id: m.id,
          title: m.title,
          synopsis: m.synopsis,
          poster: formatImageUrl(m.image_poster),
          banner: formatImageUrl(m.image_cover) || formatImageUrl(m.image_poster),
          status: m.status === 'FINISHED' ? 'Completed' : 'Ongoing',
          type: m.type,
          year: itemYear,
          aired_year: airedYear,
          aired_start: m.aired_start || '',
          score: malScore,
          mal_score: malScore,
          mal_id: cached ? cached.mal_id : null,
          genres: m.genre,
          release_day: m.day,
          views: m.views,
          favorites: m.favorites
        };
      });

      // Filter by type (e.g. MOVIE or SERIES) if requested
      if (type && type !== 'All') {
        mapped = mapped.filter(m => String(m.type || '').toUpperCase() === String(type).toUpperCase());
      }

      // Filter by year (matches either m.year, aired_year, or year in title)
      if (year && year !== 'All') {
        const yStr = String(year).trim();
        mapped = mapped.filter(
          m => String(m.year) === yStr || String(m.aired_year) === yStr || String(m.title || '').includes(yStr)
        );
      }

      // Ensure all requested genre names match if multiple genres were passed
      if (rawGenreNames.length > 1) {
        mapped = mapped.filter(m => {
          const gStr = String(m.genres || '').toLowerCase().replace(/[\s-]+/g, '');
          return rawGenreNames.every(gn => gStr.includes(gn.toLowerCase().replace(/[\s-]+/g, '')));
        });
      }

      // Sorting
      if (sort === 'score' || sort === 'rating') {
        mapped.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
      } else if (sort === 'views' || sort === 'popular') {
        mapped.sort((a, b) => (parseInt(b.views) || 0) - (parseInt(a.views) || 0));
      } else if (sort === 'latest') {
        mapped.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
      }

      return res.json({
        success: true,
        count: mapped.length,
        page: parseInt(page) || 0,
        data: mapped
      });
    }

    // Default: Fetch from AnimeInWeb Home
    const home = await getHomeData('Kamis', 30);
    const combined = [
      ...(home.hot || []),
      ...(home.new || []),
      ...(home.today || [])
    ];

    // Remove duplicates
    const seen = new Set();
    const uniqueMovies = [];
    for (const m of combined) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        uniqueMovies.push(m);
      }
    }

    cacheAnimeList(uniqueMovies);

    const titles = uniqueMovies.map(m => m.title);
    const ratingsMap = getBatchAnimeRatings(titles);

    // Warm up missing ratings in background
    uniqueMovies.slice(0, 10).forEach(m => {
      if (!ratingsMap[m.title]) {
        getAnimeRating(m.title).catch(() => {});
      }
    });

    let defaultMapped = uniqueMovies.map(m => {
      const cached = ratingsMap[m.title];
      const malScore = computeAnimeScore(m, cached);
      const airedYear = m.aired_start ? String(m.aired_start).slice(0, 4) : '';
      const itemYear = m.year ? String(m.year) : (airedYear || '2025');
      return {
        id: m.id,
        title: m.title,
        synopsis: m.synopsis,
        poster: formatImageUrl(m.image_poster),
        banner: formatImageUrl(m.image_cover) || formatImageUrl(m.image_poster),
        status: m.status === 'FINISHED' ? 'Completed' : 'Ongoing',
        type: m.type,
        year: itemYear,
        aired_year: airedYear,
        aired_start: m.aired_start || '',
        score: malScore,
        mal_score: malScore,
        mal_id: cached ? cached.mal_id : null,
        genres: m.genre,
        release_day: m.day,
        views: m.views,
        favorites: m.favorites
      };
    });

    if (sort === 'score' || sort === 'rating') {
      defaultMapped.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
    } else if (sort === 'views' || sort === 'popular') {
      defaultMapped.sort((a, b) => (parseInt(b.views) || 0) - (parseInt(a.views) || 0));
    } else if (sort === 'latest') {
      defaultMapped.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
    }

    res.json({
      success: true,
      count: defaultMapped.length,
      data: defaultMapped
    });
  } catch (error) {
    console.error('Error fetching anime list:', error.message);
    const local = db.prepare('SELECT * FROM anime LIMIT 30').all();
    res.json({
      success: true,
      count: local.length,
      data: local.map(m => ({
        ...m,
        score: m.score || 8.5
      }))
    });
  }
});

// GET featured slider anime from AnimeInWeb
router.get('/featured', async (req, res) => {
  try {
    const home = await getHomeData();
    const hotList = home.hot || [];
    const sliderData = (home.slider || []).map(s => {
      const match = hotList.find(h => s.link && s.link.includes(h.id)) || hotList[0];
      return {
        id: match ? match.id : s.id,
        title: match ? match.title : 'Anime Populer',
        synopsis: match ? match.synopsis : 'Tonton anime terbaru dengan subtitle Indonesia langsung di AnimeIn.',
        poster: formatImageUrl(s.image),
        banner: formatImageUrl(s.image),
        status: match ? (match.status === 'FINISHED' ? 'Completed' : 'Ongoing') : 'Ongoing',
        score: 8.9,
        genres: match?.genre || 'Action, Fantasy'
      };
    });

    if (sliderData.length > 0) {
      return res.json({ success: true, data: sliderData });
    }

    const featuredHot = hotList.slice(0, 5).map(m => ({
      id: m.id,
      title: m.title,
      synopsis: m.synopsis,
      poster: formatImageUrl(m.image_poster),
      banner: formatImageUrl(m.image_cover) || formatImageUrl(m.image_poster),
      status: m.status === 'FINISHED' ? 'Completed' : 'Ongoing',
      score: 8.9,
      genres: m.genre
    }));

    res.json({ success: true, data: featuredHot });
  } catch (error) {
    console.error('Error fetching featured:', error.message);
    const local = db.prepare('SELECT * FROM anime LIMIT 5').all();
    res.json({ success: true, data: local });
  }
});

// GET all genres from AnimeInWeb
router.get('/genres/all', async (req, res) => {
  try {
    const list = await getCachedGenres();
    res.json({ success: true, data: list });
  } catch (error) {
    res.json({
      success: true,
      data: [
        { id: '14', name: 'Action', group: 'Genre' },
        { id: '16', name: 'Adventure', group: 'Genre' },
        { id: '25', name: 'Comedy', group: 'Genre' },
        { id: '20', name: 'Drama', group: 'Genre' },
        { id: '13', name: 'Fantasy', group: 'Genre' },
        { id: '19', name: 'Romance', group: 'Genre' },
        { id: '31', name: 'Sci-Fi', group: 'Genre' },
        { id: '32', name: 'Shounen', group: 'Demographic' },
        { id: '27', name: 'Slice of Life', group: 'Genre' }
      ]
    });
  }
});

// GET anime detail & episodes by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId = 'guest_user' } = req.query;

    let movie = null;
    let episodes = [];

    try {
      const [detailData, epData] = await Promise.all([
        getMovieDetail(id),
        getAllMovieEpisodes(id)
      ]);
      movie = detailData?.movie;
      episodes = (epData?.episode || []).map(ep => ({
        id: ep.id,
        anime_id: ep.id_movie,
        episode_number: ep.index,
        title: ep.title,
        views: ep.views,
        release_date: ep.key_time,
        thumbnail: formatImageUrl(ep.image || movie?.image_poster)
      }));
    } catch (remoteErr) {
      console.warn(`Remote anime detail for ${id} failed, checking SQLite fallback:`, remoteErr.message);
    }

    if (!movie) {
      try {
        const local = db.prepare('SELECT * FROM anime WHERE id = ?').get(parseInt(id) || 0);
        if (local) {
          movie = {
            id: local.id,
            title: local.title,
            synopsis: local.synopsis,
            synonyms: local.synonyms,
            image_poster: local.poster,
            image_cover: local.banner,
            status: local.status,
            type: local.type,
            year: local.year,
            genre: local.genres,
            day: local.release_day,
            studio: local.studio,
            views: local.views,
            favorites: local.favorites
          };
        }
      } catch (_) {}
    }

    if (!episodes || episodes.length === 0) {
      try {
        const localEps = db.prepare('SELECT * FROM episodes WHERE anime_id = ? ORDER BY CAST(episode_number AS REAL) ASC').all(parseInt(id) || 0);
        if (localEps && localEps.length > 0) {
          episodes = localEps.map(ep => ({
            id: ep.id,
            anime_id: ep.anime_id,
            episode_number: ep.episode_number,
            title: ep.title || `Episode ${ep.episode_number}`,
            views: '1000',
            release_date: ep.release_date || '',
            thumbnail: formatImageUrl(ep.thumbnail || movie?.image_poster)
          }));
        }
      } catch (_) {}
    }

    if (!movie) {
      return res.status(404).json({ success: false, message: 'Anime tidak ditemukan' });
    }

    // Natural sort: Episode 1, 2, 3 ... 170
    episodes.sort((a, b) => {
      const numA = parseFloat(a.episode_number) || 0;
      const numB = parseFloat(b.episode_number) || 0;
      return numA - numB;
    });

    // Cache anime and all episodes into SQLite
    try { cacheAnimeList([movie]); } catch (_) {}
    try {
      const insertEp = db.prepare(`
        INSERT INTO episodes (id, anime_id, episode_number, title, thumbnail, release_date)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          episode_number = excluded.episode_number,
          title = excluded.title,
          thumbnail = excluded.thumbnail,
          release_date = excluded.release_date
      `);
      for (const ep of episodes) {
        insertEp.run(
          parseInt(ep.id),
          parseInt(id),
          String(ep.episode_number),
          ep.title || '',
          ep.thumbnail || '',
          ep.release_date || ''
        );
      }
    } catch (e) {
      // ignore individual cache error
    }

    const bookmark = db.prepare('SELECT id FROM bookmarks WHERE user_id = ? AND CAST(anime_id AS TEXT) = ?').get(userId, String(id));

    const rawHistory = db.prepare(`
      SELECT * FROM watch_history
      WHERE user_id = ? AND CAST(anime_id AS TEXT) = ?
    `).get(userId, String(id));

    let history = null;
    if (rawHistory) {
      let watchedEps = [];
      try {
        watchedEps = JSON.parse(rawHistory.watched_episodes || '[]');
      } catch (_) {
        watchedEps = [];
      }
      if (rawHistory.episode_id && !watchedEps.includes(String(rawHistory.episode_id))) {
        watchedEps.push(String(rawHistory.episode_id));
      }
      history = {
        ...rawHistory,
        watched_episodes: watchedEps
      };
    }

    // Resolve MyAnimeList (MAL) rating
    const malRating = await getAnimeRating(movie.title);

    res.json({
      success: true,
      data: {
        id: movie.id,
        title: movie.title,
        synopsis: movie.synopsis,
        synonyms: movie.synonyms,
        poster: formatImageUrl(movie.image_poster),
        banner: formatImageUrl(movie.image_cover) || formatImageUrl(movie.image_poster),
        status: movie.status === 'FINISHED' ? 'Completed' : 'Ongoing',
        type: movie.type,
        score: malRating.mal_score || 8.5,
        mal_score: malRating.mal_score || 8.5,
        mal_id: malRating.mal_id,
        rating: '13+',
        genres: movie.genre,
        release_day: movie.day,
        studio: movie.studio || 'Studio Animasi',
        total_episodes: episodes.length,
        episodes,
        isBookmarked: !!bookmark,
        watchHistory: history || null
      }
    });
  } catch (error) {
    console.error('Error fetching detail:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET episode stream & video servers directly from AnimeInWeb
router.get('/stream/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    const streamData = await getEpisodeStream(episodeId);

    const rawServers = streamData?.server || [];
    const servers = rawServers.map(s => {
      const isDirect = s.type === 'direct' || (s.link && (s.link.includes('storages.animein.net') || s.link.endsWith('.mp4')));
      return {
        ...s,
        isDirect,
        link: isDirect ? formatVideoUrl(s.link) : s.link,
        rawLink: s.link
      };
    });

    const directServers = servers.filter(s => s.isDirect);
    const embedServers = servers.filter(s => !s.isDirect);

    const primaryVideo = directServers[0]?.link || (servers[0]?.isDirect ? servers[0].link : '') || '';
    const fallbackEmbed = embedServers[0]?.link || '';

    res.json({
      success: true,
      data: {
        episode: streamData?.episode,
        nextEpisode: streamData?.episode_next,
        servers,
        videoUrl: primaryVideo,
        embedUrl: fallbackEmbed
      }
    });
  } catch (error) {
    console.error('Error fetching stream:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
