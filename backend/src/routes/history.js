// backend/src/routes/history.js
// Routes:
//   GET /api/history/:productId          Price history for a product
//   GET /api/logs/:productId             Scrape logs for a product

'use strict';

const express   = require('express');
const router    = express.Router();
const supabase  = require('../db/supabase');

// GET /api/history/:productId?limit=50&from=ISO&to=ISO
router.get('/:productId', async (req, res) => {
  const { productId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit || '200', 10), 500);
  const from   = req.query.from;   // optional ISO date
  const to     = req.query.to;     // optional ISO date

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
    console.error('/history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history', detail: err.message });
  }
});

// GET /api/logs/:productId?limit=50
router.get('/:productId', async (req, res) => {
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
    console.error('/logs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch logs', detail: err.message });
  }
});

module.exports = router;
