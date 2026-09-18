// backend/src/routes/products.js
// Routes:
//   GET  /api/products/search?q=        Search the mock store
//   GET  /api/tracked                    List all tracked products
//   POST /api/tracked                    Start tracking a product
//   DELETE /api/tracked/:id              Stop tracking (soft: is_active=false)
//   DELETE /api/tracked/:id/hard        Hard delete (removes history)

'use strict';

const express           = require('express');
const router            = express.Router();
const supabase          = require('../db/supabase');
const { searchProducts } = require('../scraper');

// GET /api/products/search?q=<query>
router.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const products = await searchProducts(query);
    res.json({ products });
  } catch (err) {
    console.error('/search error:', err.message);
    res.status(500).json({ error: 'Search failed', detail: err.message });
  }
});

// GET /api/tracked  → list all tracked products with latest price snapshot
router.get('/', async (req, res) => {
  try {
    // Fetch tracked + product info
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

    // For each product, grab the latest price_history row
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
    console.error('/tracked GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tracked products', detail: err.message });
  }
});

// POST /api/tracked  → add a product to tracking
// Body: { name, product_url, thumbnail_url?, description? }
router.post('/', async (req, res) => {
  const { name, product_url, thumbnail_url, description } = req.body;

  if (!name || !product_url) {
    return res.status(400).json({ error: 'name and product_url are required' });
  }

  try {
    // Upsert product (by URL — unique constraint)
    const { data: product, error: pErr } = await supabase
      .from('products')
      .upsert(
        { name, product_url, thumbnail_url: thumbnail_url || null, description: description || null },
        { onConflict: 'product_url', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (pErr) throw pErr;

    // Upsert tracked_products (one tracking entry per product)
    const { data: tracked, error: tErr } = await supabase
      .from('tracked_products')
      .upsert(
        { product_id: product.id, is_active: true, scrape_interval_minutes: 120 },
        { onConflict: 'product_id', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (tErr) throw tErr;

    res.status(201).json({ message: 'Product added to tracking', product, tracked });
  } catch (err) {
    console.error('/tracked POST error:', err.message);
    res.status(500).json({ error: 'Failed to add product', detail: err.message });
  }
});

// DELETE /api/tracked/:id  → soft-delete (is_active = false)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('tracked_products')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Product deactivated (history preserved)' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate', detail: err.message });
  }
});

// DELETE /api/tracked/:id/hard  → hard delete (cascades history)
router.delete('/:id/hard', async (req, res) => {
  const { id } = req.params;
  try {
    // Get the product_id first
    const { data: t, error: fetchErr } = await supabase
      .from('tracked_products')
      .select('product_id')
      .eq('id', id)
      .single();

    if (fetchErr) throw fetchErr;

    // Delete product (cascades to tracked_products, price_history, scrape_logs)
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
