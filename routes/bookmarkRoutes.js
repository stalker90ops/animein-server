import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// GET all bookmarks for user
router.get('/', (req, res) => {
  try {
    const { userId = 'guest_user' } = req.query;

    const bookmarks = db.prepare(`
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
    `).all(userId);

    res.json({ success: true, count: bookmarks.length, data: bookmarks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle bookmark
router.post('/toggle', (req, res) => {
  try {
    const {
      userId = 'guest_user',
      animeId,
      title = 'Anime',
      poster = '',
      banner = '',
      status = 'Ongoing',
      genres = '',
      type = 'anime'
    } = req.body;

    if (!animeId) {
      return res.status(400).json({ success: false, message: 'animeId wajib disertakan' });
    }

    const cleanId = String(animeId);
    const existing = db.prepare('SELECT id FROM bookmarks WHERE user_id = ? AND anime_id = ?').get(userId, cleanId);

    if (existing) {
      db.prepare('DELETE FROM bookmarks WHERE id = ?').run(existing.id);
      return res.json({ success: true, isBookmarked: false, message: 'Bookmark dihapus' });
    } else {
      db.prepare(`
        INSERT INTO bookmarks (user_id, anime_id, anime_title, anime_poster, anime_banner, anime_status, anime_genres, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        cleanId,
        title,
        poster,
        banner || poster,
        status,
        genres,
        type
      );
      return res.json({ success: true, isBookmarked: true, message: 'Berhasil ditambahkan ke bookmark' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove bookmark
router.delete('/:animeId', (req, res) => {
  try {
    const { animeId } = req.params;
    const { userId = 'guest_user' } = req.query;

    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND anime_id = ?').run(userId, String(animeId));
    res.json({ success: true, message: 'Bookmark berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
