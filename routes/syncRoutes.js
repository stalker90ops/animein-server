import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// 1. Export all bookmarks and watch history
router.get('/export', (req, res) => {
  try {
    const { userId = 'guest_user' } = req.query;

    const bookmarks = db.prepare('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    const history = db.prepare('SELECT * FROM watch_history WHERE user_id = ? ORDER BY last_watched_at DESC').all(userId);

    res.json({
      success: true,
      data: {
        version: '1.0',
        app: 'AnimeIn Web',
        exported_at: new Date().toISOString(),
        user_id: userId,
        stats: {
          bookmarks_count: bookmarks.length,
          history_count: history.length
        },
        bookmarks,
        watch_history: history
      }
    });
  } catch (error) {
    console.error('Error exporting sync data:', error);
    res.status(500).json({ success: false, message: 'Gagal mengekspor data: ' + error.message });
  }
});

// 2. Import and merge bookmarks and watch history
router.post('/import', (req, res) => {
  try {
    const { bookmarks = [], watch_history = [], userId = 'guest_user' } = req.body;

    let bookmarkImported = 0;
    let historyImported = 0;

    // Prepared statements
    const insertBookmark = db.prepare(`
      INSERT INTO bookmarks (user_id, anime_id, anime_title, anime_poster, anime_banner, anime_status, anime_genres, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, anime_id) DO UPDATE SET
        anime_title = excluded.anime_title,
        anime_poster = excluded.anime_poster,
        anime_banner = excluded.anime_banner,
        anime_status = excluded.anime_status,
        anime_genres = excluded.anime_genres
    `);

    const insertHistory = db.prepare(`
      INSERT INTO watch_history (
        user_id, anime_id, anime_title, anime_poster,
        episode_id, episode_number, episode_title,
        progress_seconds, duration_seconds, is_completed, last_watched_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, anime_id) DO UPDATE SET
        anime_title = excluded.anime_title,
        anime_poster = excluded.anime_poster,
        episode_id = excluded.episode_id,
        episode_number = excluded.episode_number,
        episode_title = excluded.episode_title,
        progress_seconds = excluded.progress_seconds,
        duration_seconds = excluded.duration_seconds,
        is_completed = excluded.is_completed,
        last_watched_at = excluded.last_watched_at
    `);

    // Import Bookmarks
    for (const b of bookmarks) {
      if (!b.anime_id) continue;
      try {
        insertBookmark.run(
          userId,
          parseInt(b.anime_id),
          b.anime_title || '',
          b.anime_poster || '',
          b.anime_banner || '',
          b.anime_status || '',
          b.anime_genres || '',
          b.created_at || new Date().toISOString()
        );
        bookmarkImported++;
      } catch (err) {
        console.error('Error importing single bookmark:', err.message);
      }
    }

    // Import Watch History
    for (const h of watch_history) {
      if (!h.anime_id || !h.episode_id) continue;
      try {
        insertHistory.run(
          userId,
          parseInt(h.anime_id),
          h.anime_title || '',
          h.anime_poster || '',
          parseInt(h.episode_id),
          String(h.episode_number || '1'),
          h.episode_title || '',
          parseInt(h.progress_seconds) || 0,
          parseInt(h.duration_seconds) || 1440,
          h.is_completed ? 1 : 0,
          h.last_watched_at || new Date().toISOString()
        );
        historyImported++;
      } catch (err) {
        console.error('Error importing single history:', err.message);
      }
    }

    res.json({
      success: true,
      message: `Berhasil mengimpor ${bookmarkImported} bookmark dan ${historyImported} riwayat tonton.`,
      stats: {
        imported_bookmarks: bookmarkImported,
        imported_history: historyImported
      }
    });
  } catch (error) {
    console.error('Error importing sync data:', error);
    res.status(500).json({ success: false, message: 'Gagal mengimpor data: ' + error.message });
  }
});

// 3. Get Settings (e.g. Google Client ID, last sync)
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Save Settings
router.post('/settings', (req, res) => {
  try {
    const { settings = {} } = req.body;
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const [k, v] of Object.entries(settings)) {
      upsert.run(String(k), String(v));
    }

    res.json({ success: true, message: 'Pengaturan berhasil disimpan' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
