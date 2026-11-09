import express from 'express';
import crypto from 'node:crypto';
import { db } from '../database/db.js';
import { sendOtpEmail } from '../services/emailService.js';
import { performSmartMerge } from '../services/syncService.js';

const router = express.Router();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Resilient user resolver: matches exact email, exact username, display_name, or prefix
export function findUserByIdentifier(rawIdentifier) {
  if (!rawIdentifier) return null;
  const clean = String(rawIdentifier).trim().toLowerCase();
  const userPart = clean.includes('@') ? clean.split('@')[0] : clean;

  // 1. Direct exact match on email or username
  let user = db.prepare(`
    SELECT * FROM users 
    WHERE (email IS NOT NULL AND LOWER(email) = ?) 
       OR LOWER(username) = ?
  `).get(clean, clean);
  if (user) return user;

  // 2. If input is email, match on username == userPart OR display_name == userPart OR username LIKE userPart%
  if (clean.includes('@')) {
    user = db.prepare(`
      SELECT * FROM users 
      WHERE LOWER(username) = ? 
         OR (display_name IS NOT NULL AND LOWER(display_name) = ?)
         OR (email IS NULL AND LOWER(username) LIKE ?)
    `).get(userPart, userPart, `${userPart}%`);
    if (user) return user;
  } else {
    // 3. If input is username, match display_name or username prefix
    user = db.prepare(`
      SELECT * FROM users 
      WHERE (display_name IS NOT NULL AND LOWER(display_name) = ?)
         OR LOWER(username) LIKE ?
    `).get(clean, `${clean}%`);
    if (user) return user;
  }

  return null;
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
      INSERT INTO watch_history (user_id, anime_id, anime_title, anime_poster, episode_id, episode_number, episode_title, progress_seconds, duration_seconds, is_completed, type, resume_route, watched_episodes, last_watched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, anime_id) DO UPDATE SET
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
        h.resume_route || '',
        h.watched_episodes || '[]'
      );
    }
    db.prepare('DELETE FROM watch_history WHERE user_id = ?').run(guestUserId);
  } catch (err) {
    console.warn('Guest data migration warning:', err.message);
  }
}

