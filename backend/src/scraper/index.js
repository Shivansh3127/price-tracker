// backend/src/scraper/index.js
// Main scraper orchestrator.
//
// Flow for a single product:
//   1. Try HTTP + Cheerio fast path
//      → if SPA detected (always for this store) → promote to Playwright
//      → if HTTP error → retry with backoff, then fail loudly
//   2. Playwright path with retry + backoff
//   3. Validate result (price must be positive number, stock non-empty)
//   4. Write to price_history ONLY on confirmed success
//   5. Write to scrape_logs for EVERY attempt (success / retried / failed)
//
// Per-product isolation: each product is wrapped in try/catch so one
// failure never stops the cron job from processing other products.

'use strict';

const supabase                                       = require('../db/supabase');
const { httpScrapePDP, httpScrapeListings }          = require('./http-scraper');
const { playwrightScrapePDP, playwrightScrapeListings } = require('./playwright-scraper');
const { withRetry }                                  = require('./retry');

const STORE_BASE = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

// ── Public API ────────────────────────────────────────────────

/**
 * Scrapes a single tracked product and writes results to Supabase.
 * Never throws — all errors are caught and logged.
 *
 * @param {{ id: string, product_id: string, products: { product_url: string } }} tracked
 * @param {boolean} [headed=false]  true when running the headed CLI script
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
async function scrapeTrackedProduct(tracked, headed = false) {
  const { product_id, products: product } = tracked;
  const url = product.product_url;

  const startedAt = Date.now();
  let retryCount  = 0;
  let lastError   = null;
  let httpStatus  = null;

  try {
    console.log(`[scraper] Starting scrape for product ${product_id} → ${url}`);

    // ── Step 1: HTTP fast path ─────────────────────────────────
    console.log(`[scraper] Trying HTTP+Cheerio fast path...`);
    const httpResult = await httpScrapePDP(url);

    let scrapedData = null;

    if (httpResult.type === 'success') {
      // Rare: static HTML worked
      scrapedData = httpResult.data;
      console.log(`[scraper] HTTP fast path succeeded for ${product_id}`);
    } else {
      // SPA or HTTP error → promote to Playwright
      if (httpResult.type === 'error') {
        console.warn(`[scraper] HTTP error: ${httpResult.error?.message}`);
        httpStatus = httpResult.httpStatus;
      } else {
        console.info(`[scraper] SPA detected → using Playwright`);
        httpStatus = httpResult.httpStatus || 200;
      }

      // ── Step 2: Playwright path with retry ──────────────────
      const { value, attempts, lastError: retryErr } = await withRetry(
        async () => playwrightScrapePDP(url, headed),
        { maxAttempts: 3, baseDelayMs: 1500, factor: 2 },
        (attempt, err) => {
          retryCount = attempt;
          console.warn(`[scraper] Playwright retry ${attempt} for ${product_id}: ${err.message}`);
        }
      );

      retryCount = attempts - 1;
      lastError  = retryErr;
      scrapedData = value;
    }

    // ── Step 3: Validate ────────────────────────────────────────
    if (!scrapedData || typeof scrapedData.price !== 'number' || scrapedData.price <= 0) {
      throw new Error(
        lastError
          ? `All retries failed: ${lastError.message}`
          : 'Scrape returned invalid/empty price — refusing to store garbage data'
      );
    }

    if (!scrapedData.stockStatus || scrapedData.stockStatus.trim() === '') {
      scrapedData.stockStatus = 'Unknown';
    }

    const durationMs = Date.now() - startedAt;

    // ── Step 4: Write price_history (SUCCESS ONLY) ───────────
    const { error: phError } = await supabase
      .from('price_history')
      .insert({
        product_id  : product_id,
        price       : scrapedData.price,
        stock_status: scrapedData.stockStatus,
        scraped_at  : new Date().toISOString(),
      });

    if (phError) throw new Error(`price_history insert failed: ${phError.message}`);

    // Update product name/thumbnail if scraped
    if (scrapedData.name || scrapedData.thumbnailUrl) {
      await supabase
        .from('products')
        .update({
          ...(scrapedData.name        && { name          : scrapedData.name }),
          ...(scrapedData.thumbnailUrl && { thumbnail_url : scrapedData.thumbnailUrl }),
        })
        .eq('id', product_id);
    }

    // ── Step 5: Write scrape_log (success) ──────────────────
    await writeScrapeLog({
      product_id,
      status      : 'success',
      http_status : httpStatus,
      retry_count : retryCount,
      duration_ms : durationMs,
      error_message: null,
    });

    console.log(
      `[scraper] ✅ product ${product_id} — price: ${scrapedData.price}, ` +
      `stock: ${scrapedData.stockStatus}, retries: ${retryCount}`
    );

    return { success: true, data: scrapedData };
  } catch (err) {
    // ── Step 5b: Write scrape_log (failure) ─────────────────
    const durationMs = Date.now() - startedAt;
    await writeScrapeLog({
      product_id,
      status       : 'failed',
      http_status  : httpStatus,
      error_message: err.message,
      retry_count  : retryCount,
      duration_ms  : durationMs,
    });

    console.error(`[scraper] ❌ product ${product_id} failed: ${err.message}`);
    // IMPORTANT: price_history is NOT written here
    return { success: false, error: err.message };
  }
}

/**
 * Searches the mock store listing/search page for products matching `query`.
 * Returns an array of product stubs.
 */
async function searchProducts(query, headed = false) {
  // Try the search URL pattern first, then fall back to listing root
  const searchUrl = `${STORE_BASE}/search?q=${encodeURIComponent(query)}`;
  const listingUrl = STORE_BASE;

  console.log(`[scraper] Searching for "${query}" at ${searchUrl}`);

  // Fast path first
  let httpResult = await httpScrapeListings(searchUrl);
  if (httpResult.type === 'success' && httpResult.products?.length > 0) {
    return filterByQuery(httpResult.products, query);
  }

  // Playwright path
  try {
    let products = await playwrightScrapeListings(searchUrl, headed);
    if (products.length > 0) return filterByQuery(products, query);

    // If search URL returned nothing, try root listing
    products = await playwrightScrapeListings(listingUrl, headed);
    return filterByQuery(products, query);
  } catch (err) {
    console.error(`[scraper] searchProducts error: ${err.message}`);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────

async function writeScrapeLog(log) {
  const { error } = await supabase.from('scrape_logs').insert({
    product_id   : log.product_id,
    attempted_at : new Date().toISOString(),
    status       : log.status,
    http_status  : log.http_status   || null,
    error_message: log.error_message || null,
    retry_count  : log.retry_count   || 0,
    duration_ms  : log.duration_ms   || null,
  });

  if (error) {
    // Log write failures are recorded in console but never thrown —
    // they must not mask the original scrape result.
    console.error(`[scraper] Failed to write scrape_log: ${error.message}`);
  }
}

function filterByQuery(products, query) {
  if (!query) return products;
  const q = query.toLowerCase();
  return products.filter(p => p.name?.toLowerCase().includes(q));
}

module.exports = { scrapeTrackedProduct, searchProducts };
