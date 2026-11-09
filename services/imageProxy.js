import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'cache_images')
  : path.join(__dirname, '../public/cache_images');

try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Cache dir creation skipped/warning:', err.message);
}

export function proxyAndCacheImage(url, res) {
  if (!url || typeof url !== 'string') {
    return res.status(400).send('Invalid URL');
  }

  // Create unique filename based on URL hash
  const hash = crypto.createHash('md5').update(url).digest('hex');
  const filePath = path.join(CACHE_DIR, `${hash}.jpg`);

  // 1. If cached on disk, serve immediately
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.sendFile(filePath);
  }

  // 2. Otherwise download using curl to bypass Cloudflare hotlink protection
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const curl = spawn(curlCmd, [
    '-s',
    '-L',
    '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-H', 'Referer: https://animeinweb.com/',
    '-H', 'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    '--output', filePath,
    url
  ]);

  curl.on('close', (code) => {
    if (code === 0 && fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.sendFile(filePath);
    } else {
      // Clean up failed file
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch(e) {}
      }
      return res.status(502).send('Failed to fetch image');
    }
  });

  curl.on('error', (err) => {
    console.error('Curl image error:', err.message);
    res.status(500).send('Curl error');
  });
}
