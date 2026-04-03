'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '../../components/PageShell';

export default function SystemsPage() {
  const [ps, setPs] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setErr(null);
    try {
      const res = await fetch('/api/systems', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setPs(j.ps || '');
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <PageShell title="Systems">
      {err ? <div style={{ marginTop: 14, color: '#ff7aa8' }}>{err}</div> : null}

      <section style={{ marginTop: 16 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: 2,
            color: '#9fefff',
            opacity: 0.9,
            marginBottom: 8,
          }}
        >
          DOCKER CONTAINERS
        </div>
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 14,
            border: '1px solid rgba(124,232,255,0.16)',
            background: 'rgba(0,0,0,0.22)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {ps || '—'}
        </pre>
      </section>
    </PageShell>
  );
}
