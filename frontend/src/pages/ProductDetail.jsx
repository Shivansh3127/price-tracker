// frontend/src/pages/ProductDetail.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PriceChart      from '../components/PriceChart';
import ScrapeLogTable  from '../components/ScrapeLogTable';
import StockBadge      from '../components/StockBadge';
import { api }         from '../api';

export default function ProductDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [product,  setProduct]  = useState(null);
  const [history,  setHistory]  = useState([]);
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [tab,      setTab]      = useState('chart'); // 'chart' | 'logs'

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [histRes, logRes, trackedRes] = await Promise.all([
          api.getHistory(id),
          api.getLogs(id),
          api.getTracked(),
        ]);
        setHistory(histRes.history || []);
        setLogs(logRes.logs || []);

        // Find product info from tracked list
        const tracked = (trackedRes.tracked || []).find(t => t.products?.id === id);
        setProduct(tracked?.products || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="spinner" style={{ marginTop: '4rem' }} />;
  if (error)   return (
    <div>
      <button className="btn btn-ghost mb-2" onClick={() => navigate(-1)}>← Back</button>
      <div className="card" style={{ borderColor: 'rgba(244,63,94,0.3)' }}>
        <p className="text-rose">Error: {error}</p>
      </div>
    </div>
  );

  const latestHistory = history[history.length - 1];

  return (
    <div>
      {/* Back */}
      <button className="btn btn-ghost mb-2" onClick={() => navigate(-1)}>← Back</button>

      {/* Header */}
      <div className="card mb-2">
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          {product?.thumbnail_url && (
            <img
              src={product.thumbnail_url}
              alt={product.name}
              style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.4rem' }}>{product?.name || 'Product'}</h1>
            <a
              href={product?.product_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted"
              style={{ color: 'var(--accent-blue)', wordBreak: 'break-all' }}
            >
              {product?.product_url}
            </a>
          </div>

          {latestHistory && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                ${latestHistory.price?.toFixed(2)}
              </p>
              <StockBadge status={latestHistory.stock_status} />
              <p className="text-sm text-muted mt-1">
                {new Date(latestHistory.scraped_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-2">
        {[
          { key: 'chart', label: `📈 Price Chart (${history.length})` },
          { key: 'logs',  label: `📋 Scrape Logs (${logs.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card">
        {tab === 'chart' && <PriceChart history={history} />}
        {tab === 'logs'  && <ScrapeLogTable logs={logs} />}
      </div>
    </div>
  );
}
