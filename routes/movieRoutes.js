import express from 'express';
import { getLk21Movies, getLk21MovieDetail, resolveLk21Stream } from '../services/lk21Api.js';

const router = express.Router();

// GET Movie List from Layarkaca21 (LK21)
router.get('/', async (req, res) => {
  try {
    const { category = 'populer', genre = '', genres = '', year = '', page = 1, search = '', includeTrailers = 'false' } = req.query;

    const lk21Movies = await getLk21Movies({
      category,
      genre,
      genres,
      year,
      page: parseInt(page) || 1,
      search: search ? search.trim() : '',
      includeTrailers: includeTrailers === 'true'
    });

    res.json({
      success: true,
      count: lk21Movies.length,
      page: parseInt(page) || 1,
      data: lk21Movies
    });
  } catch (error) {
    console.error('Error in /api/movies route:', error.message);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

// GET LK21 Movie Detail with Streaming Servers
router.get('/lk21/detail/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const detail = await getLk21MovieDetail(slug);
    res.json({ success: true, data: detail });
  } catch (error) {
    console.error(`Error in /lk21/detail/${req.params.slug}:`, error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET LK21 HLS M3U8 Master/Playlist Stream Proxy
router.get('/lk21/stream.m3u8', async (req, res) => {
  try {
    const { embedUrl, fileUrl: directUrl } = req.query;

    let targetM3u8Url = directUrl;
    if (!targetM3u8Url && embedUrl) {
      targetM3u8Url = await resolveLk21Stream(embedUrl);
    }

    if (!targetM3u8Url) {
      return res.status(404).send('Stream tidak ditemukan atau tidak dapat di-resolve');
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const response = await fetch(targetM3u8Url, {
      headers: {
        'Referer': 'https://playcdn.de/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch m3u8: ${response.status}`);
    }

    let m3u8Content = await response.text();
    const baseUrl = targetM3u8Url.substring(0, targetM3u8Url.lastIndexOf('/') + 1);

    // Rewrite relative paths inside m3u8 playlist through our segment proxy
    m3u8Content = m3u8Content.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      let absoluteSegmentUrl = trimmed;
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        absoluteSegmentUrl = baseUrl + trimmed;
      }
      return `/api/movies/lk21/segment?url=${encodeURIComponent(absoluteSegmentUrl)}`;
    }).join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(m3u8Content);
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error proxying LK21 m3u8 stream:', error.message);
    }
    if (!res.headersSent) {
      res.status(500).send('Error proxying LK21 stream');
    }
  }
});

// GET LK21 Video Segment Proxy (.ts/.pict files with partial content support)
router.get('/lk21/segment', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL segmen diperlukan');

    const headers = {
      'Referer': 'https://playcdn.de/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok && response.status !== 206) {
      if (!res.headersSent) {
        return res.status(response.status).send(`Segment error: ${response.status}`);
      }
      return;
    }

    res.status(response.status);
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
    if (response.headers.get('content-length')) {
      res.setHeader('Content-Length', response.headers.get('content-length'));
    }
    if (response.headers.get('content-range')) {
      res.setHeader('Content-Range', response.headers.get('content-range'));
    }

    if (response.body) {
      const { Readable } = await import('stream');
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.on('error', (err) => {
        // Safely suppress client abort or broken pipe without bubbling unhandled exception
      });
      res.on('error', () => {
        try { nodeStream.destroy(); } catch (_) {}
      });
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('LK21 segment proxy closed:', error.message);
    }
  }
});

// GET LK21 Embed Frame Proxy (removes frame-busting headers for smooth fallback playback)
router.get('/lk21/embed-frame', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL embed diperlukan');

    let targetUrl = url;

    // If url is a videonode iframe, query videonode api to get actual inner player URL
    const m = url.match(/iframe3\/([^/]+)\/([^/?]+)/);
    if (m) {
      const host = m[1];
      const id = m[2];
      try {
        const apiRes = await fetch('https://videonode.de/api.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://videonode.de/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: `host=${encodeURIComponent(host)}&id=${encodeURIComponent(id)}`,
          signal: AbortSignal.timeout(6000)
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData?.embedUrl) {
            targetUrl = apiData.embedUrl;
          }
        }
      } catch (e) {
        console.warn('Videonode api resolution fallback:', e.message);
      }
    }

    const response = await fetch(targetUrl, {
      headers: {
        'Referer': new URL(targetUrl).origin + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.status(response.status).send('Gagal memuat embed');
    }

    let html = await response.text();
    const baseOrigin = new URL(targetUrl).origin;

    // Safely remove anti-debugger, parent frame checks, ads, and redirection loops without wiping player scripts
    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match, inner) => {
      if (/devtoolIsOpening|window\.self\s*===\s*window\.top|top\.location\s*==\s*self\.location|uyeouyeo|yellowishgather/i.test(inner)) {
        return '';
      }
      return match;
    });
    html = html.replace(/<a[^>]*id="uyeouyeo"[\s\S]*?<\/a>/gi, '');
    html = html.replace(/if\s*\(\s*window\.self\s*===\s*window\.top\s*\)[\s\S]*?}/gi, '');
    html = html.replace(/if\s*\(\s*top\.location\s*==\s*self\.location[\s\S]*?}/gi, '');

    // Inject base tag and styling
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head><base href="${baseOrigin}/"><style>body,html{margin:0;padding:0;overflow:hidden;background:#000;width:100%;height:100%;}</style>`);
    } else {
      html = `<head><base href="${baseOrigin}/"><style>body,html{margin:0;padding:0;overflow:hidden;background:#000;width:100%;height:100%;}</style></head>` + html;
    }

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(html);
  } catch (error) {
    console.error('Error proxying embed frame:', error.message);
    res.status(500).send('Error proxying embed frame');
  }
});

export default router;
