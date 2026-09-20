// frontend/src/pages/SearchPage.jsx
import { useState, useCallback } from 'react';
import { api } from '../api';

let debounceTimer;

export default function SearchPage() {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [tracking, setTracking] = useState({});   // { [url]: 'pending' | 'done' | 'error' }
  const [message,  setMessage]  = useState(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchProducts(q);
      setResults(res.products || []);
      if ((res.products || []).length === 0) {
        setError('No products found. Try a different search term.');
      }
    } catch (err) {
      setError('Search failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(val), 600);
  };

  const handleTrack = async (product) => {
    setTracking(prev => ({ ...prev, [product.url]: 'pending' }));
    try {
      await api.addTracked({
        name         : product.name,
        product_url  : product.url,
        thumbnail_url: product.thumbnailUrl,
      });
      setTracking(prev => ({ ...prev, [product.url]: 'done' }));
      setMessage(`✅ "${product.name}" is now being tracked!`);
    } catch (err) {
      setTracking(prev => ({ ...prev, [product.url]: 'error' }));
      setMessage(`❌ Failed to track: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Search Products</h1>
        <p>Search the INE mock store and select a product to track</p>
      </div>

      {/* Search input */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <input
          className="input"
          type="text"
          placeholder="Search by product name…"
          value={query}
          onChange={handleInput}
          autoFocus
        />
        <button className="btn btn-primary" onClick={() => search(query)} disabled={loading}>
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {/* Flash message */}
      {message && (
        <div className="card mb-2" style={{
          borderColor: message.startsWith('✅') ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)',
        }}>
          <p>{message}</p>
          <button className="btn btn-ghost mt-1" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
            onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="spinner" />}

      {/* Error */}
      {error && !loading && (
        <div className="empty card">
          <h3>{error}</h3>
          <p className="text-muted text-sm mt-1">Note: Search uses Playwright to render the store's JS — it may take 10–20 seconds.</p>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="grid-2">
          {results.map((product) => {
            const state = tracking[product.url];
            return (
              <div key={product.url} className="card">
                {/* Thumbnail */}
                {product.thumbnailUrl && (
                  <img
                    src={product.thumbnailUrl}
                    alt={product.name}
                    style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '0.75rem' }}
                  />
                )}

                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  {product.name}
                </h3>

                {product.price != null && (
                  <p style={{ color: 'var(--accent-green)', fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.75rem' }}>
                    ₹{product.price.toLocaleString('en-IN')}
                  </p>
                )}

                <p className="text-muted text-sm truncate mb-2">{product.url}</p>

                <button
                  className={`btn ${state === 'done' ? 'btn-ghost' : 'btn-success'}`}
                  style={{ width: '100%' }}
                  onClick={() => handleTrack(product)}
                  disabled={state === 'pending' || state === 'done'}
                >
                  {state === 'pending' ? 'Tracking…' : state === 'done' ? '✓ Tracked' : 'Track Product'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Hint */}
      {!loading && results.length === 0 && !error && (
        <div className="empty">
          <h3>Search the INE Store</h3>
          <p>Type a product name above. Results may take 15–20 seconds because the store is JS-rendered.</p>
        </div>
      )}
    </div>
  );
}
