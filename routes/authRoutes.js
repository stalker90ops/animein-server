import express from 'express';
import crypto from 'node:crypto';
import { db } from '../database/db.js';

const router = express.Router();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Migrate guest bookmarks and watch history to logged in user
function migrateGuestData(guestUserId, targetUsername) {
  if (!guestUserId || !targetUsername || guestUserId === targetUsername) return;
  try {
    // 1. Migrate bookmarks (ignore conflicts if already bookmarked)
    const guestBookmarks = db.prepare('SELECT * FROM bookmarks WHERE user_id = ?').all(guestUserId);
    const insertBm = db.prepare(`
      INSERT INTO bookmarks (user_id, anime_id, anime_title, anime_poster, anime_banner, anime_status, anime_genres, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, anime_id) DO NOTHING
    `);
    for (const b of guestBookmarks) {
      insertBm.run(
        targetUsername,
        b.anime_id,
        b.anime_title,
        b.anime_poster,
        b.anime_banner,
        b.anime_status,
        b.anime_genres,
        b.type || 'anime'
      );
    }
    db.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(guestUserId);

    // 2. Migrate watch history
    const guestHistory = db.prepare('SELECT * FROM watch_history WHERE user_id = ?').all(guestUserId);
    const insertHist = db.prepare(`
      INSERT INTO watch_history (user_id, anime_id, anime_title, anime_poster, episode_id, episode_number, episode_title, progress_seconds, duration_seconds, is_completed, type, resume_route)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, anime_id) DO UPDATE SET
        episode_id = excluded.episode_id,
        episode_number = excluded.episode_number,
        episode_title = excluded.episode_title,
        progress_seconds = excluded.progress_seconds,
        duration_seconds = excluded.duration_seconds,
        is_completed = excluded.is_completed,
        type = excluded.type,
        resume_route = excluded.resume_route,
        last_watched_at = CURRENT_TIMESTAMP
    `);
    for (const h of guestHistory) {
      insertHist.run(
        targetUsername,
        h.anime_id,
        h.anime_title,
        h.anime_poster,
        h.episode_id,
        h.episode_number,
        h.episode_title,
        h.progress_seconds,
        h.duration_seconds,
        h.is_completed || 0,
        h.type || 'anime',
        h.resume_route || ''
      );
    }
    db.prepare('DELETE FROM watch_history WHERE user_id = ?').run(guestUserId);
  } catch (err) {
    console.warn('Guest data migration error:', err.message);
  }
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { username = '', password = '', displayName = '', guestUserId = '' } = req.body;

    const cleanUser = username.trim().toLowerCase();
    const cleanName = displayName.trim() || cleanUser;

    if (!cleanUser || cleanUser.length < 3) {
      return res.status(400).json({ success: false, message: 'Username minimal 3 karakter.' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUser)) {
      return res.status(400).json({ success: false, message: 'Username hanya boleh huruf, angka, dan garis bawah (_).' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, message: 'Kata sandi minimal 4 karakter.' });
    }

    // Check duplicate
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(cleanUser);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan. Silakan gunakan yang lain.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUser)}`;

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, salt, display_name, avatar)
      VALUES (?, ?, ?, ?, ?)
    `).run(cleanUser, passwordHash, salt, cleanName, avatar);

    // Auto-migrate guest data if available
    if (guestUserId) {
      migrateGuestData(guestUserId, cleanUser);
    }

    const newUser = {
      id: Number(result.lastInsertRowid),
      username: cleanUser,
      displayName: cleanName,
      avatar,
      createdAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Pendaftaran akun berhasil!',
      user: newUser
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { username = '', password = '', guestUserId = '' } = req.body;
    const cleanUser = username.trim().toLowerCase();

    if (!cleanUser || !password) {
      return res.status(400).json({ success: false, message: 'Username dan kata sandi wajib diisi.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(cleanUser);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau kata sandi salah.' });
    }

    const testHash = hashPassword(password, user.salt);
    if (testHash !== user.password_hash) {
      return res.status(401).json({ success: false, message: 'Username atau kata sandi salah.' });
    }

    // Auto-migrate guest data if user had bookmarks/history as guest
    if (guestUserId && guestUserId !== cleanUser) {
      migrateGuestData(guestUserId, cleanUser);
    }

    const userPayload = {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username)}`,
      createdAt: user.created_at
    };

    res.json({
      success: true,
      message: `Selamat datang kembali, ${userPayload.displayName}!`,
      user: userPayload
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  try {
    const username = (req.headers['x-user-id'] || req.query.userId || '').toString().trim().toLowerCase();
    if (!username) {
      return res.json({ success: true, user: null });
    }

    const user = db.prepare('SELECT id, username, display_name, avatar, created_at FROM users WHERE LOWER(username) = ?').get(username);
    if (!user) {
      return res.json({ success: true, user: null });
    }

    // Also get counts of bookmarks & history
    const bmCount = db.prepare('SELECT COUNT(*) as count FROM bookmarks WHERE user_id = ?').get(user.username)?.count || 0;
    const histCount = db.prepare('SELECT COUNT(*) as count FROM watch_history WHERE user_id = ?').get(user.username)?.count || 0;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
        createdAt: user.created_at,
        bookmarksCount: bmCount,
        historyCount: histCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/users (for remote/TV quick profile switcher)
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, display_name as displayName, avatar
      FROM users
      ORDER BY id DESC
      LIMIT 10
    `).all();

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
