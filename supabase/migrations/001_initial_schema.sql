-- ============================================================
-- Price Tracker — Initial Schema Migration
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. products
--    One row per unique product URL discovered/tracked.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  product_url    TEXT NOT NULL UNIQUE,
  thumbnail_url  TEXT,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);

-- ──────────────────────────────────────────────
-- 2. tracked_products
--    Drives the scrape schedule.  is_active = false
--    means cron skips this product without deleting history.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracked_products (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id              UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  scrape_interval_minutes INT  NOT NULL DEFAULT 120,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id)     -- one tracking entry per product
);

CREATE INDEX IF NOT EXISTS idx_tracked_products_active
  ON tracked_products (is_active);

-- ──────────────────────────────────────────────
-- 3. price_history
--    ONLY written on a fully confirmed, validated scrape.
--    A failed / ambiguous scrape MUST NOT produce a row here.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  stock_status TEXT NOT NULL,               -- e.g. "In Stock", "Out of Stock"
  scraped_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product_time
  ON price_history (product_id, scraped_at DESC);

-- ──────────────────────────────────────────────
-- 4. scrape_logs
--    Every attempt is recorded here — success, retried, or failed.
--    Failures are logged here ONLY (never in price_history).
-- ──────────────────────────────────────────────
CREATE TYPE scrape_status AS ENUM ('success', 'retried', 'failed');

CREATE TABLE IF NOT EXISTS scrape_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  attempted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         scrape_status NOT NULL,
  http_status    INT,                        -- HTTP status code if applicable
  error_message  TEXT,                       -- null on success
  retry_count    INT NOT NULL DEFAULT 0,
  duration_ms    INT                         -- total wall-clock time for this attempt
);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time
  ON scrape_logs (product_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_status
  ON scrape_logs (status);

-- ──────────────────────────────────────────────
-- 5. Row Level Security
--    Enabled on all tables.
--    The backend uses the SERVICE ROLE key, which bypasses RLS.
--    Anonymous / public access is blocked by default.
-- ──────────────────────────────────────────────
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs       ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no policy needed for it.
-- The policies below are intentionally restrictive for safety:
CREATE POLICY "No public read on products"
  ON products FOR SELECT USING (false);

CREATE POLICY "No public read on tracked_products"
  ON tracked_products FOR SELECT USING (false);

CREATE POLICY "No public read on price_history"
  ON price_history FOR SELECT USING (false);

CREATE POLICY "No public read on scrape_logs"
  ON scrape_logs FOR SELECT USING (false);
