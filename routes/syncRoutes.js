import express from 'express';
import { db } from '../database/db.js';
import { performSmartMerge } from '../services/syncService.js';

const router = express.Router();

// 0. Bidirectional Smart Sync (Used on login, registration, and background sync)
router.post('/bidirectional', (req, res) => {
  try {
    const { userId = 'guest_user', localBookmarks = [], localHistory = [] } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId wajib disertakan' });
    }

    const result = performSmartMerge(userId, localBookmarks, localHistory);
    res.json({
      success: true,
      message: 'Sinkronisasi riwayat dan bookmark berhasil',
      bookmarks: result.bookmarks,
      history: result.history,
      stats: {
        bookmarksCount: result.bookmarks.length,
        historyCount: result.history.length
      }
    });
  } catch (error) {
    console.error('Bidirectional sync error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

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

    const result = performSmartMerge(userId, bookmarks, watch_history);

    res.json({
      success: true,
      message: `Berhasil menyinkronkan ${result.bookmarks.length} bookmark dan ${result.history.length} riwayat tonton.`,
      stats: {
        bookmarksCount: result.bookmarks.length,
        historyCount: result.history.length
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
