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
// Detail page (confirmed via live network/DOM inspection):
//   - price-block HTML after reveal:
//       <div class="pw-m4">
//         <output class="pv-m4">₹9,999</output>
//         <span class="mr-m4">₹14,999</span>
//         <span class="bd-m4">33% off</span>
//         <span class="st-m4">In stock</span>
//         <span class="dl-m4">Free delivery</span>
//       </div>
//   - CSS class names are dynamic (come from /api/layout; change per revision)
//   - Cookie overlay keeps reveal button disabled until cookies accepted
//   - Reveal mechanism: accept cookies → JS mouseover dispatch → JS click

'use strict';

const { chromium } = require('playwright');
const { parsePrice } = require('./http-scraper');

const PAGE_TIMEOUT_MS = 30_000;
const STORE_BASE = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

// ── Launch options ─────────────────────────────────────────────

function getLaunchOptions(headed = false) {
  return {
    headless: !headed,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
}

// ── Cookie helper ─────────────────────────────────────────────

async function acceptCookies(page) {
  try {
    await page.waitForSelector('.cookie-banner', { timeout: 4000 });
    await page.click('.cookie-actions .btn-primary', { timeout: 4000 });
    await page.waitForTimeout(600);
    console.log('[scraper] Cookies accepted');
  } catch (_) {
    // No banner or already accepted
  }
}

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
 * Strategy:
 *  1. Intercept /api/layout response to get dynamic CSS class names.
 *  2. Accept cookie banner (re-enables all mouse/keyboard events).
 *  3. Dispatch JS mouseover on .price-block to trigger reveal mechanism.
 *  4. JS-click the reveal button (bypasses disabled state if needed).
 *  5. Wait 10s for price to render.
 *  6. Read price/stock using the intercepted class names.
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

    await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(1500);

    // ── Step 2: Accept cookies ─────────────────────────────────
    await acceptCookies(page);

    // ── Step 3: Get product name ───────────────────────────────
    const name = await page.textContent('h1').catch(() => null)
              || 'Unknown Product';

    // ── Step 4: Trigger price reveal via Playwright native hover ──
    // The cookie overlay was blocking mouse events before acceptance.
    // Now hover with real browser pointer (CDP-level) — triggers React onMouseEnter
    // which enables the Reveal Price button.
    await page.waitForSelector('.cookie-overlay', { state: 'hidden', timeout: 5000 })
      .catch(() => {}); // overlay may already be gone

    await page.locator('.price-block').scrollIntoViewIfNeeded().catch(() => {});
    await page.locator('.price-block').hover({ timeout: 8000 });
    await page.waitForTimeout(1500);

    // Wait for button to become enabled, then click it
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Reveal price"]')?.disabled,
      { timeout: 8000 }
    ).catch(() => {});

    await page.click('[aria-label="Reveal price"]', { timeout: 5000 })
      .catch(() =>
        // Fallback JS click if Playwright click fails
        page.evaluate(() => document.querySelector('[aria-label="Reveal price"]')?.click())
      );

    // ── Step 5: Wait for price to render ──────────────────────
    // Poll until the price-block no longer says "hidden" / "Loading"
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

    await page.waitForTimeout(1000);

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
    await page.goto(STORE_BASE, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(2000);

    await acceptCookies(page);

    // Wait for at least one product tile
    await page.waitForSelector('article.tile', { timeout: 15000 });

    // Extract data from all visible tiles
    const tiles = await page.evaluate((base) => {
      const cards = [...document.querySelectorAll('article.tile')];
      return cards.map(card => {
        const skuText  = card.querySelector('p.tile-sku')?.textContent?.trim() || '';
        // SKU format: "SKU MER-10426" — extract the 5-digit number
        const skuMatch = skuText.match(/(\d{5,})/);
        const skuNum   = skuMatch ? parseInt(skuMatch[1], 10) : null;
        const id       = skuNum ? skuNum - 10000 : null;
        return {
          name        : card.querySelector('h3.tile-name')?.textContent?.trim()      || null,
          category    : card.querySelector('span.tile-category')?.textContent?.trim() || null,
          brand       : card.querySelector('p.tile-brand')?.textContent?.trim()       || null,
          sku         : skuText,
          url         : id ? `${base}/product/${id}` : null,
          thumbnailUrl: null,
          price       : null,   // prices are not shown on listing page
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
