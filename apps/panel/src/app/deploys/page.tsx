'use client';

import { useEffect, useState } from 'react';

interface Deploy {
  id: string;
  app: string;
  repo: string;
  commit: string;
  commitMsg: string;
  branch: string;
  status: 'success' | 'failure' | 'running';
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationS?: number;
}

function statusColor(s: Deploy['status']) {
  if (s === 'success') return 'var(--oc-green)';
  if (s === 'failure') return 'var(--oc-red)';
  return 'var(--oc-yellow)';
}

function statusLabel(s: Deploy['status']) {
  if (s === 'success') return '✅ Success';
  if (s === 'failure') return '❌ Failed';
  return '⏳ Running';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DeploysPage() {
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/deploys')
      .then(r => r.json())
      .then(d => { setDeploys(d.deploys ?? []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--oc-text)', margin: 0 }}>Deploys</h1>
          <p style={{ fontSize: 13, color: 'var(--oc-muted)', margin: '4px 0 0' }}>Recent GitHub Actions deployments</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetch('/api/deploys').then(r => r.json()).then(d => { setDeploys(d.deploys ?? []); setLoading(false); }); }}
          style={{ fontSize: 12, padding: '6px 14px', background: 'var(--oc-surface)', border: '1px solid var(--oc-border)', borderRadius: 6, color: 'var(--oc-text)', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {loading && <p style={{ color: 'var(--oc-muted)', fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ color: 'var(--oc-red)', fontSize: 13 }}>Error: {error}</p>}
      {!loading && deploys.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--oc-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No deploys recorded yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Deploys appear here after GitHub Actions runs</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {deploys.map(d => (
          <div key={d.id} style={{
            background: 'var(--oc-surface)',
            border: '1px solid var(--oc-border)',
            borderLeft: `3px solid ${statusColor(d.status)}`,
            borderRadius: 8,
            padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--oc-text)' }}>{d.app}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--oc-bg)', border: '1px solid var(--oc-border)', borderRadius: 4, color: 'var(--oc-muted)', fontFamily: 'monospace' }}>{d.branch}</span>
              </div>
              <span style={{ fontSize: 12, color: statusColor(d.status), fontWeight: 600 }}>{statusLabel(d.status)}</span>
            </div>

            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--oc-muted)', fontFamily: 'monospace' }}>
              <span style={{ color: 'var(--oc-accent)' }}>{d.commit.slice(0, 7)}</span>
              {' '}— {d.commitMsg}
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 18, fontSize: 12, color: 'var(--oc-muted)' }}>
              <span>⏱ {d.durationS ? `${d.durationS}s` : '—'}</span>
              <span>👤 {d.triggeredBy}</span>
              <span>🕐 {timeAgo(d.startedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
