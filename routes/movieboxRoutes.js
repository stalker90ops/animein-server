import express from 'express';
import https from 'node:https';
import http2 from 'node:http2';
import {
  getMovieboxCatalog,
  getMovieboxDetail,
  getMovieboxStream,
  getVttSubtitle,
  proxyVideoStream
} from '../services/movieboxService.js';

const router = express.Router();

// GET /api/moviebox - Catalog list with category filtering and search
router.get('/', async (req, res) => {
  try {
    const { category = 'all', page = 1, search = '', limit = 24 } = req.query;
    const result = await getMovieboxCatalog({ category, page, search, limit });
    res.json(result);
  } catch (error) {
    console.error('Moviebox catalog route error:', error);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

// GET /api/moviebox/detail/:id - Detail metadata, seasons, episodes, and cast
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { detailPath = '' } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID film/series wajib disertakan' });
    }
    const result = await getMovieboxDetail(id, detailPath);
    res.json(result);
  } catch (error) {
    console.error('Moviebox detail route error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/moviebox/stream/:id - Stream resolutions, soft subtitles, download links
router.get('/stream/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { detailPath = '', se = 0, ep = 0 } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID film/series wajib disertakan' });
    }
    const result = await getMovieboxStream({
      subjectId: id,
      detailPath,
      se: Number(se) || 0,
      ep: Number(ep) || 0
    });
    res.json(result);
  } catch (error) {
    console.error('Moviebox stream route error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/moviebox/subtitle - Converts remote SRT to WebVTT for native HTML5 video player
router.get('/subtitle', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('Subtitle URL parameter missing');
    }
    const vtt = await getVttSubtitle(url);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(vtt);
  } catch (error) {
    console.error('Moviebox subtitle convert error:', error.message);
    res.status(500).send('Error loading subtitle');
  }
});

// GET /api/moviebox/test-stream-direct - Diagnostic endpoint for video streaming
router.get('/test-stream-direct', (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'url missing' });
    const parsed = new URL(targetUrl);

    const client = http2.connect(`https://${parsed.hostname}`);
    client.on('error', err => {
      res.json({ protocol: 'http2', error: err.message, code: err.code });
    });

    const h2Req = client.request({
      ':path': parsed.pathname + parsed.search,
      ':method': 'GET',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'referer': 'https://themoviebox.xyz/',
      'range': req.headers.range || 'bytes=0-100'
    });

    let chunks = [];
    h2Req.on('response', (headers) => {
      h2Req.on('data', c => chunks.push(c));
      h2Req.on('end', () => {
        const buf = Buffer.concat(chunks);
        client.close();
        res.json({
          protocol: 'http2',
          statusCode: headers[':status'],
          headers,
          length: buf.length,
          hex: buf.slice(0, 16).toString('hex')
        });
      });
    });

    h2Req.on('error', (err) => {
      client.close();
      res.json({ protocol: 'http2', error: err.message });
    });
    h2Req.end();
  } catch (err) {
    res.json({ error: err.message });
  }
});

// GET /api/moviebox/stream-proxy - Video stream proxy with byte-range support
router.get('/stream-proxy', (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).send('Target stream URL missing');
    }
    proxyVideoStream(req, res, targetUrl);
  } catch (error) {
    console.error('Moviebox stream proxy error:', error);
    res.status(500).send('Internal stream proxy error');
  }
});

export default router;
