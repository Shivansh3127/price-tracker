// backend/src/index.js
// Express application entry point.

'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const productsRouter = require('./routes/products');
const historyRouter  = require('./routes/history');
const cronRouter     = require('./routes/cron');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    /\.vercel\.app$/,  // allow any Vercel preview URL
  ],
  credentials: true,
}));
app.use(express.json());

// ── Request logging (lightweight, no dependency needed) ───────
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────
// /api/products/search  → product search proxy
// /api/tracked/*        → tracked product CRUD
// /api/history/:id      → price history
// /api/logs/:id         → scrape logs
// /api/cron/*           → protected cron trigger
app.use('/api/products', productsRouter);
app.use('/api/tracked',  productsRouter);
app.use('/api/history',  historyRouter);
app.use('/api/logs',     historyRouter);
app.use('/api/cron',     cronRouter);

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── 404 catch-all ────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`Price Tracker backend listening on port ${PORT}`);
});

module.exports = app;
