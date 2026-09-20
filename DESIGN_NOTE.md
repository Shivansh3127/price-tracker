# DESIGN NOTE — Product Price Tracker

This note covers the real engineering decisions made while building the scraper, what broke during development, and the trade-offs that were accepted consciously. It is written after the app was tested and debugged end-to-end.

---

## 1. How I Made Scraping Reliable

### The target site is a React SPA — HTTP alone returns nothing

`https://demo.inelabteamdev.com/` returns a single `<div id="root"></div>` over HTTP. All product names, prices, and stock status are injected by client-side React after JavaScript executes. A plain HTTP + Cheerio request gets an empty DOM.

The code still runs the HTTP fast path first (`http-scraper.js`), but its job is detection, not extraction:
- `#root` is empty → logs "SPA detected" → promotes to Playwright immediately
- The `type: 'spa'` return skips any Cheerio parsing

This satisfies the assignment's "try HTTP first" intent while being honest that Playwright does all real work.

### Price reveal is anti-bot gated — hover simulation had to match React's internal state

The store does not simply show the price on page load. Each product detail page has a "Reveal price" button that starts disabled. It enables only after the React component's internal `moves[]` array accumulates at least **8 distinct `mousemove` events** inside `.price-block` and the cursor has dwelled inside for at least **600 ms** (`minMoves: 8, minDwellMs: 600` — read directly from React fiber state via `page.evaluate()`).

The fix: 15 CDP-level `mouse.move()` calls zigzagged across the element's bounding box at 70 ms intervals, followed by a 900 ms dwell at centre. CDP mouse events update React's synthetic event state; JS `dispatchEvent()` does not.

### Cookie consent blocks mouse events on fresh browser sessions

The store stores consent acceptance in `localStorage` (not browser cookies). Every `chromium.launch()` starts with empty localStorage → the `cookie-overlay` div (CSS: `position: fixed; z-index: 9999`) appears and intercepts **all** pointer events. Mouse moves land on the overlay, never on `.price-block`, so `moves[]` never fills and the button stays disabled.

Fix: visit the store listing page first (same browser session), accept the banner, then navigate to the PDP. This writes the consent flag to localStorage so the overlay never appears on the PDP navigation.

### Retry with exponential backoff — real numbers

```
Attempt 1 → failure → wait 1 500 ms
Attempt 2 → failure → wait 3 000 ms   (factor: 2, baseDelay: 1 500 ms)
Attempt 3 → failure → STOP — log to scrape_logs, do NOT write price_history
```

Cap: 8 000 ms. Implemented in `backend/src/scraper/retry.js` as `withRetry(fn, { maxAttempts: 3, baseDelayMs: 1500, factor: 2 })`.

### Per-product isolation — one crash can't kill the cron job

Every product scrape in the cron loop is wrapped in its own `try/catch` inside `scrapeTrackedProduct`. If product A causes a Playwright crash or an unexpected DOM layout, the loop continues to B, C, D. Each failure writes a row to `scrape_logs` with `status: 'failed'` and the full error message.

### Validation gate before any DB write — confirmed in code

`price_history` is only written after this explicit check in `scraper/index.js` (line 83):

```js
if (!scrapedData || typeof scrapedData.price !== 'number' || scrapedData.price <= 0) {
  throw new Error('Scrape returned invalid/empty price — refusing to store garbage data');
}
```

The database schema also has `CHECK (price >= 0)` on the `price` column as a second line of defence. A failed or ambiguous scrape writes **only** to `scrape_logs`.

### Multi-selector fallback for price text

After the reveal button is clicked, the scraper tries three sources in order for the price string:
1. The dynamic layout class (e.g. `.pv-z6`) returned by `/api/layout`
2. `data-output` attribute on the price element
3. Regex on the full `.price-block` text content

`parsePrice` strips all characters that are not digits or `.` globally before calling `parseFloat`. This handles the U+200B zero-width spaces the store injects between digit groups (e.g. `27​338` → `27338`).

---

## 2. Trade-offs Made

