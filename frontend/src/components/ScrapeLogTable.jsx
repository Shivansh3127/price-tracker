// frontend/src/components/ScrapeLogTable.jsx
import StockBadge from './StockBadge';

const STATUS_CLASS = {
  success: 'badge-success',
  retried: 'badge-warning',
  failed : 'badge-danger',
};

export default function ScrapeLogTable({ logs }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="empty">
        <h3>No scrape logs yet</h3>
        <p>Logs will appear after the first scrape attempt.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th>Retries</th>
            <th>Duration</th>
            <th>HTTP</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td style={{ whiteSpace: 'nowrap' }}>
                {new Date(log.attempted_at).toLocaleString()}
              </td>
              <td>
                <span className={`badge ${STATUS_CLASS[log.status] || 'badge-muted'}`}>
                  {log.status}
                </span>
              </td>
              <td>{log.retry_count ?? 0}</td>
              <td>{log.duration_ms != null ? `${log.duration_ms}ms` : '—'}</td>
              <td>{log.http_status ?? '—'}</td>
              <td style={{ maxWidth: '300px', color: 'var(--accent-rose)', fontSize: '0.8rem' }}>
                {log.error_message || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
