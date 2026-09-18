// backend/src/routes/tracked.js
// Tracked product CRUD routes (mounted at /api/tracked)
//   GET    /api/tracked              List all tracked products
//   POST   /api/tracked              Add product to tracking
//   DELETE /api/tracked/:id          Soft deactivate
//   DELETE /api/tracked/:id/hard    Hard delete with history

'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');

// GET /api/tracked
router.get('/', async (req, res) => {
  try {
    const { data: tracked, error } = await supabase
      .from('tracked_products')
      .select(`
        id,
        is_active,
        scrape_interval_minutes,
        created_at,
        products (
          id, name, product_url, thumbnail_url, description, created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich each entry with its latest price_history row
    const enriched = await Promise.all(
      (tracked || []).map(async (t) => {
        const { data: latest } = await supabase
          .from('price_history')
          .select('price, stock_status, scraped_at')
          .eq('product_id', t.products.id)
          .order('scraped_at', { ascending: false })
          .limit(1)
          .single();

        return { ...t, latestPrice: latest || null };
      })
    );

    res.json({ tracked: enriched });
  } catch (err) {
    console.error('GET /tracked error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tracked products', detail: err.message });
  }
});

// POST /api/tracked — body: { name, product_url, thumbnail_url?, description? }
router.post('/', async (req, res) => {
  const { name, product_url, thumbnail_url, description } = req.body;
  if (!name || !product_url) {
    return res.status(400).json({ error: 'name and product_url are required' });
  }

  try {
    // Upsert product (unique on product_url)
    const { data: product, error: pErr } = await supabase
      .from('products')
      .upsert(
        { name, product_url, thumbnail_url: thumbnail_url || null, description: description || null },
        { onConflict: 'product_url' }
      )
      .select()
      .single();

    if (pErr) throw pErr;

    // Upsert tracked entry
    const { data: tracked, error: tErr } = await supabase
      .from('tracked_products')
      .upsert(
        { product_id: product.id, is_active: true, scrape_interval_minutes: 120 },
        { onConflict: 'product_id' }
      )
      .select()
      .single();

    if (tErr) throw tErr;

    res.status(201).json({ message: 'Product added to tracking', product, tracked });
  } catch (err) {
    console.error('POST /tracked error:', err.message);
    res.status(500).json({ error: 'Failed to add product', detail: err.message });
  }
});

// DELETE /api/tracked/:id — soft deactivate (preserves history)
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('tracked_products')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Tracking deactivated — history preserved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate', detail: err.message });
  }
});

// DELETE /api/tracked/:id/hard — hard delete (cascades all history)
router.delete('/:id/hard', async (req, res) => {
  try {
    const { data: t, error: fetchErr } = await supabase
      .from('tracked_products')
      .select('product_id')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;

    const { error: delErr } = await supabase
      .from('products')
      .delete()
      .eq('id', t.product_id);

    if (delErr) throw delErr;
    res.json({ message: 'Product and all history permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to hard delete', detail: err.message });
  }
});

module.exports = router;
