# Product Price Tracker

A full-stack web application that tracks product prices and stock status on the [INE mock store](https://demo.inelabteamdev.com/).

Built for the INE Software Engineer Intern assignment.

**Live Links:**
- 🌐 Frontend: `https://YOUR_APP.vercel.app` *(fill in after deploy)*
- 🔌 Backend API: `https://YOUR_APP.onrender.com` *(fill in after deploy)*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)          Vercel                    │
│  - Dashboard, Search, Product Detail                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS API calls
┌─────────────────────▼───────────────────────────────────────┐
│  Backend (Node + Express)         Render                    │
│  - Product search proxy                                     │
│  - Tracked product CRUD                                     │
│  - POST /api/cron/scrape  ◄─── cron-job.org (every 2 hrs)  │
│  - Scraper: HTTP+Cheerio → Playwright fallback              │
└─────────────────────┬───────────────────────────────────────┘
                      │ Supabase JS client
┌─────────────────────▼───────────────────────────────────────┐
│  Database (Supabase / PostgreSQL)                           │
│  - products, tracked_products, price_history, scrape_logs   │
└─────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
/
├── frontend/              React + Vite (Vercel)
│   └── src/
│       ├── pages/         Dashboard, SearchPage, ProductDetail
│       ├── components/    ProductCard, PriceChart, ScrapeLogTable, StockBadge
│       ├── api.js         Centralised fetch client
│       └── index.css      Dark glassmorphism design system
├── backend/               Express API + scraper (Render)
│   ├── src/
│   │   ├── index.js       Express entry point
│   │   ├── db/            Supabase client
│   │   ├── routes/        products, history, cron
│   │   └── scraper/       HTTP+Cheerio, Playwright, retry, selectors
│   └── scraper/
│       └── run-headed.js  CLI headed-mode runner (for demo recording)
├── supabase/
│   └── migrations/        SQL schema files
├── README.md
└── DESIGN_NOTE.md
```

---

## Local Setup

### Prerequisites
- Node.js ≥ 18
- A Supabase project (free tier works)
- Playwright Chromium: `npx playwright install chromium`

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/price-tracker.git
cd price-tracker

# Backend
cd backend
npm install
npx playwright install chromium
cp .env.example .env
# → Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET in .env

# Frontend
cd ../frontend
npm install
# .env is already set to http://localhost:3001
```

### 2. Run the SQL migrations

1. Open [Supabase Dashboard](https://app.supabase.com) → your project → SQL Editor
2. Paste and run the contents of `supabase/migrations/001_initial_schema.sql`

### 3. Start both servers

```bash
# Terminal 1 — backend
cd backend
npm run dev       # nodemon, port 3001

# Terminal 2 — frontend
cd frontend
npm run dev       # Vite, port 5173
```

Open http://localhost:5173

---

## Running the Headed (Visible Browser) Scraper

This is used for the demo video. Add at least one tracked product via the UI first, then:

```bash
cd backend
node scraper/run-headed.js
```

A visible Chromium window will open for each product. Record this with OBS or Windows Game Bar (Win + G).

---

## Scheduling (cron-job.org — every 2 hours)

The backend uses an **external cron service** instead of an always-on loop because Render's free tier puts the service to sleep between requests. cron-job.org sends an HTTP ping to wake and trigger the scrape.

### Setup steps
1. Create a free account at [cron-job.org](https://cron-job.org)
2. Create a new cron job:
   - **URL**: `https://YOUR_APP.onrender.com/api/cron/scrape`
   - **Method**: `POST`
   - **Header**: `X-Cron-Token: YOUR_CRON_SECRET`
   - **Schedule**: Every 2 hours (`0 */2 * * *`)
3. Save and enable

### Manual trigger (for testing)
```bash
curl -X POST https://YOUR_APP.onrender.com/api/cron/scrape \
  -H "X-Cron-Token: YOUR_CRON_SECRET"
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key (bypasses RLS) | `eyJ...` |
| `CRON_SECRET` | Token for cron endpoint auth | `my-very-secret-token` |
| `STORE_BASE_URL` | The mock store URL | `https://demo.inelabteamdev.com` |
| `PORT` | Express port | `3001` |
| `FRONTEND_URL` | Frontend URL (for CORS) | `http://localhost:5173` |
| `CHROMIUM_PATH` | Path to system Chromium (Render) | `/usr/bin/chromium-browser` |

### Frontend (`frontend/.env`)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Backend URL | `http://localhost:3001` |

---

## Deployment

### Supabase
1. Create project at [app.supabase.com](https://app.supabase.com)
2. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor
3. Copy **Project URL** and **Service Role key** from Settings → API

### Render (Backend)
1. Push this repo to GitHub
2. New Web Service → connect repo → root directory: `backend`
3. Build command: `npm install && npx playwright install chromium`
4. Start command: `npm start`
5. Add environment variables (all from table above)
6. Deploy

### Vercel (Frontend)
1. New Project → import GitHub repo → root directory: `frontend`
2. Framework preset: Vite
3. Add environment variable: `VITE_API_BASE_URL` = your Render URL
4. Deploy

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/products/search?q=` | Search mock store |
| `GET` | `/api/tracked` | List tracked products |
| `POST` | `/api/tracked` | Add product to tracking |
| `DELETE` | `/api/tracked/:id` | Deactivate tracking |
| `GET` | `/api/history/:productId` | Price history |
| `GET` | `/api/logs/:productId` | Scrape logs |
| `POST` | `/api/cron/scrape` | Trigger scrape (requires `X-Cron-Token`) |
| `GET` | `/api/cron/status` | Cron status info |
