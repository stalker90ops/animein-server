import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;
let activeDbPath = ':memory:';

try {
  const sqlite = require('node:sqlite');
  if (sqlite && sqlite.DatabaseSync) {
    let resolvedPath = path.join(__dirname, 'animein.db');
    if (process.env.VERCEL) {
      try {
        const tmpDb = path.join(os.tmpdir(), 'animein.db');
        if (!fs.existsSync(tmpDb) && fs.existsSync(resolvedPath)) {
          fs.copyFileSync(resolvedPath, tmpDb);
        }
        resolvedPath = tmpDb;
      } catch (e) {
        resolvedPath = ':memory:';
      }
    }
    activeDbPath = resolvedPath;
    dbInstance = new sqlite.DatabaseSync(resolvedPath);
  }
} catch (e) {
  console.warn('node:sqlite not available, using in-memory mock:', e.message);
}

const mockDb = {
  exec: () => {},
  prepare: () => ({
    all: () => [],
    get: () => null,
    run: () => ({ changes: 1, lastInsertRowid: 1 })
  })
};

export const db = dbInstance || mockDb;

// Initialize tables with relaxed foreign keys so external AnimeIn IDs work seamlessly
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anime (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      synopsis TEXT,
      synonyms TEXT,
      poster TEXT,
      banner TEXT,
      status TEXT DEFAULT 'ONGOING',
      type TEXT DEFAULT 'SERIES',
      year TEXT,
      views TEXT,
      favorites TEXT,
      score REAL DEFAULT 8.5,
      rating TEXT DEFAULT '13+',
      genres TEXT,
      release_day TEXT,
      studio TEXT,
      total_episodes INTEGER DEFAULT 12,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY,
      anime_id INTEGER NOT NULL,
      episode_number TEXT NOT NULL,
      title TEXT,
      video_url TEXT,
      embed_url TEXT,
      duration_seconds INTEGER DEFAULT 1440,
      thumbnail TEXT,
      release_date TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'guest_user',
      anime_id TEXT NOT NULL,
      anime_title TEXT,
      anime_poster TEXT,
      anime_banner TEXT,
      anime_status TEXT,
      anime_genres TEXT,
      type TEXT DEFAULT 'anime',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, anime_id)
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'guest_user',
      anime_id TEXT NOT NULL,
      anime_title TEXT,
      anime_poster TEXT,
      episode_id TEXT NOT NULL,
      episode_number TEXT NOT NULL,
      episode_title TEXT,
      progress_seconds INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 1440,
      is_completed INTEGER DEFAULT 0,
      type TEXT DEFAULT 'anime',
      resume_route TEXT,
      last_watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, anime_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch (err) {
  console.warn('Database table setup skipped/warning:', err.message);
}

// Safe migrations for existing SQLite databases
try { db.exec("ALTER TABLE bookmarks ADD COLUMN type TEXT DEFAULT 'anime'"); } catch (_) {}
try { db.exec("ALTER TABLE watch_history ADD COLUMN type TEXT DEFAULT 'anime'"); } catch (_) {}
try { db.exec("ALTER TABLE watch_history ADD COLUMN resume_route TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE watch_history ADD COLUMN watched_episodes TEXT DEFAULT '[]'"); } catch (_) {}

console.log('✅ SQLite Database connected and initialized at:', activeDbPath);
