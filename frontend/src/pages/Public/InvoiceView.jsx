import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { buildInvoiceHTML } from '../../utils/invoice';
import { getPublicJobCard } from '../../api/jobcards';

export default function PublicInvoiceView() {
  const { token } = useParams();
  const [html, setHtml]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicJobCard(token)
      .then(data => setHtml(buildInvoiceHTML(data)))
      .catch(() => setError('Invoice not found or the link has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', fontFamily: 'sans-serif', fontSize: 15 }}>
      Loading invoice…
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
      title="Invoice"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
    />
  );
}
