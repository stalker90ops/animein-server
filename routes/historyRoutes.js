import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// GET all watch history for user
router.get('/', (req, res) => {
  try {
    const { userId = 'guest_user' } = req.query;

    const history = db.prepare(`
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
    `).all(userId).map((row) => {
      let parsedEps = [];
      try {
        parsedEps = JSON.parse(row.watched_episodes || '[]');
      } catch (_) {
        parsedEps = [];
      }
      if (row.episode_id && !parsedEps.includes(String(row.episode_id))) {
        parsedEps.push(String(row.episode_id));
      }
      return {
        ...row,
        watched_episodes: parsedEps
      };
    });

    res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update or add watch progress (Upsert)
router.post('/update', (req, res) => {
  try {
    const {
      userId = 'guest_user',
      animeId,
      animeTitle = 'Anime',
      animePoster = '',
      episodeId = '1',
      episodeNumber = '1',
      episodeTitle = 'Episode 1',
      progressSeconds = 0,
      durationSeconds = 1440,
      type = 'anime',
      resumeRoute = ''
    } = req.body;

    if (!animeId) {
      return res.status(400).json({ success: false, message: 'animeId wajib disertakan' });
    }

    const cleanAnimeId = String(animeId);
    const cleanEpisodeId = String(episodeId);
    const isCompleted = progressSeconds > 0 && durationSeconds > 0 && (progressSeconds / durationSeconds) >= 0.9 ? 1 : 0;

    // Merge with existing watched_episodes list so all previously watched episodes remain marked
    let watchedList = [];
    try {
      const existing = db.prepare('SELECT episode_id, watched_episodes FROM watch_history WHERE user_id = ? AND anime_id = ?').get(userId, cleanAnimeId);
      if (existing) {
        watchedList = JSON.parse(existing.watched_episodes || '[]');
        if (existing.episode_id && !watchedList.includes(String(existing.episode_id))) {
          watchedList.push(String(existing.episode_id));
        }
      }
    } catch (_) {
      watchedList = [];
    }
    if (!watchedList.includes(cleanEpisodeId)) {
      watchedList.push(cleanEpisodeId);
    }
    const watchedJson = JSON.stringify(watchedList);

    const upsertQuery = db.prepare(`
      INSERT INTO watch_history (user_id, anime_id, anime_title, anime_poster, episode_id, episode_number, episode_title, progress_seconds, duration_seconds, is_completed, type, resume_route, watched_episodes, last_watched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        last_watched_at = CURRENT_TIMESTAMP
    `);

    upsertQuery.run(
      userId,
      cleanAnimeId,
      animeTitle,
      animePoster,
      cleanEpisodeId,
      String(episodeNumber),
      episodeTitle,
      Math.floor(progressSeconds),
      Math.floor(durationSeconds),
      isCompleted,
      type,
      resumeRoute,
      watchedJson
    );

    res.json({ success: true, message: 'Progress tontonan berhasil disimpan', watched_episodes: watchedList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete history for single anime
router.delete('/:animeId', (req, res) => {
  try {
    const { animeId } = req.params;
    const { userId = 'guest_user' } = req.query;

    db.prepare('DELETE FROM watch_history WHERE user_id = ? AND anime_id = ?').run(userId, String(animeId));
    res.json({ success: true, message: 'Riwayat tontonan berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clear all history for user
router.delete('/clear/all', (req, res) => {
  try {
    const { userId = 'guest_user' } = req.query;

    db.prepare('DELETE FROM watch_history WHERE user_id = ?').run(userId);
    res.json({ success: true, message: 'Semua riwayat tontonan berhasil dibersihkan' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
