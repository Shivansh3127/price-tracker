// backend/src/routes/history.js
// Read endpoints for price history and scrape logs.
// Mounted at both /api/history and /api/logs in index.js.

'use strict';

const express   = require('express');
const router    = express.Router();
const supabase  = require('../db/supabase');

// GET /api/history/:productId?limit=200&from=ISO&to=ISO
router.get('/history/:productId', async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
  const from  = req.query.from;
  const to    = req.query.to;

  try {
    let query = supabase
      .from('price_history')
      .select('id, price, stock_status, scraped_at')
      .eq('product_id', productId)
      .order('scraped_at', { ascending: true })
      .limit(limit);

    if (from) query = query.gte('scraped_at', from);
    if (to)   query = query.lte('scraped_at', to);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ history: data || [] });
  } catch (err) {
    console.error('GET /history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history', detail: err.message });
  }
});

// GET /api/logs/:productId?limit=50
router.get('/logs/:productId', async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

  try {
    const { data, error } = await supabase
      .from('scrape_logs')
      .select('id, attempted_at, status, http_status, error_message, retry_count, duration_ms')
      .eq('product_id', productId)
      .order('attempted_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    console.error('GET /logs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch logs', detail: err.message });
  }
});

module.exports = router;
