// backend/src/index.js
// Express application entry point.

'use strict';

require('dotenv').config();

const express        = require('express');
const cors           = require('cors');

const productsRouter = require('./routes/products');
const trackedRouter  = require('./routes/tracked');
const historyRouter  = require('./routes/history');
const cronRouter     = require('./routes/cron');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    /\.vercel\.app$/,   // allow any Vercel preview URL
    /localhost:\d+/,    // allow any localhost port (dev)
  ],
  credentials: true,
}));
app.use(express.json());

// Lightweight request logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────
// GET  /api/products/search?q=   →  search mock store
app.use('/api/products', productsRouter);

// GET/POST/DELETE /api/tracked   →  tracked product CRUD
app.use('/api/tracked', trackedRouter);

// GET /api/history/:id  and  GET /api/logs/:id
app.use('/api', historyRouter);

// POST /api/cron/scrape  (protected)
app.use('/api/cron', cronRouter);

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ──────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Price Tracker backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Store:  ${process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com'}\n`);
});

module.exports = app;
