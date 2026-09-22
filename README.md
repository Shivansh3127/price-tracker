# Product Price Tracker

This is a full-stack web app that monitors product prices and stock status on the [INE mock store](https://demo.inelabteamdev.com/). Users search for products, add them to a watchlist, and see price history charts updated automatically every 15 minutes by a background scraper. Built for the INE Software Engineer Intern assignment.

**Live links:**
- 🌐 Frontend: https://price-tracker-chi-seven.vercel.app/
- 🔌 Backend API: `https://price-tracker-backend-5re1.onrender.com`
- 📦 Repo: `https://github.com/Shivansh3127/price-tracker`

See [DESIGN_NOTE.md](./DESIGN_NOTE.md) for a deep dive into scraping strategy and trade-offs.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                     Vercel          │
│  Dashboard · SearchPage · ProductDetail                       │
│  ProductCard · PriceChart · ScrapeLogTable                    │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTPS (VITE_API_BASE_URL)
┌───────────────────────▼──────────────────────────────────────┐
│  Backend (Node.js + Express)                 Render           │
│  POST /api/cron/scrape  ◄── cron-job.org (every 2 h)         │
│  Scraper: HTTP+Cheerio fast path → Playwright fallback        │
│  Retry with exponential backoff · per-product isolation       │
└───────────────────────┬──────────────────────────────────────┘
                        │ Supabase JS client (service role)
┌───────────────────────▼──────────────────────────────────────┐
│  Database (Supabase / PostgreSQL)                             │
│  products · tracked_products · price_history · scrape_logs    │
└──────────────────────────────────────────────────────────────┘
```

The frontend never touches the database directly — all data flows through the Express backend, which holds the Supabase service-role key.

---

## Monorepo Structure

```
/
├── frontend/              React + Vite  →  Vercel
│   └── src/
│       ├── pages/         Dashboard, SearchPage, ProductDetail
│       ├── components/    ProductCard, PriceChart, ScrapeLogTable, StockBadge
│       ├── api.js         Centralised fetch wrapper
│       └── index.css      Dark glassmorphism design system
├── backend/               Express API + scraper  →  Render
│   ├── src/
│   │   ├── index.js       Server entry point (CORS, routes)
│   │   ├── db/            Supabase client
│   │   ├── routes/        products, history, cron
│   │   └── scraper/       http-scraper, playwright-scraper, retry, index
│   └── scraper/
│       └── run-headed.js  CLI headed-mode runner (demo recording)
├── supabase/
│   └── migrations/        001_initial_schema.sql
├── README.md
└── DESIGN_NOTE.md
```

---

## Local Setup

### Prerequisites
- Node.js ≥ 18
- A free [Supabase](https://app.supabase.com) project
- Chromium for Playwright (installed below)

### 1. Clone & install

```bash
git clone https://github.com/Shivansh3127/price-tracker.git
cd price-tracker

# Backend
cd backend
npm install
npx playwright install chromium   # downloads ~150 MB Chromium binary
cp .env.example .env              # then fill in values — see table below

# Frontend (separate terminal)
cd ../frontend
npm install
# no .env needed for local dev — defaults to http://localhost:3001
```

### 2. Apply the database schema

1. Open [Supabase Dashboard](https://app.supabase.com) → your project → **SQL Editor**
2. Paste and run the full contents of `supabase/migrations/001_initial_schema.sql`

This creates four tables (`products`, `tracked_products`, `price_history`, `scrape_logs`) with RLS enabled and all indexes.

### 3. Start both servers

```bash
# Terminal 1 — backend (nodemon, auto-restarts on save)
cd backend
npm run dev          # → http://localhost:3001

# Terminal 2 — frontend (Vite HMR)
cd frontend
npm run dev          # → http://localhost:5173
```

Open `http://localhost:5173`, search for a product, track it, then trigger a scrape manually:

```bash
curl -X POST http://localhost:3001/api/cron/scrape \
  -H "X-Cron-Token: YOUR_CRON_SECRET"
```

---

## Headed (Visible Browser) Scraper

Runs the scraper with a real Chromium window — useful for the demo video and for debugging selector issues.

```bash
cd backend
npm run scrape:headed
```

Track at least one product via the UI first. A visible browser window will open for each active tracked product, navigate to the product page, perform the hover reveal, and print the result. Record with OBS or Windows Game Bar (`Win + G`).

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | App | What it does | Where to get it |
|---|---|---|---|
| `SUPABASE_URL` | backend | Supabase project REST URL | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | backend | Service role key — bypasses RLS, **never expose to frontend** | Supabase Dashboard → Settings → API → service_role key |
| `CRON_SECRET` | backend | Bearer token for `POST /api/cron/scrape` — set the same value in cron-job.org | Generate any strong random string |
| `STORE_BASE_URL` | backend | Root URL of the mock store | `https://demo.inelabteamdev.com` (already in .env.example) |
| `PORT` | backend | Express listen port | `3001` for local |
| `FRONTEND_URL` | backend | Allowed CORS origin | `http://localhost:5173` locally; your Vercel URL in production |

### Frontend (`frontend/.env` / Vercel env)

| Variable | App | What it does | Where to get it |
|---|---|---|---|
| `VITE_API_BASE_URL` | frontend | Backend base URL (no trailing slash) | `http://localhost:3001` locally; your Render URL in production |

> **Note on `CHROMIUM_PATH`:** Not required locally. On Render, set `PLAYWRIGHT_BROWSERS_PATH=0` in the environment variables panel (not `.env`) so Chromium is installed to `node_modules` and persists across restarts.

---

## Scraping Schedule

Scrapes run **every 15 minutes**, triggered externally by [cron-job.org](https://cron-job.org) hitting:

```
POST https://price-tracker-backend-5re1.onrender.com/api/cron/scrape
X-Cron-Token: <your token>
```

The schedule is external (not an `setInterval` inside Node) because **Render's free tier puts the service to sleep after 15 minutes of inactivity** — an internal timer would never fire. The cron ping also acts as the wake-up request.

**cron-job.org setup:**
1. URL: your Render URL + `/api/cron/scrape`
2. Method: `POST`
3. Custom header: `X-Cron-Token` = value of `CRON_SECRET`
4. Schedule: `*/15 * * * *` (every 15 minutes)

---

## Deployment

### Supabase
1. Create project at [app.supabase.com](https://app.supabase.com)
2. SQL Editor → run `supabase/migrations/001_initial_schema.sql`
3. Copy **Project URL** and **service_role key** from Settings → API

### Render (Backend)
1. New Web Service → connect `Shivansh3127/price-tracker`
2. Root directory: `backend`
3. Build command: `npm install && npx playwright install chromium`
4. Start command: `npm start`
5. Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `STORE_BASE_URL`, `FRONTEND_URL`, `PLAYWRIGHT_BROWSERS_PATH=0`
6. Deploy — first deploy installs Chromium (~150 MB, ~3 min)

### Vercel (Frontend)
1. New Project → import `Shivansh3127/price-tracker` → root directory: `frontend`
2. Framework preset: **Vite**
3. Env var: `VITE_API_BASE_URL` = your Render URL (e.g. `https://price-tracker-backend-5re1.onrender.com`)
4. Deploy

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{ status: "ok", ts }` |
| `GET` | `/api/products/search?q=` | Search mock store by keyword |
| `GET` | `/api/tracked` | List all tracked products with latest price |
| `POST` | `/api/tracked` | Add product to tracking |
| `DELETE` | `/api/tracked/:id` | Deactivate tracking (history preserved) |
| `GET` | `/api/history/:productId` | Price history for a product |
| `GET` | `/api/logs/:productId` | Scrape log entries for a product |
| `POST` | `/api/cron/scrape` | Trigger scrape job (requires `X-Cron-Token` header) |
