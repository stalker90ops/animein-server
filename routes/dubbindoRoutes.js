import express from 'express';
import { getDubbindoCatalog, getDubbindoDetail, searchDubbindo } from '../services/dubbindoService.js';

const router = express.Router();

// GET /api/dubbindo - Catalog list with grouping and pagination
router.get('/', async (req, res) => {
  try {
    const { category = 'all', page = 1, search = '' } = req.query;
    const result = await getDubbindoCatalog({ category, page, search });
    res.json(result);
  } catch (error) {
    console.error('Dubbindo catalog route error:', error);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

// GET /api/dubbindo/search - Search specifically
router.get('/search', async (req, res) => {
  try {
    const { keyword = '', q = '', page = 1 } = req.query;
    const term = (keyword || q || '').trim();
    if (!term) {
      return res.json({ success: true, data: [] });
    }
    const result = await searchDubbindo(term, page);
    res.json(result);
  } catch (error) {
    console.error('Dubbindo search route error:', error);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

// GET /api/dubbindo/detail/:slug - Full detail with episodes & stream resolutions
router.get('/detail/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Slug video wajib disertakan' });
    }
    const result = await getDubbindoDetail(slug);
    res.json(result);
  } catch (error) {
    console.error('Dubbindo detail route error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/dubbindo/stream/:slug - Fetch streams
router.get('/stream/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const detail = await getDubbindoDetail(slug);
    if (!detail.success) {
      return res.status(404).json(detail);
    }
    res.json({
      success: true,
      title: detail.title,
      streams: detail.streams,
      embedUrl: detail.embedUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
