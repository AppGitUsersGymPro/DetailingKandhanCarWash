import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { buildEstimationHTML } from '../../utils/estimationInvoice';
import { getPublicEstimation } from '../../api/estimation';

export default function PublicEstimationView() {
  const { token } = useParams();
  const [html, setHtml]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicEstimation(token)
      .then(({ estimation, business }) => setHtml(buildEstimationHTML(estimation, business)))
      .catch(() => setError('Estimate not found or the link has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', fontFamily: 'sans-serif', fontSize: 15 }}>
      Loading estimate…
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f87171', fontFamily: 'sans-serif', fontSize: 15 }}>
      {error}
    </div>
  );

  return (
    <iframe
      srcDoc={html}
      title="Estimate"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
    />
  );
}
