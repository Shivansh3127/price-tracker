// backend/src/scraper/playwright-scraper.js
// Rewritten after live DOM inspection of https://demo.inelabteamdev.com/
//
// === Real store DOM facts ===
// Listing page:
//   - Product cards:  article.tile
//   - Product name:   h3.tile-name
//   - Category:       span.tile-category
//   - SKU:            p.tile-sku  (format "SKU MER-10426")
//   - Brand:          p.tile-brand
//   - No <a> links!   Uses button.tile-cta → React Router navigation
//   - Product URL:    /product/{id}  where  id = parseInt(skuNumber) - 10000
//                     e.g. "SKU MER-10426" → /product/426
//   - No search API:  1000 products shown on listing; filtered client-side
//
// Detail page (confirmed via live DOM + React-fiber inspection):
//   - /api/product/{id}  →  name, brand, specs, reviews — NO price field
//   - /api/layout        →  dynamic CSS class names (revision-locked)
//   - Anti-bot hover gate: React state tracks
//       { hoverAt, lastMoveAt, moves[], req: {minMoves:8, minDwellMs:600} }
//     The reveal button stays disabled until ≥8 distinct mousemove events
//     land inside .price-block AND the cursor dwells for ≥600 ms.
//     A single hover() / dispatchEvent() does NOT satisfy this.
//   - WORKING STRATEGY: 15 zigzag CDP mouse moves (70 ms apart) inside the
//     price block, starting from outside it, then 900 ms dwell.
//     Button enables → click → price appears.
//   - priceCarrier:"split" → zero-width spaces (U+200B) between digit spans;
//     parsePrice strips all non-digit characters before parsing.

'use strict';

const { chromium } = require('playwright');
const { parsePrice } = require('./http-scraper');

const PAGE_TIMEOUT_MS = 30_000;
const STORE_BASE = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

// ── Launch options ─────────────────────────────────────────────
// PLAYWRIGHT_BROWSERS_PATH=0 → Playwright looks for Chromium inside
// node_modules (installed by build.sh) rather than ~/.cache/ms-playwright/
// Required on Render where the home-dir cache may not persist at runtime.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

function getLaunchOptions(headed = false) {
  return {
    headless: !headed,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
    ],
  };
}

// (acceptCookies removed — the store's reveal gate is not cookie-based;
//  it requires genuine mousemove events; see playwrightScrapePDP below.)

// ── SKU → product ID helper ───────────────────────────────────

/**
 * Derives the numeric product ID from a SKU string.
 * Example: "SKU MER-10426" → 426  (formula: parseInt("10426") - 10000)
 */
function skuToProductId(skuText) {
  if (!skuText) return null;
  const m = skuText.match(/(\d{5,})/);   // 5+ digit number e.g. "10426"
  if (!m) return null;
  const id = parseInt(m[1], 10) - 10000;
  return id > 0 ? id : null;
}

// ── PDP scraper (single product detail page) ─────────────────

/**
 * Scrapes a product detail page — price, stock, name.
 *
 * Anti-bot hover gate (confirmed via React-fiber inspection):
 *   The store's price-block React component tracks
 *     { hoverAt, lastMoveAt, moves[], req: {minMoves:8, minDwellMs:600} }
 *   The reveal button stays disabled until ≥8 distinct mousemove events
 *   have been recorded INSIDE .price-block AND the cursor has dwelled ≥600 ms.
 *
 * Working strategy:
 *  1. Navigate directly to the PDP.
 *  2. Dismiss cookie overlay on PDP (same-session localStorage set — no
 *     listing-page pre-visit needed, saves ~6-7s per product).
 *  3. Intercept /api/layout to capture dynamic CSS class names.
 *  4. Scroll .price-block into view, then make 10 zigzag moves inside
 *     it (50 ms apart, well above minMoves:8).
 *  5. Dwell 700 ms (> minDwellMs:600 with margin).
 *  6. Wait for button to enable, then click it.
 *  7. Read price from the pv-* class element (zero-width spaces stripped
 *     by parsePrice via /[^\d.]/g replacement).
 *
 * @param {string}  url
 * @param {boolean} [headed=false]
 * @returns {{ price: number, stockStatus: string, name: string, thumbnailUrl: null }}
 */
