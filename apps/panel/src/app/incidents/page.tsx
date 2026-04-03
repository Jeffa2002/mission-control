'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '../../components/PageShell';

export default function IncidentsPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [alerts, setAlerts] = useState<any[]>([]);

  async function loadRunbooks() {
    const res = await fetch('/api/runbooks', { cache: 'no-store' });
    const j = await res.json();
    setFiles(j.files || []);
    if (!selected && j.files?.length) setSelected(j.files[0]);
  }

  async function loadRunbook(name: string) {
    const res = await fetch(`/api/runbooks?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
    const j = await res.json();
    setContent(j.content || '');
  }

  async function loadAlerts() {
    const res = await fetch('/api/alerts', { cache: 'no-store' });
    const j = await res.json();
    const a = j?.data?.alerts || [];
    setAlerts(a);
  }

  useEffect(() => {
    loadRunbooks();
    loadAlerts();
    const t = setInterval(loadAlerts, 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadRunbook(selected);
  }, [selected]);

  return (
    <PageShell title="Incidents">
      <section style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <a
          href="/api/incident/bundle?minutes=30"
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(124,232,255,0.35)',
            background: 'rgba(0,120,160,0.15)',
            color: '#d6f6ff',
            textDecoration: 'none',
            fontWeight: 800,
          }}
        >
          Download incident bundle (30m)
        </a>
        <a
          href="/api/incident/bundle?minutes=120"
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(124,232,255,0.35)',
            background: 'rgba(0,120,160,0.10)',
            color: '#d6f6ff',
            textDecoration: 'none',
            fontWeight: 800,
          }}
        >
          Bundle (2h)
        </a>
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#9fefff', opacity: 0.9, marginBottom: 8 }}>ALERT FEED (PROMETHEUS)</div>
        <div style={{ borderRadius: 14, border: '1px solid rgba(124,232,255,0.16)', background: 'rgba(0,0,0,0.22)', padding: 10 }}>
          {alerts.length === 0 ? <div style={{ opacity: 0.7, fontSize: 12 }}>No active alerts.</div> : null}
          {alerts.map((a, idx) => (
            <div key={idx} style={{ padding: '6px 0', borderBottom: idx === alerts.length - 1 ? 'none' : '1px solid rgba(124,232,255,0.08)' }}>
              <div style={{ fontWeight: 900, fontSize: 12 }}>{a.labels?.alertname || 'alert'}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{a.annotations?.summary || a.annotations?.description || ''}</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{a.state || ''}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 3fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, color: '#9fefff', opacity: 0.9, marginBottom: 8 }}>RUNBOOKS</div>
          <div style={{ borderRadius: 14, border: '1px solid rgba(124,232,255,0.16)', background: 'rgba(0,0,0,0.22)', padding: 10 }}>
            {files.map((f) => (
              <button
                key={f}
                onClick={() => setSelected(f)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  marginBottom: 6,
                  borderRadius: 10,
                  border: '1px solid rgba(124,232,255,0.12)',
                  background: selected === f ? 'rgba(0,200,255,0.12)' : 'rgba(0,0,0,0.12)',
                  color: '#d6f6ff',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {f.replace(/\.md$/, '').replace(/-/g, ' ')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, color: '#9fefff', opacity: 0.9, marginBottom: 8 }}>RUNBOOK</div>
          <pre style={{ margin: 0, padding: 12, borderRadius: 14, border: '1px solid rgba(124,232,255,0.16)', background: 'rgba(0,0,0,0.22)', whiteSpace: 'pre-wrap' }}>{content || '—'}</pre>
        </div>
      </section>
    </PageShell>
  );
}