// POST /api/auth/register (Email, Password, DisplayName + Auto-Login + Instant Smart Merge)
router.post('/register', (req, res) => {
  try {
    const { 
      email = '', 
      username = '', 
      password = '', 
      displayName = '', 
      guestUserId = '',
      localBookmarks = [],
      localHistory = []
    } = req.body;

    const cleanEmail = email.trim().toLowerCase();
    let cleanUser = username.trim().toLowerCase();

    // If username not provided, generate from email prefix
    if (!cleanUser && cleanEmail) {
      cleanUser = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    }

    const cleanName = displayName.trim() || cleanUser || cleanEmail.split('@')[0];

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Format alamat email tidak valid.' });
    }

    if (!cleanUser || cleanUser.length < 3) {
      return res.status(400).json({ success: false, message: 'Username atau email minimal 3 karakter.' });
    }

    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, message: 'Kata sandi minimal 4 karakter.' });
    }

    // Check duplicate username or email
    const existing = db.prepare(`
      SELECT id, username, email FROM users 
      WHERE LOWER(username) = ? OR (email IS NOT NULL AND LOWER(email) = ?)
    `).get(cleanUser, cleanEmail || cleanUser);

    if (existing) {
      if (cleanEmail && existing.email && existing.email.toLowerCase() === cleanEmail) {
        return res.status(400).json({ success: false, message: 'Email sudah terdaftar. Silakan masuk atau gunakan menu Lupa Password.' });
      }
      return res.status(400).json({ success: false, message: 'Username atau email sudah digunakan.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUser)}`;

    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, salt, display_name, avatar)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cleanUser, cleanEmail || null, passwordHash, salt, cleanName, avatar);

    if (guestUserId) {
      migrateGuestData(guestUserId, cleanUser);
    }

    // Immediately perform bidirectional smart merge with client data
    const merged = performSmartMerge(cleanUser, localBookmarks, localHistory);

    const newUser = {
      id: Number(result.lastInsertRowid),
      username: cleanUser,
      email: cleanEmail || null,
      displayName: cleanName,
      avatar,
      createdAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: `Pendaftaran berhasil! Selamat datang, ${cleanName}.`,
      user: newUser,
      bookmarks: merged.bookmarks,
      history: merged.history,
      stats: {
        bookmarksCount: merged.bookmarks.length,
        historyCount: merged.history.length
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/login (Login with Email or Username + Password + Smart Merge)
router.post('/login', (req, res) => {
  try {
    const { 
      email = '', 
      username = '', 
      password = '', 
      guestUserId = '',
      localBookmarks = [],
      localHistory = [],
      clientCachedUser = null
    } = req.body;
    const identifier = (email || username || '').trim().toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email / Username dan kata sandi wajib diisi.' });
    }

    // Look up by email or username
    let user = findUserByIdentifier(identifier);

    // Resiliency: If running on fresh serverless cold-start container on Vercel
    // where local SQLite does not yet have this user, re-create from clientCachedUser
    if (!user && clientCachedUser && (clientCachedUser.email === identifier || clientCachedUser.username === identifier)) {
      try {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);
        const uName = clientCachedUser.username || identifier.split('@')[0];
        const dName = clientCachedUser.displayName || uName;
        const uEmail = clientCachedUser.email || (identifier.includes('@') ? identifier : null);
        const uAvatar = clientCachedUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uName)}`;

        db.prepare(`
          INSERT INTO users (username, email, password_hash, salt, display_name, avatar)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uName, uEmail, passwordHash, salt, dName, uAvatar);

        user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(uName);
      } catch (e) {
        console.warn('Re-creating user for container failed:', e.message);
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Email atau kata sandi tidak sesuai.' });
    }

    const testHash = hashPassword(password, user.salt);
    if (testHash !== user.password_hash) {
      return res.status(401).json({ success: false, message: 'Email atau kata sandi tidak sesuai.' });
    }

    if (guestUserId && guestUserId !== user.username) {
      migrateGuestData(guestUserId, user.username);
    }

    // Smart merge local bookmarks and history into user database
    const merged = performSmartMerge(user.username, localBookmarks, localHistory);

    const userPayload = {
      id: user.id,
      username: user.username,
      email: user.email || (identifier.includes('@') ? identifier : null),
      displayName: user.display_name || user.username,
      avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username)}`,
      createdAt: user.created_at
    };

    res.json({
      success: true,
      message: `Selamat datang kembali, ${userPayload.displayName}!`,
      user: userPayload,
      bookmarks: merged.bookmarks,
      history: merged.history,
      stats: {
        bookmarksCount: merged.bookmarks.length,
        historyCount: merged.history.length
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/logout (Safely sync final state to database before clearing client session)
router.post('/logout', (req, res) => {
  try {
    const { userId = '', localBookmarks = [], localHistory = [] } = req.body;
    if (userId && userId !== 'guest_user') {
      performSmartMerge(userId, localBookmarks, localHistory);
    }
    res.json({
      success: true,
      message: 'Berhasil keluar dan data Anda telah diamankan di server.'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/forgot-password (Request 6-digit OTP to Email)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email = '', identifier: rawIdent = '' } = req.body;
    const input = String(email || rawIdent || '').trim();
    const cleanEmail = input.toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Alamat email atau username wajib diisi.' });
    }

    // Find user by email, username, or display_name
    let user = findUserByIdentifier(cleanEmail);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Alamat email atau akun tidak ditemukan. Pastikan email atau username yang Anda masukkan sudah terdaftar.'
      });
    }

    // Determine target email
    const targetEmail = cleanEmail.includes('@') ? cleanEmail : (user.email || `${user.username}@animein.local`);

    // If input has '@' and user has no email or different email, link it!
    if (cleanEmail.includes('@') && (!user.email || user.email.toLowerCase() !== cleanEmail)) {
      try {
        db.prepare('UPDATE users SET email = ? WHERE id = ?').run(cleanEmail, user.id);
        user.email = cleanEmail;
      } catch (_) {}
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Delete older OTPs for this email to avoid confusion
    try {
      db.prepare('DELETE FROM password_resets WHERE LOWER(email) = ? OR LOWER(email) = ?').run(cleanEmail, targetEmail);
    } catch (_) {}

    // Store OTP in database
    db.prepare(`
      INSERT INTO password_resets (email, otp, expires_at)
      VALUES (?, ?, ?)
    `).run(targetEmail, otp, expiresAt);
    if (cleanEmail !== targetEmail) {
      db.prepare(`
        INSERT INTO password_resets (email, otp, expires_at)
        VALUES (?, ?, ?)
      `).run(cleanEmail, otp, expiresAt);
    }

    // Send email
    const emailResult = await sendOtpEmail(targetEmail, otp, user.display_name || user.username);

    if (emailResult.isSimulated) {
      return res.json({
        success: true,
        isSimulated: true,
        simulatedOtp: otp,
        email: targetEmail,
        message: `Kode OTP verifikasi berhasil dibuat! Karena server email (SMTP) belum dikonfigurasi di dashboard hosting, Anda dapat menggunakan kode OTP berikut: ${otp}`
      });
    }

    res.json({
      success: true,
      email: targetEmail,
      message: `Kode verifikasi OTP 6 digit telah dikirim ke ${targetEmail}. Silakan periksa kotak masuk atau folder spam email Anda.`
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/reset-password (Verify OTP and Set New Password)
router.post('/reset-password', (req, res) => {
  try {
    const { email = '', otp = '', newPassword = '' } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanOtp = String(otp || '').trim();

    if (!cleanEmail || !cleanOtp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email / username, kode OTP, dan kata sandi baru wajib diisi.' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Kata sandi baru minimal 4 karakter.' });
    }

    // Find user first
    const user = findUserByIdentifier(cleanEmail);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Akun dengan email atau username tersebut tidak ditemukan.' });
    }

    const userEmail = (user.email || '').toLowerCase();

    // Verify OTP record
    const resetRecord = db.prepare(`
      SELECT * FROM password_resets 
      WHERE (LOWER(email) = ? OR LOWER(email) = ?) AND otp = ?
      ORDER BY id DESC LIMIT 1
    `).get(cleanEmail, userEmail, cleanOtp);

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Kode OTP salah atau tidak sesuai. Periksa kembali kode pada email Anda.'
      });
    }

    // Check expiration
    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Kode OTP telah kedaluwarsa (masa berlaku 15 menit habis). Silakan minta kode baru.'
      });
    }

    // Update password in users table
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(newPassword, salt);

    if (cleanEmail.includes('@') && !user.email) {
      db.prepare('UPDATE users SET password_hash = ?, salt = ?, email = ? WHERE id = ?').run(passwordHash, salt, cleanEmail, user.id);
    } else {
      db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(passwordHash, salt, user.id);
    }

    // Invalidate used OTP
    try {
      db.prepare('DELETE FROM password_resets WHERE LOWER(email) = ? OR LOWER(email) = ?').run(cleanEmail, userEmail);
    } catch (_) {}

    res.json({
      success: true,
      message: 'Kata sandi berhasil diperbarui! Silakan masuk dengan kata sandi baru Anda.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  try {
    const identifier = (req.headers['x-user-id'] || req.query.userId || '').toString().trim().toLowerCase();
    if (!identifier) {
      return res.json({ success: true, user: null });
    }

    const user = db.prepare(`
      SELECT id, username, email, display_name, avatar, created_at 
      FROM users 
      WHERE (email IS NOT NULL AND LOWER(email) = ?) OR LOWER(username) = ?
    `).get(identifier, identifier);

    if (!user) {
      return res.json({ success: true, user: null });
    }

    const bmCount = db.prepare('SELECT COUNT(*) as count FROM bookmarks WHERE user_id = ?').get(user.username)?.count || 0;
    const histCount = db.prepare('SELECT COUNT(*) as count FROM watch_history WHERE user_id = ?').get(user.username)?.count || 0;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
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
      SELECT id, username, email, display_name as displayName, avatar
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