| Decision | What was accepted |
|---|---|
| Playwright for every PDP scrape | ~20–30 s per product; heavier than HTTP. Acceptable at 2-hour intervals but would be a bottleneck for a large catalogue. |
| Listing-page cookie visit per scrape | Adds ~5 s overhead per product. Alternative (pre-inject the localStorage key) would require knowing the exact key name — which could change. Same-session visit is durable. |
| Render free tier | Service sleeps after 15 min idle. First cron request after sleep has a ~30 s cold start. Accepted because it's free; production would use a paid instance or always-on keep-alive. |
| External cron (cron-job.org) | No cron state is managed inside the app. If the cron service goes down, scrapes stop silently. A more robust setup would have a dead-man's-switch alert. |
| Fixed 2-hour interval for all products | `tracked_products.scrape_interval_minutes` column exists in the schema but is not yet read by the cron logic. All products scrape on the same cadence. |
| Service role key in backend only | Frontend gets `VITE_API_BASE_URL` pointing to our Express server. Supabase credentials never touch the browser. |

---

## 3. What the AI Tooling Got Wrong — and How It Was Fixed

These are real failures encountered during the build of this specific project.

### Issue 1: Assumed `page.hover()` satisfies anti-bot hover requirement
- **What happened:** First implementation used `page.hover('.price-block')` to trigger price reveal. The "Reveal price" button stayed disabled on every scrape attempt.
- **Root cause:** Playwright's `hover()` fires a single `mousemove` CDP event. React's component tracks a `moves[]` array and requires `moves.length >= 8`. One event never satisfies this.
- **Fix:** Replaced with 15 explicit `page.mouse.move(x, y)` calls zigzagged across the element's bounding box at 70 ms intervals, followed by a 900 ms dwell. Confirmed anti-bot parameters by reading React fiber state directly via `page.evaluate()`.

### Issue 2: `dispatchEvent` synthetic events were silently ignored by React
- **What happened:** An intermediate attempt used `element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }))` to simulate moves without full CDP overhead. Button stayed disabled.
- **Root cause:** React's event system processes native browser events (fired via CDP at the browser level). JavaScript-created `MouseEvent` objects dispatched from `page.evaluate()` do not go through the same path and do not update React's synthetic event state or internal fiber hooks.
- **Fix:** Abandoned synthetic events entirely; used real CDP `page.mouse.move()` calls.

### Issue 3: `waitUntil: 'networkidle'` caused 30-second timeouts on every PDP
- **What happened:** Used `page.goto(url, { waitUntil: 'networkidle' })`. Every PDP navigation timed out after 30 s.
- **Root cause:** The product detail page has a continuous background XHR poll (product view tracking / analytics). The network is never truly idle.
- **Fix:** Switched to `{ waitUntil: 'load' }` and added an explicit `waitForSelector('.price-block', { state: 'visible', timeout: 15000 })` plus a 2-second hydration wait.

### Issue 4: U+200B zero-width spaces broke price parsing
- **What happened:** The scraper read price text like `"27‌338"` from the DOM (looks like `27338` but contains an invisible U+200B character). `parseFloat("27‌338")` returned `27` — the parser stops at the non-numeric character.
- **Root cause:** The store uses `priceCarrier: "split"` which inserts zero-width spaces between digit groups as a scraping deterrent.
- **Fix:** `parsePrice` now does `text.replace(/[^0-9.]/g, '')` globally before `parseFloat`, stripping all non-digit/non-dot characters including invisible Unicode.

### Issue 5: Cookie overlay intercepted all mouse events
- **What happened:** The scraper passed all previous checks (bounding box valid, button found, moves executed) but the button remained disabled for some products (`price=0.27`, `price=1` written to DB — garbage values from the overlay's partial DOM).
- **Root cause:** The store stores cookie consent in `localStorage`. A fresh `chromium.launch()` always starts with empty localStorage. The `cookie-overlay` div (`position: fixed; z-index: 9999; pointer-events: all`) covered the entire page. All 15 mouse moves landed on the overlay, never reaching `.price-block`.
- **Fix:** Added a listing-page visit at the start of each scrape (same browser session). Accepting the banner on the listing page writes to `localStorage`, so the overlay never appears on the subsequent PDP navigation.

---

## 4. What I Would Do Differently

- **Respect `scrape_interval_minutes` per product.** The column is in the schema; the cron logic ignores it and scrapes everything on the same cadence.
- **Parallel scraping with a concurrency limit.** Currently scrapes are sequential. With a semaphore limiting to 2–3 concurrent Playwright instances, total cron run time would drop from ~60 s to ~25 s for a typical watchlist.
- **Price alert system.** The data is there to fire a webhook or email when price drops below a threshold; only the trigger logic is missing.
- **Keep-alive ping to prevent Render cold starts.** A lightweight GET to `/health` every 10 minutes would keep the free-tier service awake between 2-hour cron runs.
