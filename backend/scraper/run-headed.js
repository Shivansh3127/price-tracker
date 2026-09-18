#!/usr/bin/env node
// backend/scraper/run-headed.js
// CLI script to run the scraper in HEADED (visible browser) mode.
//
// Usage:
//   cd backend
//   node scraper/run-headed.js
//
// What it does:
//   1. Loads all active tracked products from Supabase
//   2. Scrapes each one with Playwright in headless:false (visible window)
//   3. Prints results to console — you can watch the browser in real time
//
// Use this to:
//   - Verify scraper behavior manually
//   - Record the 2–4 min demo video (use OBS or Windows Game Bar Win+G)
//   - Debug selector issues

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const supabase               = require('../src/db/supabase');
const { scrapeTrackedProduct } = require('../src/scraper/index');

async function main() {
  console.log('=================================================');
  console.log(' Price Tracker — HEADED SCRAPER RUN');
  console.log(' Browser window will open for each product.');
  console.log('=================================================\n');

  // Fetch all active tracked products
  const { data: tracked, error } = await supabase
    .from('tracked_products')
    .select('*, products(*)')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch tracked products:', error.message);
    process.exit(1);
  }

  if (!tracked || tracked.length === 0) {
    console.log('No active tracked products found.');
    console.log('Add a product via the frontend or API first, then re-run this script.');
    process.exit(0);
  }

  console.log(`Found ${tracked.length} active tracked product(s).\n`);

  let successCount = 0;
  let failCount    = 0;

  for (const item of tracked) {
    const name = item.products?.name || 'Unknown';
    const url  = item.products?.product_url || 'Unknown URL';

    console.log(`──────────────────────────────────────────`);
    console.log(`Product : ${name}`);
    console.log(`URL     : ${url}`);
    console.log(`──────────────────────────────────────────`);

    // Pass headed=true so Playwright opens a visible browser window
    const result = await scrapeTrackedProduct(item, true);

    if (result.success) {
      console.log(`✅ Price       : $${result.data.price}`);
      console.log(`   Stock       : ${result.data.stockStatus}`);
      console.log(`   Written to price_history ✓\n`);
      successCount++;
    } else {
      console.log(`❌ Failed      : ${result.error}`);
      console.log(`   Written to scrape_logs only ✓\n`);
      failCount++;
    }

    // Brief pause between products
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('=================================================');
  console.log(` Run complete: ${successCount} succeeded, ${failCount} failed`);
  console.log('=================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in headed runner:', err);
  process.exit(1);
});
