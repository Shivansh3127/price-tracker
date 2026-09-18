// backend/src/scraper/selectors.js
// Defensive multi-selector arrays for scraping the INE mock store.
//
// The store is a React SPA, so Playwright renders the DOM before
// these selectors are applied.  We try each candidate in order and
// use the first one that yields a non-empty, meaningful value.
//
// HOW TO UPDATE THESE:
//   1. Open https://demo.inelabteamdev.com/<product-path> in Chrome
//   2. Open DevTools → Inspector
//   3. Right-click the price element → "Copy → CSS selector"
//   4. Prepend it to the relevant array below

'use strict';

const PRICE_SELECTORS = [
  // Most likely candidates for a React-based store:
  '[data-testid="product-price"]',
  '[data-testid="price"]',
  '.product-price',
  '.price',
  'span[class*="price"]',
  'p[class*="price"]',
  'div[class*="price"]',
  'h2[class*="price"]',
  // Generic fallbacks:
  '[class*="Price"]',
  '[id*="price"]',
];

const STOCK_SELECTORS = [
  '[data-testid="stock-status"]',
  '[data-testid="stock"]',
  '[data-testid="availability"]',
  '.stock-status',
  '.availability',
  'span[class*="stock"]',
  'p[class*="stock"]',
  '[class*="Stock"]',
  '[class*="availability"]',
  '[class*="Availability"]',
];

const PRODUCT_NAME_SELECTORS = [
  '[data-testid="product-name"]',
  '[data-testid="product-title"]',
  'h1',
  'h1[class*="title"]',
  'h1[class*="name"]',
  '.product-title',
  '.product-name',
];

const PRODUCT_IMAGE_SELECTORS = [
  '[data-testid="product-image"]',
  '.product-image img',
  '.product-img img',
  'img[class*="product"]',
  'img[alt*="product"]',
  'main img',
];

// Listing page — product card selectors
const LISTING_CARD_SELECTORS = [
  '[data-testid="product-card"]',
  '.product-card',
  '.product-item',
  '[class*="ProductCard"]',
  '[class*="product-card"]',
  '[class*="ProductItem"]',
  'article',
];

// Within each card, the link to the product detail page
const LISTING_LINK_SELECTORS = [
  'a[href*="/product"]',
  'a[href*="/products"]',
  'a[href*="/item"]',
  'a',
];

// Within each card, the product name text
const LISTING_NAME_SELECTORS = [
  '[data-testid="product-name"]',
  'h2', 'h3', '.product-name', '.product-title',
  '[class*="name"]', '[class*="title"]',
];

// Within each card, the price text
const LISTING_PRICE_SELECTORS = [
  '[data-testid="price"]',
  '.price', '.product-price',
  'span[class*="price"]', 'p[class*="price"]',
];

// Within each card, the thumbnail image
const LISTING_THUMBNAIL_SELECTORS = [
  'img[class*="product"]', 'img[class*="thumb"]',
  'img[alt*="product"]', 'img',
];

module.exports = {
  PRICE_SELECTORS,
  STOCK_SELECTORS,
  PRODUCT_NAME_SELECTORS,
  PRODUCT_IMAGE_SELECTORS,
  LISTING_CARD_SELECTORS,
  LISTING_LINK_SELECTORS,
  LISTING_NAME_SELECTORS,
  LISTING_PRICE_SELECTORS,
  LISTING_THUMBNAIL_SELECTORS,
};