async function playwrightScrapePDP(url, headed = false) {
  const browser = await chromium.launch(getLaunchOptions(headed));
  try {
    const page = await browser.newPage();

    // ── Step 1: Intercept /api/layout for dynamic class names ──
    // Default to known class names from revision 626001; will be overwritten
    // by the actual intercepted response as the page loads.
    const classes = {
      priceValue : 'pv-m4',
      stock      : 'st-m4',
      mrp        : 'mr-m4',
      priceWrap  : 'pw-m4',
    };

    page.on('response', async r => {
      if (r.url().includes('/api/layout')) {
        try {
          const data = await r.json();
          if (data?.classes) {
            Object.assign(classes, data.classes);
            console.log('[scraper] Layout classes captured:', JSON.stringify(data.classes));
          }
        } catch (_) {}
      }
    });

    // ── Step 2a: Navigate to PDP ───────────────────────────────
    // Use 'load' (not 'networkidle') — PDP has background polls that
    // prevent networkidle from ever firing (causes 30s timeout).
    await page.goto(url, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
    await page.waitForSelector('.price-block', { state: 'visible', timeout: 15000 });

    // ── Step 2b: Dismiss cookie overlay ON THE PDP (saves ~7s vs listing visit)
    // The store stores consent in localStorage — NOT in browser cookies.
    // The same overlay that appears on the listing page also appears on the
    // PDP. Dismissing it here is equivalent and avoids a full extra page load.
    try {
      await page.waitForSelector('.cookie-banner', { state: 'visible', timeout: 2000 });
      await page.click('.cookie-actions .btn-primary');
      await page.waitForTimeout(400);
      console.log('[scraper] Consent accepted on PDP');
    } catch (_) {
      // No banner — already accepted
    }

    await page.waitForTimeout(600); // allow React to fully hydrate (was 2000ms)

    // Get product name
    const name = await page.textContent('h1').catch(() => null) || 'Unknown Product';

    // ── Step 3: Trigger price reveal via zigzag mouse moves ───
    // The price-block component requires:
    //   minMoves: 8   — at least 8 distinct mousemove events inside the element
    //   minDwellMs: 600 — cursor must stay ≥600 ms after first move
    // Cookie overlay is already dismissed above so all events reach .price-block.
    await page.locator('.price-block').scrollIntoViewIfNeeded().catch(() => {});

    const box = await page.locator('.price-block').boundingBox().catch(() => null);
    if (box) {
      // Start from outside the price block so React detects entry
      await page.mouse.move(box.x - 80, box.y - 80);

      // 10 zigzag moves inside the block (above minMoves:8) at 50ms each
      for (let i = 0; i < 10; i++) {
        const x = box.x + box.width  * (0.1 + 0.8 * ((i % 5) / 4));
        const y = box.y + box.height * (0.2 + 0.6 * (Math.floor(i / 5) / 2));
        await page.mouse.move(x, y);
        await page.waitForTimeout(50); // was 70ms
      }

      // Dwell 700 ms at centre (minDwellMs:600 + 100ms margin)
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForTimeout(700); // was 900ms
    } else {
      console.warn('[scraper] Could not get bounding box for .price-block');
    }

    // Wait for button to enable (up to 6s) then click
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Reveal price"]')?.disabled,
      { timeout: 6000 }
    ).catch(() => console.warn('[scraper] Reveal button still disabled after hover'));

    await page.click('[aria-label="Reveal price"]', { timeout: 5000 })
      .catch(() => page.evaluate(
        () => document.querySelector('[aria-label="Reveal price"]')?.click()
      ));


    // ── Step 5: Wait for price to render ──────────────────────
    await page.waitForFunction(
      () => {
        const block = document.querySelector('.price-block');
        const text  = block?.textContent?.trim() || '';
        return text.length > 0
          && !text.includes('Loading')
          && !text.includes('hidden')
          && !text.includes('Reveal');
      },
      { timeout: 12000 }
    ).catch(() => {}); // continue even if timeout

    await page.waitForTimeout(300); // was 1000ms

    // ── Step 6: Read price ─────────────────────────────────────
    let priceText = null;

    // Try dynamic class from layout API (e.g. "pv-m4")
    priceText = await page.textContent(`.${classes.priceValue}`).catch(() => null);

    // Fallback: any <output> element
    if (!priceText || priceText.includes('Loading') || priceText.includes('hidden')) {
      priceText = await page.textContent('output').catch(() => null);
    }

    // Fallback: regex scan of entire price-block text
    if (!priceText || priceText.includes('Loading') || priceText.includes('hidden')) {
      const blockText = await page.textContent('.price-block').catch(() => '');
      const m = blockText.replace(/,/g, '').match(/[\d]+(?:\.\d+)?/);
      priceText = m ? m[0] : null;
    }

    const price = parsePrice(priceText);
    if (price === null || price <= 0) {
      throw new Error(`Could not parse price from "${priceText}" at ${url}`);
    }

    // ── Step 7: Read stock ─────────────────────────────────────
    // Try dynamic stock class (e.g. "st-m4")
    let stockStatus = await page.textContent(`.${classes.stock}`).catch(() => null);

    // Fallback: scan price-block for stock keywords
    if (!stockStatus || stockStatus.trim() === '') {
      const blockText = await page.textContent('.price-block').catch(() => '');
      if (/in[\s-]?stock/i.test(blockText))      stockStatus = 'In Stock';
      else if (/out[\s-]?of[\s-]?stock/i.test(blockText)) stockStatus = 'Out of Stock';
      else                                        stockStatus = 'Unknown';
    }

    console.log(`[scraper] PDP result — price: ${price}, stock: ${stockStatus.trim()}`);

    return {
      price,
      stockStatus: stockStatus.trim() || 'Unknown',
      name       : name.trim(),
      thumbnailUrl: null,
    };
  } finally {
    await browser.close();
  }
}

