// frontend/src/components/StockBadge.jsx
export default function StockBadge({ status }) {
  if (!status) return <span className="badge badge-muted">Unknown</span>;
  const s = status.toLowerCase();
  if (s.includes('out') || s.includes('unavailable')) {
    return <span className="badge badge-danger">Out of Stock</span>;
  }
  if (s.includes('low') || s.includes('limited')) {
    return <span className="badge badge-warning">Low Stock</span>;
  }
  return <span className="badge badge-success">In Stock</span>;
}
