'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../../components/PageShell';

const SERVICES = ['nginx', 'postgresql', 'docker', 'ollama', 'openclaw'] as const;

function isRunning(ps: string, service: string) {
  if (!ps) return false;
  const rx = new RegExp(`(^|\\n).*${service}.*`, 'i');
  return rx.test(ps);
}

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

  const services = useMemo(() => SERVICES.map((service) => ({ service, running: isRunning(ps, service) })), [ps]);

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
          SERVICE STATUS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {services.map(({ service, running }) => (
            <div key={service} style={{ padding: 14, borderRadius: 14, border: '1px solid rgba(124,232,255,0.16)', background: 'rgba(0,0,0,0.22)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: running ? '#00ff88' : '#ff4466', boxShadow: `0 0 12px ${running ? '#00ff88' : '#ff4466'}` }} />
                <div style={{ fontWeight: 800, textTransform: 'capitalize' }}>{service}</div>
              </div>
              <div style={{ color: running ? '#00ff88' : '#ff7aa8', fontSize: 13, fontWeight: 700 }}>
                {running ? 'running' : 'stopped'}
              </div>
            </div>
          ))}
        </div>

        <details style={{ marginTop: 16, padding: 12, borderRadius: 14, border: '1px solid rgba(124,232,255,0.16)', background: 'rgba(0,0,0,0.18)' }}>
          <summary style={{ cursor: 'pointer', color: '#9fefff', fontWeight: 700 }}>Raw process list</summary>
          <pre
            style={{
              margin: '12px 0 0',
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(124,232,255,0.12)',
              background: 'rgba(0,0,0,0.22)',
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
            }}
          >
            {ps || '—'}
          </pre>
        </details>
      </section>
    </PageShell>
  );
}
