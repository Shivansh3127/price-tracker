// backend/src/scraper/http-scraper.js
// Fast-path scraper: plain HTTP fetch + Cheerio HTML parsing.
//
// Because the INE mock store is a React SPA (returns only
// <div id="root"></div>), this path will always detect an empty
// DOM and return { type: 'spa' } — signalling the orchestrator to
// promote to the Playwright path.
//
// This module exists for two reasons:
//   1. Correctness: tries cheap HTTP first in case the store ever
//      starts SSR-rendering content.
//   2. Auditability: every fast-path attempt is logged so it's clear
//      why Playwright was chosen.

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const {
  PRICE_SELECTORS,
  STOCK_SELECTORS,
  PRODUCT_NAME_SELECTORS,
  LISTING_CARD_SELECTORS,
  LISTING_LINK_SELECTORS,
  LISTING_NAME_SELECTORS,
  LISTING_PRICE_SELECTORS,
  LISTING_THUMBNAIL_SELECTORS,
} = require('./selectors');

const TIMEOUT_MS = 10_000;

/**
 * Attempts a plain HTTP GET and Cheerio parse for a product detail page.
 *
 * Returns one of:
 *   { type: 'success', data: { price, stockStatus, name } }
 *   { type: 'spa'     }   — empty root → promote to Playwright
 *   { type: 'error',  error: Error, httpStatus: number|null }
 */
async function httpScrapePDP(url) {
  let httpStatus = null;
  try {
    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'PriceTrackerBot/1.0' },
    });

    httpStatus = response.status;
    const html = response.data;
    const $    = cheerio.load(html);

    // SPA detection: if the root div is empty, nothing to parse
    const rootContent = $('#root').html() || '';
    if (rootContent.trim() === '') {
      console.info(`[http-scraper] SPA detected at ${url} — promoting to Playwright`);
      return { type: 'spa', httpStatus };
    }

    // Try to extract data from static HTML
    const price       = extractFirst($, PRICE_SELECTORS);
    const stockStatus = extractFirst($, STOCK_SELECTORS);
    const name        = extractFirst($, PRODUCT_NAME_SELECTORS);

    if (!price) {
      console.info(`[http-scraper] No price selector matched at ${url} — promoting to Playwright`);
      return { type: 'spa', httpStatus };
    }

    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) {
      return { type: 'spa', httpStatus }; // promote; bad parse is not a failure
    }

    return {
      type: 'success',
      data: { price: parsedPrice, stockStatus: stockStatus || 'Unknown', name },
      httpStatus,
    };
  } catch (err) {
    const status = err.response?.status || null;
    return { type: 'error', error: err, httpStatus: status };
  }
}

/**
 * Attempts a plain HTTP GET and Cheerio parse for the listing/search page.
 * Returns an array of product stubs or { type: 'spa' }.
 */
async function httpScrapeListings(url) {
  try {
    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'PriceTrackerBot/1.0' },
    });

    const html = response.data;
    const $    = cheerio.load(html);

    const rootContent = $('#root').html() || '';
    if (rootContent.trim() === '') {
      return { type: 'spa' };
    }

    const products = [];
    const cards = $(LISTING_CARD_SELECTORS.join(', '));

    cards.each((_, card) => {
      const $card = $(card);
      const name  = extractFirstFrom($card, $, LISTING_NAME_SELECTORS);
      const href  = $card.find(LISTING_LINK_SELECTORS.join(', ')).first().attr('href');
      const thumb = $card.find(LISTING_THUMBNAIL_SELECTORS.join(', ')).first().attr('src');
      const price = extractFirstFrom($card, $, LISTING_PRICE_SELECTORS);

      if (name && href) {
        products.push({
          name: name.trim(),
          url: toAbsoluteUrl(href),
          thumbnailUrl: thumb ? toAbsoluteUrl(thumb) : null,
          price: price ? parsePrice(price) : null,
        });
      }
    });

    return { type: 'success', products };
  } catch (err) {
    return { type: 'error', error: err };
  }
}

// ── Helpers ───────────────────────────────────────────────────

function extractFirst($, selectors) {
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    if (text) return text;
  }
  return null;
}

function extractFirstFrom($card, $, selectors) {
  for (const sel of selectors) {
    const text = $card.find(sel).first().text().trim();
    if (text) return text;
  }
  return null;
}

/**
 * Parses price text like "$12.99", "12.99", "€ 5" → number.
 * Returns null if no valid positive number found.
 */
function parsePrice(raw) {
  if (!raw) return null;
  const match = raw.replace(/,/g, '').match(/[\d]+(?:\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  return num > 0 ? num : null;
}

const STORE_BASE = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

function toAbsoluteUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('//'))   return 'https:' + href;
  if (href.startsWith('/'))    return STORE_BASE + href;
  return STORE_BASE + '/' + href;
}

module.exports = { httpScrapePDP, httpScrapeListings, parsePrice };
