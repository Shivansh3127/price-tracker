// frontend/src/pages/Dashboard.jsx
import { useEffect, useState, useCallback } from 'react';
import ProductCard from '../components/ProductCard';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

const COOLDOWN_SEC = 60; // must match backend REFRESH_COOLDOWN_MS / 1000

export default function Dashboard() {
  const [tracked, setTracked]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast]           = useState(null);   // { msg, type }
  const [cooldown, setCooldown]     = useState(0);      // seconds remaining
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTracked();
      setTracked(res.tracked || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cooldown countdown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleRefresh = async () => {
    if (refreshing || cooldown > 0) return;
    setRefreshing(true);
    setToast(null);
    try {
      await api.triggerRefresh();
      setToast({ msg: '🔄 Scraping in background — prices update in ~15–30s', type: 'info' });
      setCooldown(COOLDOWN_SEC);
      // Reload card data after a delay so new prices appear
      setTimeout(() => load(), 18000);
    } catch (err) {
      // 429 = rate-limited; parse retryAfterSec if available
      const match = err.message.match(/(\d+)s/);
      if (match) setCooldown(parseInt(match[1], 10));
      setToast({ msg: `⚠️ ${err.message}`, type: 'warn' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleRemoved = (trackedId) => {
    setTracked(prev => prev.filter(t => t.id !== trackedId));
  };

  const activeCount  = tracked.filter(t => t.is_active).length;
  const inStockCount = tracked.filter(t =>
    t.latestPrice?.stock_status?.toLowerCase().includes('in stock')
  ).length;

  const btnLabel = refreshing
    ? '⏳ Scraping…'
    : cooldown > 0
      ? `⏱ Wait ${cooldown}s`
      : '🔄 Refresh Now';

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          background: toast.type === 'warn' ? 'rgba(234,179,8,0.15)' : 'rgba(16,185,129,0.15)',
          border: `1px solid ${toast.type === 'warn' ? 'rgba(234,179,8,0.4)' : 'rgba(16,185,129,0.4)'}`,
          color: toast.type === 'warn' ? '#fbbf24' : '#34d399',
          borderRadius: '10px', padding: '0.75rem 1.25rem',
          fontSize: '0.9rem', fontWeight: 500,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease',
          maxWidth: '360px',
        }}>
          {toast.msg}
        </div>
      )}

      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Dashboard</h1>
          <p>Monitor prices and stock status for your tracked products</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            id="refresh-now-btn"
            className="btn btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing || cooldown > 0}
            title={cooldown > 0 ? `Available in ${cooldown}s` : 'Scrape all active products now'}
            style={{ opacity: (refreshing || cooldown > 0) ? 0.6 : 1 }}
          >
            {btnLabel}
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/search')}>
            + Track Product
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Tracked',   value: activeCount,   color: 'var(--accent-violet)' },
          { label: 'In Stock',  value: inStockCount,   color: 'var(--accent-green)'  },
          { label: 'Monitored', value: 'Every 15m',   color: 'var(--accent-blue)'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ flex: '1', minWidth: '140px', textAlign: 'center' }}>
            <p style={{ color, fontSize: '1.8rem', fontWeight: 700 }}>{value}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Product grid */}
      {loading && <div className="spinner" />}
      {error && (
        <div className="card" style={{ borderColor: 'rgba(244,63,94,0.3)' }}>
          <p className="text-rose">Failed to load products: {error}</p>
          <button className="btn btn-ghost mt-2" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && tracked.length === 0 && (
        <div className="empty card">
          <h3>No tracked products yet</h3>
          <p>Search for a product and click "Track" to start monitoring its price.</p>
          <button className="btn btn-primary mt-2" onClick={() => navigate('/search')}>
            Search Products
          </button>
        </div>
      )}

      {!loading && !error && tracked.length > 0 && (
        <div className="grid-2">
          {tracked.filter(t => t.is_active).map(item => (
            <ProductCard key={item.id} item={item} onRemoved={handleRemoved} />
          ))}
        </div>
      )}
    </div>
  );
}
