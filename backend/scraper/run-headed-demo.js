#!/usr/bin/env node
// backend/scraper/run-headed-demo.js
// Like run-headed.js but designed for the submission demo video.
//
// Runs two scrapes:
//   1. A REAL active product       → shows successful price reveal
//   2. A NON-EXISTENT product URL  → shows retry logic + graceful failure
//
// This satisfies the assignment requirement:
//   "Show at least one slow or failing response being handled."
//
// Usage:
//   cd backend
//   node scraper/run-headed-demo.js

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const supabase                 = require('../src/db/supabase');
const { scrapeTrackedProduct } = require('../src/scraper/index');

// ── Fake product stub for the failure demo ─────────────────────
// This URL does not exist on the store — the scraper will:
//   1. Try HTTP fast path → fail (404 or empty DOM)
//   2. Try Playwright     → fail to find .price-block
//   3. Retry up to 3 times with backoff (1.5s, 3s)
//   4. Log failure to scrape_logs — price_history NOT written
const FAKE_TRACKED = {
  id        : 'demo-fail-item',
  product_id: 'demo-fail-product',
  is_active : true,
  products  : {
    id         : 'demo-fail-product',
    name       : '⚡ Demo Failure Product (non-existent URL)',
    product_url: `${process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com'}/product/99999`,
  },
};

async function main() {
  console.log('=================================================');
  console.log(' Price Tracker — HEADED DEMO SCRAPER');
  console.log(' Shows: SUCCESS + RETRY/FAILURE handling');
  console.log('=================================================\n');

  // ── Part 1: Fetch first real active product ────────────────
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*, products(*)')
    .eq('is_active', true)
    .limit(1);

  if (error || !data || data.length === 0) {
    console.error('No active tracked products found. Track a product via the UI first.');
    process.exit(1);
  }

  const realProduct = data[0];
  const items = [realProduct, FAKE_TRACKED];

  console.log(`Will scrape ${items.length} product(s):\n`);
  items.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.products.name}`);
    console.log(`     ${item.products.product_url}`);
  });
  console.log('\nStarting in 2 seconds — start your screen recorder now!\n');
  await new Promise(r => setTimeout(r, 2000));

  let successCount = 0;
  let failCount    = 0;

  for (const item of items) {
    const name = item.products.name;
    const url  = item.products.product_url;

    console.log('\n══════════════════════════════════════════');
    console.log(` Product : ${name}`);
    console.log(` URL     : ${url}`);
    console.log('══════════════════════════════════════════');

    const result = await scrapeTrackedProduct(item, true /* headed */);

    if (result.success) {
      console.log(`\n✅ Price  : ₹${result.data.price}`);
      console.log(`   Stock  : ${result.data.stockStatus}`);
      console.log(`   Written to price_history ✓\n`);
      successCount++;
    } else {
      console.log(`\n❌ Failed : ${result.error}`);
      console.log(`   Written to scrape_logs only (price_history NOT written) ✓`);
      console.log(`   This is expected — the scraper handles failures gracefully.\n`);
      failCount++;
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('=================================================');
  console.log(` Demo complete: ${successCount} succeeded, ${failCount} failed`);
  console.log(' scrape_logs updated for all attempts.');
  console.log('=================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in demo runner:', err);
  process.exit(1);
});