// ── Listing scraper (search / browse) ────────────────────────

/**
 * Loads the store listing page and extracts all visible product tiles.
 * Product URLs are derived from SKU numbers — no need to click each tile.
 *
 * The INE store has no search API, so keyword filtering happens in the
 * searchProducts() orchestrator (scraper/index.js).
 *
 * @param {string}  _url    ignored — always uses STORE_BASE
 * @param {boolean} [headed=false]
 * @returns {Array<{ name, url, category, brand, sku, thumbnailUrl, price }>}
 */
async function playwrightScrapeListings(_url, headed = false) {
  const browser = await chromium.launch(getLaunchOptions(headed));
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    // NOTE: do NOT call acceptCookies here — the cookie banner does not
    // hide tiles (confirmed by debug endpoint: cookieVisible=true, tileCount=20).
    // Clicking the banner was causing a brief page reload that made
    // waitForSelector time out. Cookie acceptance is only needed in the
    // PDP scraper to unlock the hidden price.
    await page.goto(STORE_BASE, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(2500);

    // Wait for at least one product tile (fail fast if 20s exceeded)
    await page.waitForSelector('article.tile', { timeout: 20000 });

    // Extract data from all visible tiles
    const tiles = await page.evaluate((base) => {
      const cards = [...document.querySelectorAll('article.tile')];
      return cards.map(card => {
        const skuText  = card.querySelector('p.tile-sku')?.textContent?.trim() || '';
        // SKU format: "SKU MER-10426" — extract any run of 3+ digits
        const skuMatch = skuText.match(/(\d{3,})/);
        const skuNum   = skuMatch ? parseInt(skuMatch[1], 10) : null;
        // Derive product page ID: e.g. MER-10426 → /product/426
        const id       = skuNum && skuNum > 10000 ? skuNum - 10000 : skuNum;
        return {
          name        : card.querySelector('h3.tile-name')?.textContent?.trim()      || null,
          category    : card.querySelector('span.tile-category')?.textContent?.trim() || null,
          brand       : card.querySelector('p.tile-brand')?.textContent?.trim()       || null,
          sku         : skuText,
          url         : id ? `${base}/product/${id}` : null,
          thumbnailUrl: null,
          price       : null,
        };
      }).filter(t => t.name && t.url);
    }, STORE_BASE);

    console.log(`[scraper] Listing found ${tiles.length} products`);
    return tiles;
  } finally {
    await browser.close();
  }
}

module.exports = {
  playwrightScrapePDP,
  playwrightScrapeListings,
  getLaunchOptions,
};
