import { db } from '../database/db.js';

/**
 * Smart Bidirectional Merge for Bookmarks and Watch History.
 * Merges client-side localStorage items and server database items for targetUserId.
 * - Missing bookmarks are inserted into the database.
 * - History watched_episodes are merged without duplicates.
 * - Latest episode and timestamp are retained.
 * Returns the consolidated { bookmarks, history } array.
 */
export function performSmartMerge(userId, clientBookmarks = [], clientHistory = []) {
  if (!userId) return { bookmarks: [], history: [] };

  const targetUser = String(userId).trim();

  // 1. SMART MERGE BOOKMARKS
  try {
    const existingBookmarks = db.prepare(`
      SELECT 
        id as bookmark_id,
        anime_id as id,
        anime_title as title,
        anime_poster as poster,
        anime_banner as banner,
        anime_status as status,
        anime_genres as genres,
        COALESCE(type, 'anime') as type,
        created_at as bookmarked_at
      FROM bookmarks
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(targetUser);

    const bookmarkMap = new Map();
    for (const b of existingBookmarks) {
      if (b && b.id !== undefined) {
        bookmarkMap.set(String(b.id), b);
      }
    }

    const insertBookmark = db.prepare(`
      INSERT INTO bookmarks (user_id, anime_id, anime_title, anime_poster, anime_banner, anime_status, anime_genres, type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, anime_id) DO UPDATE SET
        anime_title = COALESCE(excluded.anime_title, bookmarks.anime_title),
        anime_poster = COALESCE(excluded.anime_poster, bookmarks.anime_poster),
        anime_banner = COALESCE(excluded.anime_banner, bookmarks.anime_banner),
        anime_status = COALESCE(excluded.anime_status, bookmarks.anime_status),
        anime_genres = COALESCE(excluded.anime_genres, bookmarks.anime_genres),
        type = COALESCE(excluded.type, bookmarks.type)
    `);

    for (const cb of clientBookmarks) {
      if (!cb) continue;
      const animeId = String(cb.id || cb.anime_id || cb.animeId || '');
      if (!animeId) continue;

      if (!bookmarkMap.has(animeId)) {
        const itemTitle = cb.title || cb.anime_title || 'Anime';
        const itemPoster = cb.poster || cb.anime_poster || '';
        const itemBanner = cb.banner || cb.anime_banner || itemPoster;
        const itemStatus = cb.status || cb.anime_status || 'Ongoing';
        const itemGenres = cb.genres || cb.anime_genres || '';
        const itemType = cb.type || 'anime';
        const itemCreatedAt = cb.bookmarked_at || cb.created_at || new Date().toISOString();

        try {
          insertBookmark.run(
            targetUser,
            animeId,
            itemTitle,
            itemPoster,
            itemBanner,
            itemStatus,
            itemGenres,
            itemType,
            itemCreatedAt
          );
        } catch (_) {}

        bookmarkMap.set(animeId, {
          bookmark_id: `bm_${animeId}`,
          id: animeId,
          title: itemTitle,
          poster: itemPoster,
          banner: itemBanner,
          status: itemStatus,
          genres: itemGenres,
          type: itemType,
          bookmarked_at: itemCreatedAt
        });
      }
    }
  } catch (err) {
    console.warn('Smart merge bookmarks warning:', err.message);
  }

  // 2. SMART MERGE WATCH HISTORY
  try {
    const existingHistory = db.prepare(`
      SELECT 
        id as history_id,
        anime_id,
        anime_title,
        anime_poster,
        episode_id,
        episode_number,
        episode_title,
        progress_seconds,
        duration_seconds,
        is_completed,
        COALESCE(type, 'anime') as type,
        resume_route,
        COALESCE(watched_episodes, '[]') as watched_episodes,
        last_watched_at
      FROM watch_history
      WHERE user_id = ?
      ORDER BY last_watched_at DESC
    `).all(targetUser);

    const historyMap = new Map();
    for (const h of existingHistory) {
      let eps = [];
      try {
        eps = JSON.parse(h.watched_episodes || '[]');
      } catch (_) {
        eps = [];
      }
      if (h.episode_id && !eps.includes(String(h.episode_id))) {
        eps.push(String(h.episode_id));
      }
      historyMap.set(String(h.anime_id), {
        ...h,
        watched_episodes: eps
      });
    }

    const upsertHistory = db.prepare(`
      INSERT INTO watch_history (
        user_id, anime_id, anime_title, anime_poster,
        episode_id, episode_number, episode_title,
        progress_seconds, duration_seconds, is_completed,
        type, resume_route, watched_episodes, last_watched_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, anime_id) DO UPDATE SET
        anime_title = excluded.anime_title,
        anime_poster = excluded.anime_poster,
        episode_id = excluded.episode_id,
        episode_number = excluded.episode_number,
        episode_title = excluded.episode_title,
        progress_seconds = excluded.progress_seconds,
        duration_seconds = excluded.duration_seconds,
        is_completed = excluded.is_completed,
        type = excluded.type,
        resume_route = excluded.resume_route,
        watched_episodes = excluded.watched_episodes,
        last_watched_at = excluded.last_watched_at
    `);

    for (const ch of clientHistory) {
      if (!ch) continue;
      const animeId = String(ch.anime_id || ch.animeId || ch.id || '');
      if (!animeId) continue;

      let clientEps = [];
      if (Array.isArray(ch.watched_episodes)) {
        clientEps = ch.watched_episodes.map(String);
      } else if (typeof ch.watched_episodes === 'string') {
        try { clientEps = JSON.parse(ch.watched_episodes); } catch (_) { clientEps = []; }
      }
      if (ch.episode_id && !clientEps.includes(String(ch.episode_id))) {
        clientEps.push(String(ch.episode_id));
      }

      const existing = historyMap.get(animeId);
      if (existing) {
        // Merge watched episodes without duplicates
        const mergedEps = Array.from(new Set([...(existing.watched_episodes || []), ...clientEps]));
        const existingTime = new Date(existing.last_watched_at || 0).getTime();
        const clientTime = new Date(ch.last_watched_at || 0).getTime();

        const pickClient = clientTime > existingTime || (!existing.episode_id && ch.episode_id);

        const chosenEpisodeId = pickClient ? String(ch.episode_id || '1') : String(existing.episode_id || '1');
        const chosenEpisodeNumber = pickClient ? String(ch.episode_number || '1') : String(existing.episode_number || '1');
        const chosenEpisodeTitle = pickClient ? (ch.episode_title || `Episode ${chosenEpisodeNumber}`) : (existing.episode_title || `Episode ${chosenEpisodeNumber}`);
        const chosenProg = pickClient ? (Number(ch.progress_seconds) || 0) : (Number(existing.progress_seconds) || 0);
        const chosenDur = pickClient ? (Number(ch.duration_seconds) || 1440) : (Number(existing.duration_seconds) || 1440);
        const chosenCompleted = (chosenProg > 0 && chosenDur > 0 && (chosenProg / chosenDur) >= 0.9) ? 1 : 0;
        const chosenRoute = pickClient ? (ch.resume_route || existing.resume_route || '') : (existing.resume_route || ch.resume_route || '');
        const chosenLastWatched = pickClient ? (ch.last_watched_at || new Date().toISOString()) : (existing.last_watched_at || new Date().toISOString());

        try {
          upsertHistory.run(
            targetUser,
            animeId,
            ch.anime_title || existing.anime_title || 'Tontonan',
            ch.anime_poster || existing.anime_poster || '',
            chosenEpisodeId,
            chosenEpisodeNumber,
            chosenEpisodeTitle,
            chosenProg,
            chosenDur,
            chosenCompleted,
            ch.type || existing.type || 'anime',
            chosenRoute,
            JSON.stringify(mergedEps),
            chosenLastWatched
          );
        } catch (_) {}

        historyMap.set(animeId, {
          ...existing,
          anime_title: ch.anime_title || existing.anime_title,
          anime_poster: ch.anime_poster || existing.anime_poster,
          episode_id: chosenEpisodeId,
          episode_number: chosenEpisodeNumber,
          episode_title: chosenEpisodeTitle,
          progress_seconds: chosenProg,
          duration_seconds: chosenDur,
          is_completed: chosenCompleted,
          resume_route: chosenRoute,
          watched_episodes: mergedEps,
          last_watched_at: chosenLastWatched
        });
      } else {
        // Insert client history into DB for user
        const epId = String(ch.episode_id || '1');
        const epNum = String(ch.episode_number || '1');
        const epTitle = ch.episode_title || `Episode ${epNum}`;
        const prog = Number(ch.progress_seconds) || 0;
        const dur = Number(ch.duration_seconds) || 1440;
        const comp = (prog > 0 && dur > 0 && (prog / dur) >= 0.9) ? 1 : 0;
        const watchedJson = JSON.stringify(clientEps.length > 0 ? clientEps : [epId]);
        const lastWatched = ch.last_watched_at || new Date().toISOString();

        try {
          upsertHistory.run(
            targetUser,
            animeId,
            ch.anime_title || 'Tontonan',
            ch.anime_poster || '',
            epId,
            epNum,
            epTitle,
            prog,
            dur,
            comp,
            ch.type || 'anime',
            ch.resume_route || '',
            watchedJson,
            lastWatched
          );
        } catch (_) {}

        historyMap.set(animeId, {
          history_id: `hist_${animeId}`,
          anime_id: animeId,
          anime_title: ch.anime_title || 'Tontonan',
          anime_poster: ch.anime_poster || '',
          episode_id: epId,
          episode_number: epNum,
          episode_title: epTitle,
          progress_seconds: prog,
          duration_seconds: dur,
          is_completed: comp,
          type: ch.type || 'anime',
          resume_route: ch.resume_route || '',
          watched_episodes: clientEps.length > 0 ? clientEps : [epId],
          last_watched_at: lastWatched
        });
      }
    }
  } catch (err) {
    console.warn('Smart merge history warning:', err.message);
  }

  // 3. Return final unified lists from database
  let finalBookmarks = [];
  try {
    finalBookmarks = db.prepare(`
      SELECT 
        id as bookmark_id,
        anime_id as id,
        anime_title as title,
        anime_poster as poster,
        anime_banner as banner,
        anime_status as status,
        anime_genres as genres,
        COALESCE(type, 'anime') as type,
        created_at as bookmarked_at
      FROM bookmarks
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(targetUser);
  } catch (_) {
    finalBookmarks = [];
  }

  let finalHistory = [];
  try {
    finalHistory = db.prepare(`
      SELECT 
        id as history_id,
        anime_id,
        anime_title,
        anime_poster,
        episode_id,
        episode_number,
        episode_title,
        progress_seconds,
        duration_seconds,
        is_completed,
        COALESCE(type, 'anime') as type,
        resume_route,
        COALESCE(watched_episodes, '[]') as watched_episodes,
        last_watched_at,
        ROUND((CAST(progress_seconds AS REAL) / MAX(duration_seconds, 1)) * 100, 1) as progress_percentage
      FROM watch_history
      WHERE user_id = ?
      ORDER BY last_watched_at DESC
    `).all(targetUser).map(row => {
      let parsed = [];
      try { parsed = JSON.parse(row.watched_episodes || '[]'); } catch (_) { parsed = []; }
      if (row.episode_id && !parsed.includes(String(row.episode_id))) parsed.push(String(row.episode_id));
      return { ...row, watched_episodes: parsed };
    });
  } catch (_) {
    finalHistory = [];
  }

  return {
    bookmarks: finalBookmarks,
    history: finalHistory
  };
}
