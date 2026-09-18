// backend/src/scraper/playwright-scraper.js
// Playwright headless Chromium scraper — used when HTTP+Cheerio detects
// a JS-rendered SPA (which is always the case for the INE mock store).
//
// Design notes:
//  - Uses playwright-core to keep the package lean (no bundled browser).
//  - On Render, uses the system Chromium installed via buildpack/shell.
//  - Locally, uses the browser installed by `npx playwright install chromium`.
//  - Each scrape call opens a fresh page and closes it; no shared state.
//  - Waits for first matching selector before reading text, with a timeout.
//  - If selector wait times out → throws, triggering retry in orchestrator.

'use strict';

const { chromium } = require('playwright-core');
const {
  PRICE_SELECTORS,
  STOCK_SELECTORS,
  PRODUCT_NAME_SELECTORS,
  PRODUCT_IMAGE_SELECTORS,
  LISTING_CARD_SELECTORS,
  LISTING_LINK_SELECTORS,
  LISTING_NAME_SELECTORS,
  LISTING_PRICE_SELECTORS,
  LISTING_THUMBNAIL_SELECTORS,
} = require('./selectors');
const { parsePrice } = require('./http-scraper');

const PAGE_TIMEOUT_MS     = 20_000;  // navigation timeout
const SELECTOR_TIMEOUT_MS = 12_000;  // wait for selector to appear
const STORE_BASE = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

/**
 * Resolves the path to a Chromium executable.
 * Priority: CHROMIUM_PATH env var → system chrome → playwright managed browser
 */
function getChromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  // Common system paths (for Render Linux environment)
  const systemPaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];

  const fs = require('fs');
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }

  // Let playwright-core find its own managed installation
  return undefined;
}

/**
 * Launch options shared between headed and headless modes.
 * headed=true is used by the CLI run-headed.js script.
 */
function getLaunchOptions(headed = false) {
  const executablePath = getChromiumPath();
  return {
    headless     : !headed,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
}

/**
 * Scrapes a product detail page using Playwright.
 *
 * @param {string}  url
 * @param {boolean} [headed=false]
 * @returns {{ price: number, stockStatus: string, name: string, thumbnailUrl: string|null }}
 * @throws  If navigation fails, selector not found, or price cannot be parsed.
 */
async function playwrightScrapePDP(url, headed = false) {
  const browser = await chromium.launch(getLaunchOptions(headed));
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(SELECTOR_TIMEOUT_MS);

    await page.goto(url, {
      waitUntil : 'networkidle',
      timeout   : PAGE_TIMEOUT_MS,
    });

    // Wait for price element to appear (proves JS has rendered)
    const priceSelector = await waitForAnySelector(page, PRICE_SELECTORS, SELECTOR_TIMEOUT_MS);
    if (!priceSelector) {
      throw new Error(
        `No price selector matched on ${url}. ` +
        `Tried: ${PRICE_SELECTORS.join(', ')}`
      );
    }

    const priceText = await page.locator(priceSelector).first().innerText();
    const price     = parsePrice(priceText);
    if (price === null) {
      throw new Error(`Could not parse price from text: "${priceText}" at ${url}`);
    }

    const stockSelector = await waitForAnySelector(page, STOCK_SELECTORS, 3_000);
    const stockStatus = stockSelector
      ? (await page.locator(stockSelector).first().innerText()).trim()
      : 'Unknown';

    const nameSelector = await waitForAnySelector(page, PRODUCT_NAME_SELECTORS, 3_000);
    const name = nameSelector
      ? (await page.locator(nameSelector).first().innerText()).trim()
      : 'Unknown Product';

    const imgSelector = await waitForAnySelector(page, PRODUCT_IMAGE_SELECTORS, 2_000);
    const thumbnailUrl = imgSelector
      ? await page.locator(imgSelector).first().getAttribute('src')
      : null;

    return {
      price,
      stockStatus,
      name,
      thumbnailUrl: thumbnailUrl ? toAbsoluteUrl(thumbnailUrl) : null,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Scrapes the store listing/search page using Playwright.
 * Returns an array of product stubs: { name, url, thumbnailUrl, price }.
 *
 * @param {string}  url    - listing or search page URL
 * @param {boolean} [headed=false]
 * @returns {Array<{ name: string, url: string, thumbnailUrl: string|null, price: number|null }>}
 */
async function playwrightScrapeListings(url, headed = false) {
  const browser = await chromium.launch(getLaunchOptions(headed));
  try {
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil : 'networkidle',
      timeout   : PAGE_TIMEOUT_MS,
    });

    // Wait for at least one product card to appear
    const cardSelector = await waitForAnySelector(page, LISTING_CARD_SELECTORS, SELECTOR_TIMEOUT_MS);
    if (!cardSelector) {
      throw new Error(`No product cards found on listing page: ${url}`);
    }

    // Extract all product cards
    const products = await page.evaluate(
      ({ cardSel, linkSels, nameSels, priceSels, thumbSels, storeBase }) => {
        const cards = [...document.querySelectorAll(cardSel)];

        function firstText(el, selectors) {
          for (const s of selectors) {
            const found = el.querySelector(s);
            if (found && found.textContent.trim()) return found.textContent.trim();
          }
          return null;
        }

        function firstAttr(el, selectors, attr) {
          for (const s of selectors) {
            const found = el.querySelector(s);
            if (found && found.getAttribute(attr)) return found.getAttribute(attr);
          }
          return null;
        }

        function toAbs(href) {
          if (!href) return null;
          if (href.startsWith('http')) return href;
          if (href.startsWith('//'))   return 'https:' + href;
          if (href.startsWith('/'))    return storeBase + href;
          return storeBase + '/' + href;
        }

        function parseP(raw) {
          if (!raw) return null;
          const m = raw.replace(/,/g, '').match(/[\d]+(?:\.\d+)?/);
          if (!m) return null;
          const n = parseFloat(m[0]);
          return n > 0 ? n : null;
        }

        return cards.map(card => {
          const name  = firstText(card, nameSels);
          const href  = firstAttr(card, linkSels, 'href');
          const thumb = firstAttr(card, thumbSels, 'src');
          const price = firstText(card, priceSels);
          return {
            name        : name?.trim() || null,
            url         : toAbs(href),
            thumbnailUrl: toAbs(thumb),
            price       : parseP(price),
          };
        }).filter(p => p.name && p.url);
      },
      {
        cardSel  : cardSelector,
        linkSels : LISTING_LINK_SELECTORS,
        nameSels : LISTING_NAME_SELECTORS,
        priceSels: LISTING_PRICE_SELECTORS,
        thumbSels: LISTING_THUMBNAIL_SELECTORS,
        storeBase: STORE_BASE,
      }
    );

    return products;
  } finally {
    await browser.close();
  }
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Tries each selector in order; returns the first one that appears
 * within `timeoutMs`, or null if none match.
 */
async function waitForAnySelector(page, selectors, timeoutMs) {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: Math.min(timeoutMs, 3_000) });
      return sel;
    } catch (_) {
      // not found — try next
    }
  }
  return null;
}

function toAbsoluteUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('//'))   return 'https:' + href;
  if (href.startsWith('/'))    return STORE_BASE + href;
  return STORE_BASE + '/' + href;
}

module.exports = {
  playwrightScrapePDP,
  playwrightScrapeListings,
  getLaunchOptions,
};
