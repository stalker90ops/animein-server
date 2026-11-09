import express from 'express';
import {
  getNontondramaSeries,
  getNontondramaDetail,
  getNontondramaEpisode
} from '../services/nontondramaApi.js';

const router = express.Router();

// GET Series List from tv.nontondrama.vip
router.get('/', async (req, res) => {
  try {
    const { category = 'latest', genre = '', genres = '', year = '', page = 1, search = '' } = req.query;
    const series = await getNontondramaSeries({
      category,
      genre,
      genres,
      year,
      page: parseInt(page) || 1,
      search: search ? search.trim() : ''
    });

    res.json({
      success: true,
      count: series.length,
      page: parseInt(page) || 1,
      data: series
    });
  } catch (error) {
    console.error('Error in /api/series route:', error.message);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

// GET Series Detail with Full Seasons & Episodes
router.get('/detail/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const detail = await getNontondramaDetail(slug);
    res.json({ success: true, data: detail });
  } catch (error) {
    console.error(`Error in /api/series/detail/${req.params.slug}:`, error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Series Episode Stream URL and Servers
router.get('/episode/:episodeSlug', async (req, res) => {
  try {
    const { episodeSlug } = req.params;
    const stream = await getNontondramaEpisode(episodeSlug);
    res.json({ success: true, data: stream });
  } catch (error) {
    console.error(`Error in /api/series/episode/${req.params.episodeSlug}:`, error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
