# DESIGN NOTE — Product Price Tracker

> **Instructions:** Fill this in AFTER you've tested the app and recorded the demo video.
> Be honest — interviewers specifically look for self-awareness about what broke and what you learned.

---

## 1. Scraping Strategy & Why

### Primary Choice: Playwright (Headless Chromium)

The target site (`https://demo.inelabteamdev.com/`) is a **React Single Page Application**. Its raw HTTP response is:

```html
<div id="root"></div>
```

All product data — prices, names, stock status — is injected by client-side JavaScript after the initial page load. This means **plain HTTP + Cheerio cannot extract any data**, because the HTML it sees is empty.

The code still runs the HTTP+Cheerio path first (fast path), but its primary job is SPA detection:
- If `#root` is empty → log "SPA detected" → promote to Playwright
- If selectors return no data → same promotion

This satisfies the assignment requirement of "preferring lightweight HTTP first" while being honest that Playwright is the workhorse.

### Why Playwright over Puppeteer?

*(Fill in based on your experience — e.g. API clarity, better waiting primitives, cross-browser support, first-party maintained)*

---

## 2. Reliability Mechanisms

### Per-product Isolation

Each product scrape runs inside its own `try/catch`. If product A causes an exception (timeout, crash, unexpected DOM structure), the cron job continues to scrape products B, C, D. The error for A is logged to `scrape_logs` without affecting others.

### Retry with Exponential Backoff

```
Attempt 1 → failure → wait 1.5s
Attempt 2 → failure → wait 3s
Attempt 3 → failure → FAILED (log to scrape_logs, do NOT write price_history)
```

### Data Integrity Guarantee

> A failed or ambiguous scrape **never** writes to `price_history`.

Only a scrape that returns:
- A positive numeric price (validated)
- A non-empty stock status

...will insert a `price_history` row. All failures go to `scrape_logs` only, with `error_message` populated.

### Defensive Selectors

Because the mock store's exact CSS classes were not inspectable at build time (JS-rendered SPA), the scraper uses an ordered array of candidate selectors. It tries each in sequence and uses the first match. If none match, it fails loudly with a descriptive error message rather than silently storing empty/null data.

---

## 3. Trade-offs Made

| Decision | Trade-off |
|---|---|
| Playwright always active (not just fallback) | Higher resource usage, slower scrapes (~15–20s each). Acceptable because cron runs every 2h not continuously. |
| Render free tier + external cron | Service sleeps between requests. Cron ping wakes it. First scrape after sleep is slow (~30s cold start). |
| Cheerio fast path still runs | Adds ~1s overhead per scrape. Worth it for correctness and future-proofing (store might add SSR). |
| Service role key in backend env | Bypasses RLS — never expose to frontend. Frontend uses only `VITE_API_BASE_URL` pointing to our backend. |

---

## 4. What the AI Tooling Got Wrong (Fill in after testing)

> This section MUST be written by you after completing Steps 8–12.
> Be specific: what failed, what the error was, how you fixed it.

**Example structure:**

### Issue 1: [Title]
- **What happened:** ...
- **Error message:** ...
- **Root cause:** ...
- **Fix:** ...

### Issue 2: [Title]
- ...

---

## 5. What I Would Do Differently

*(Fill in after testing)*

- ...
- ...

---

## 6. Lessons Learned

*(Fill in after testing)*

- ...
- ...
