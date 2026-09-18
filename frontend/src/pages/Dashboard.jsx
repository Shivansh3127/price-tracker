// frontend/src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [tracked, setTracked]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const navigate = useNavigate();

  const load = async () => {
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
  };

  useEffect(() => { load(); }, []);

  const handleRemoved = (trackedId) => {
    setTracked(prev => prev.filter(t => t.id !== trackedId));
  };

  // Stats
  const activeCount    = tracked.filter(t => t.is_active).length;
  const inStockCount   = tracked.filter(t => t.latestPrice?.stock_status?.toLowerCase().includes('in stock')).length;

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Dashboard</h1>
          <p>Monitor prices and stock status for your tracked products</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/search')}>
          + Track Product
        </button>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Tracked',   value: activeCount,  color: 'var(--accent-violet)' },
          { label: 'In Stock',  value: inStockCount,  color: 'var(--accent-green)'  },
          { label: 'Monitored', value: `Every 2h`,    color: 'var(--accent-blue)'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ flex: '1', minWidth: '140px', textAlign: 'center' }}>
            <p style={{ color, fontSize: '1.8rem', fontWeight: 700 }}>{value}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Product grid */}
      {loading && <div className="spinner" />}
      {error   && (
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
