'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '../../components/PageShell';

interface SslInfo {
  valid: boolean;
  expiresAt: string;
  daysRemaining: number;
  issuer?: string;
}

interface AppHealth {
  id: string;
  name: string;
  description: string;
  url: string;
  color: string;
  emoji: string;
  status: 'up' | 'degraded' | 'down' | 'unknown';
  statusCode?: number;
  latencyMs?: number;
  ssl?: SslInfo;
  error?: string;
  checkedAt: string;
}

interface EffectxData {
  overall: 'green' | 'amber' | 'red';
  summary: { total: number; up: number; down: number; degraded: number };
  apps: AppHealth[];
  checkedAt: string;
}

const STATUS_COLOR = {
  up: '#4ade80',
  degraded: '#fbbf24',
  down: '#f87171',
  unknown: '#94a3b8',
} as const;

const STATUS_LABEL = {
  up: '● UP',
  degraded: '◐ DEGRADED',
  down: '● DOWN',
  unknown: '? UNKNOWN',
} as const;

const OVERALL_COLOR = {
  green: '#4ade80',
  amber: '#fbbf24',
  red: '#f87171',
} as const;

function LatencyBar({ ms }: { ms?: number }) {
  if (!ms) return null;
  const width = Math.min(100, (ms / 3000) * 100);
  const color = ms < 500 ? '#4ade80' : ms < 1500 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 10, color: '#9fefff', minWidth: 40, textAlign: 'right' }}>{ms}ms</span>
    </div>
  );
}

function AppCard({ app }: { app: AppHealth }) {
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.28)',
          border: `1px solid ${app.status === 'up' ? 'rgba(74,222,128,0.2)' : app.status === 'down' ? 'rgba(248,113,113,0.3)' : 'rgba(124,232,255,0.14)'}`,
          borderRadius: 14,
          padding: '16px 18px',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: `${app.color}22`,
              border: `1px solid ${app.color}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>
              {app.emoji}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#d6f6ff' }}>{app.name}</div>
              <div style={{ fontSize: 11, color: '#7ce8ff', opacity: 0.7, marginTop: 1 }}>{app.description}</div>
            </div>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
            color: STATUS_COLOR[app.status],
            textShadow: `0 0 8px ${STATUS_COLOR[app.status]}88`,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {STATUS_LABEL[app.status]}
          </div>
        </div>

        <LatencyBar ms={app.latencyMs} />

        {app.ssl && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10 }}>🔒</span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: app.ssl.daysRemaining > 14 ? '#4ade80' : app.ssl.daysRemaining > 7 ? '#fbbf24' : '#f87171',
            }}>
              SSL {app.ssl.valid ? `valid · ${app.ssl.daysRemaining}d left` : 'EXPIRED'}
            </span>
            <span style={{ fontSize: 10, color: '#7ce8ff', opacity: 0.45 }}>
              (expires {new Date(app.ssl.expiresAt).toLocaleDateString()})
            </span>
          </div>
        )}

        {app.error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171', opacity: 0.8 }}>
            {app.error.length > 80 ? app.error.slice(0, 80) + '…' : app.error}
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 10, color: '#7ce8ff', opacity: 0.5 }}>
          {app.url.replace('https://', '')}
          {app.statusCode ? ` · HTTP ${app.statusCode}` : ''}
        </div>
      </div>
    </a>
  );
}

export default function AppsPage() {
  const [data, setData] = useState<EffectxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function refresh() {
    setErr(null);
    try {
      const res = await fetch('/api/effectx', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setLastRefresh(new Date());
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, []);

  const overall = data?.overall ?? 'green';

  return (
    <PageShell title="Effectx Apps">
      {/* Overall status banner */}
      <div style={{
        marginTop: 16,
        padding: '14px 20px',
        borderRadius: 12,
        background: `${OVERALL_COLOR[overall]}11`,
        border: `1px solid ${OVERALL_COLOR[overall]}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: OVERALL_COLOR[overall],
            boxShadow: `0 0 8px ${OVERALL_COLOR[overall]}`,
            animation: overall === 'green' ? undefined : 'pulse 1.5s infinite',
          }} />
          <span style={{ fontWeight: 700, color: OVERALL_COLOR[overall], fontSize: 14 }}>
            {overall === 'green' ? 'All systems operational' : overall === 'amber' ? 'Partial outage detected' : 'Major outage detected'}
          </span>
          {data && (
            <span style={{ fontSize: 12, color: '#9fefff', opacity: 0.6 }}>
              {data.summary.up}/{data.summary.total} up
              {data.summary.down > 0 ? ` · ${data.summary.down} down` : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: '#7ce8ff', opacity: 0.5 }}>
              refreshed {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refresh}
            style={{
              padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid rgba(124,232,255,0.22)',
              background: 'rgba(0,0,0,0.2)', color: '#9fefff',
              fontSize: 11, fontWeight: 700,
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: '#f87171', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div style={{ marginTop: 32, textAlign: 'center', color: '#7ce8ff', opacity: 0.6, fontSize: 13 }}>
          Checking apps…
        </div>
      )}

      {data && (
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {data.apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
