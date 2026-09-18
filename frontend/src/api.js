// frontend/src/api.js
// Centralised API client — all fetch calls go through here.
// VITE_API_BASE_URL is set in .env (local) or Vercel env vars (prod).

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export const api = {
  // ── Product Search (calls backend which scrapes the store) ────
  searchProducts: (q) =>
    request(`/api/products/search?q=${encodeURIComponent(q)}`),

  // ── Tracked Products ──────────────────────────────────────────
  getTracked: () => request('/api/tracked'),
  addTracked: (body) =>
    request('/api/tracked', { method: 'POST', body: JSON.stringify(body) }),
  removeTracked: (id) =>
    request(`/api/tracked/${id}`, { method: 'DELETE' }),

  // ── Price History ─────────────────────────────────────────────
  getHistory: (productId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/history/${productId}${qs ? '?' + qs : ''}`);
  },

  // ── Scrape Logs ───────────────────────────────────────────────
  getLogs: (productId) => request(`/api/logs/${productId}`),
};
