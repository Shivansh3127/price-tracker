// backend/src/routes/cron.js
// Protected endpoint called by cron-job.org every 2 hours.
//
// Security: checks X-Cron-Token header against CRON_SECRET env var.
//           Returns 401 if missing or wrong — never leaks the secret.
//
// Isolation: each product is scraped in its own try/catch block.
//            One failure NEVER stops other products from being scraped.

'use strict';

const express                  = require('express');
const router                   = express.Router();
const supabase                 = require('../db/supabase');
const { scrapeTrackedProduct } = require('../scraper');

// POST /api/cron/scrape
router.post('/scrape', async (req, res) => {
  // ── Auth ──────────────────────────────────────────────────
  const token  = req.headers['x-cron-token'];
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('[cron] CRON_SECRET env var is not set!');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (!token || token !== secret) {
    console.warn(`[cron] Unauthorized cron attempt — token mismatch`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately so cron-job.org doesn't time out
  // (Playwright scrapes can take 20+ seconds per product)
  res.status(202).json({
    message   : 'Cron job accepted — scraping in background',
    startedAt : new Date().toISOString(),
  });

  // ── Run scrapes in background (after response sent) ───────
  setImmediate(async () => {
    console.log(`[cron] ${new Date().toISOString()} — cron job started`);

    let tracked;
    try {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*, products(*)')
        .eq('is_active', true);

      if (error) throw error;
      tracked = data || [];
    } catch (err) {
      console.error('[cron] Failed to fetch tracked products:', err.message);
      return;
    }

    if (tracked.length === 0) {
      console.log('[cron] No active tracked products — nothing to scrape');
      return;
    }

    console.log(`[cron] Scraping ${tracked.length} product(s)...`);

    const results = { success: 0, failed: 0 };

    for (const item of tracked) {
      // Per-product isolation: one failure never blocks the next product
      try {
        const result = await scrapeTrackedProduct(item, false);
        if (result.success) results.success++;
        else                results.failed++;
      } catch (err) {
        // This catch should never fire (scrapeTrackedProduct catches internally),
        // but kept as a safety net.
        results.failed++;
        console.error(
          `[cron] Unexpected error for product ${item.product_id}:`, err.message
        );
      }
    }

    console.log(
      `[cron] Done — success: ${results.success}, failed: ${results.failed}`
    );
  });
});

// GET /api/cron/status  → quick status check (no auth needed, no sensitive data)
router.get('/status', (_req, res) => {
  res.json({
    message: 'Cron endpoint is live',
    schedule: 'Every 15 minutes via cron-job.org',
    endpoint: 'POST /api/cron/scrape',
    auth: 'X-Cron-Token header required',
  });
});

// POST /api/cron/refresh  → public manual trigger (called from frontend UI)
// Rate-limited to once per 60 s to prevent button-spam.
// No auth — the token is kept server-side only.
let lastRefreshAt = 0;
const REFRESH_COOLDOWN_MS = 60_000; // 60 seconds

router.post('/refresh', async (req, res) => {
  const now = Date.now();
  const elapsed = now - lastRefreshAt;

  if (elapsed < REFRESH_COOLDOWN_MS) {
    const waitSec = Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 1000);
    return res.status(429).json({
      error: `Please wait ${waitSec}s before refreshing again`,
      retryAfterSec: waitSec,
    });
  }

  lastRefreshAt = now;

  res.status(202).json({
    message  : 'Refresh accepted — scraping in background',
    startedAt: new Date().toISOString(),
  });

  setImmediate(async () => {
    console.log(`[refresh] Manual refresh triggered at ${new Date().toISOString()}`);

    let tracked;
    try {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*, products(*)')
        .eq('is_active', true);

      if (error) throw error;
      tracked = data || [];
    } catch (err) {
      console.error('[refresh] Failed to fetch tracked products:', err.message);
      return;
    }

    if (tracked.length === 0) {
      console.log('[refresh] No active tracked products');
      return;
    }

    const results = { success: 0, failed: 0 };
    for (const item of tracked) {
      try {
        const result = await scrapeTrackedProduct(item, false);
        if (result.success) results.success++;
        else                results.failed++;
      } catch (err) {
        results.failed++;
        console.error(`[refresh] Error for product ${item.product_id}:`, err.message);
      }
    }

    console.log(`[refresh] Done — success: ${results.success}, failed: ${results.failed}`);
  });
});

module.exports = router;
