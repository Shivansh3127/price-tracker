// frontend/src/components/PriceChart.jsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(17,24,39,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', padding: '0.75rem 1rem',
    }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.3rem' }}>{label}</p>
      <p style={{ color: 'var(--accent-green)', fontWeight: 700, fontSize: '1.1rem' }}>
        ₹{payload[0].value?.toLocaleString('en-IN')}
      </p>
    </div>
  );
};

export default function PriceChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="empty">
        <h3>No price data yet</h3>
        <p>Prices will appear here after the first successful scrape.</p>
      </div>
    );
  }

  const data = history.map(h => ({
    time : new Date(h.scraped_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    price: h.price,
    stock: h.stock_status,
  }));

  const prices     = data.map(d => d.price);
  const minPrice   = Math.min(...prices);
  const maxPrice   = Math.max(...prices);
  const avgPrice   = prices.reduce((a, b) => a + b, 0) / prices.length;
  const priceRange = maxPrice - minPrice;
  const yMin       = Math.max(0, minPrice - priceRange * 0.1);
  const yMax       = maxPrice + priceRange * 0.1;

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Current', value: prices[prices.length - 1] },
          { label: 'Lowest',  value: minPrice },
          { label: 'Highest', value: maxPrice },
          { label: 'Average', value: avgPrice },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ color: label === 'Lowest' ? 'var(--accent-green)' : label === 'Highest' ? 'var(--accent-rose)' : 'var(--text-primary)', fontWeight: 700, fontSize: '1.1rem' }}>
              ₹{value?.toLocaleString('en-IN')}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `₹${v.toLocaleString('en-IN')}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={avgPrice} stroke="rgba(139,92,246,0.4)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--accent-green)"
            strokeWidth={2.5}
            dot={{ fill: 'var(--accent-green)', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: 'var(--accent-green)', strokeWidth: 2, stroke: 'var(--bg-primary)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
