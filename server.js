import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './database/db.js';
import animeRoutes from './routes/animeRoutes.js';
import bookmarkRoutes from './routes/bookmarkRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import movieRoutes from './routes/movieRoutes.js';
import seriesRoutes from './routes/seriesRoutes.js';
import authRoutes from './routes/authRoutes.js';

import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Support public, dist, or repo client/dist
const distPath = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, '../client/dist');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/anime', animeRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'AnimeIn Web Platform',
    source: 'animeinweb.com (Live API + SQLite Cache)',
    timestamp: new Date().toISOString()
  });
});

// Direct APK Downloads (Mobile Web & Android TV Release)
const projectDir = path.resolve(__dirname, '../../');
const tvReleaseApk = path.join(projectDir, 'AnimeIn-TV-Release.apk');
const webReleaseApk = path.join(projectDir, 'AnimeIn-Web-Release.apk');

app.get(['/AnimeIn-Web-Release.apk', '/animein-web.apk', '/downloads/animein-web.apk'], (req, res) => {
  res.download(webReleaseApk, 'AnimeIn-Web-Release.apk');
});

app.get(['/AnimeIn-TV-Release.apk', '/animein-tv.apk', '/downloads/animein-tv.apk'], (req, res) => {
  res.download(tvReleaseApk, 'AnimeIn-TV-Release.apk');
});

// Serve compiled React frontend
app.use(express.static(distPath));

// SPA fallback for React Router DOM
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

// Prevent uncaught errors or aborted client requests from terminating the process
process.on('uncaughtException', (err) => {
  console.warn('Caught uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('Caught unhandledRejection:', reason?.message || reason);
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 AnimeIn Web Platform is LIVE!`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📦 Database: SQLite (animein.db)`);
  console.log(`📡 Connected to Live animeinweb.com APIs`);
  console.log(`====================================================`);
});

export default app;
