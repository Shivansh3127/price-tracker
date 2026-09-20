// frontend/src/components/ProductCard.jsx
import { useNavigate } from 'react-router-dom';
import StockBadge from './StockBadge';
import { api } from '../api';
import { useState } from 'react';

export default function ProductCard({ item, onRemoved }) {
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(false);

  const { products: product, latestPrice, id: trackedId } = item;
  const name  = product?.name || 'Unknown Product';
  const price = latestPrice?.price;
  const stock = latestPrice?.stock_status;
  const thumb = product?.thumbnail_url;

  const handleRemove = async (e) => {
    e.stopPropagation();
    if (!confirm(`Stop tracking "${name}"? Price history will be preserved.`)) return;
    setRemoving(true);
    try {
      await api.removeTracked(trackedId);
      onRemoved?.(trackedId);
    } catch (err) {
      alert('Failed to remove: ' + err.message);
      setRemoving(false);
    }
  };

  return (
    <div
      className="card"
      style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/product/${product.id}`)}
    >
      {/* Thumbnail */}
      <div style={{
        height: '140px', borderRadius: '8px', overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', marginBottom: '1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {thumb ? (
          <img src={thumb} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '2.5rem' }}>📦</span>
        )}
      </div>

      {/* Name */}
      <h3 className="truncate" style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        {name}
      </h3>

      {/* Price */}
      <div className="flex items-center justify-between mt-1">
        <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-green)' }}>
          {price != null ? `₹${price.toLocaleString('en-IN')}` : '—'}
        </span>
        <StockBadge status={stock} />
      </div>

      {/* Last scraped */}
      {latestPrice?.scraped_at && (
        <p className="text-sm text-muted mt-1">
          Updated {new Date(latestPrice.scraped_at).toLocaleString()}
        </p>
      )}

      {/* Remove button */}
      <button
        className="btn btn-danger"
        style={{ marginTop: '1rem', width: '100%' }}
        onClick={handleRemove}
        disabled={removing}
      >
        {removing ? 'Removing…' : 'Untrack'}
      </button>
    </div>
  );
}
