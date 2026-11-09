import { db } from '../database/db.js';

// Initialize ratings cache table
db.exec(`
  CREATE TABLE IF NOT EXISTS ratings_cache (
    title TEXT PRIMARY KEY,
    mal_score REAL,
    mal_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const memoryCache = new Map();

// Clean title of Season/Part suffixes to maximize MAL match rate
function cleanAnimeTitle(rawTitle = '') {
  return rawTitle
    .replace(/\s*(?:Season\s*\d+|Part\s*\d+|Cour\s*\d+|Movie|TV|\(\d{4}\)).*$/i, '')
    .replace(/[^\w\s-]/g, ' ')
    .trim();
}

// 1. Get MAL score for a single anime title
export async function getAnimeRating(rawTitle) {
  if (!rawTitle) return { mal_score: 8.2, mal_id: null };

  const title = rawTitle.trim();

  // 1. Check memory cache
  if (memoryCache.has(title)) {
    return memoryCache.get(title);
  }

  // 2. Check SQLite cache
  try {
    const row = db.prepare('SELECT mal_score, mal_id FROM ratings_cache WHERE title = ?').get(title);
    if (row && row.mal_score) {
      const res = { mal_score: row.mal_score, mal_id: row.mal_id };
      memoryCache.set(title, res);
      return res;
    }
  } catch (e) {
    // ignore db read error
  }

  // 3. Query AniList for live MyAnimeList mapping
  const searchName = cleanAnimeTitle(title) || title;

  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          idMal
          title { romaji english native }
          averageScore
          meanScore
        }
      }
    `;

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: searchName } }),
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      const media = data?.data?.Media;
      if (media && (media.averageScore || media.meanScore)) {
        const rawScore = media.averageScore || media.meanScore;
        const score = Number((rawScore / 10).toFixed(1));
        const idMal = media.idMal || null;

        try {
          db.prepare('INSERT OR REPLACE INTO ratings_cache (title, mal_score, mal_id) VALUES (?, ?, ?)').run(
            title,
            score,
            idMal
          );
        } catch (dbErr) {}

        const result = { mal_score: score, mal_id: idMal };
        memoryCache.set(title, result);
        return result;
      }
    }
  } catch (error) {
    // Fallback if network timeout
  }

  // Baseline fallback
  const fallback = { mal_score: 8.2, mal_id: null };
  memoryCache.set(title, fallback);
  return fallback;
}

// 2. Get batch ratings from local SQLite cache for fast list rendering
export function getBatchAnimeRatings(titles = []) {
  if (!titles.length) return {};
  const map = {};

  try {
    const placeholders = titles.map(() => '?').join(',');
    const rows = db.prepare(`SELECT title, mal_score, mal_id FROM ratings_cache WHERE title IN (${placeholders})`).all(...titles);
    for (const r of rows) {
      map[r.title] = { mal_score: r.mal_score, mal_id: r.mal_id };
    }
  } catch (e) {
    // ignore
  }

  return map;
}
