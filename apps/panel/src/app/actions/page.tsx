'use client';

import { useEffect, useState } from 'react';
import { Nav } from '../nav';

interface AuditEntry {
  ts?: string;
  action?: string;
  detail?: string;
  actor?: string;
  auth_method?: string;
  result?: string;
  error?: string;
  ip?: string;
  idempotency_key?: string;
  [key: string]: unknown;
}

function resultBg(r?: string) {
  if (r === 'ok')      return 'rgba(51,255,204,0.15)';
  if (r === 'error')   return 'rgba(255,80,120,0.18)';
  if (r === 'blocked') return 'rgba(255,208,128,0.15)';
  if (r === 'pending') return 'rgba(124,232,255,0.12)';
  return 'rgba(124,232,255,0.08)';
}
function resultFg(r?: string) {
  if (r === 'ok')      return '#33ffcc';
  if (r === 'error')   return '#ff7aa8';
  if (r === 'blocked') return '#ffd080';
  return '#d6f6ff';
}

export default function ActionsPage() {
  const [items, setItems]     = useState<AuditEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [limit, setLimit]     = useState(100);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [filter, setFilter]   = useState('');

  async function load(l: number) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/actions?limit=${l}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setItems(j.items || []);
      setTotal(j.count ?? 0);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(limit); }, [limit]);

  const filtered = filter
    ? items.filter(
        (it) =>
          JSON.stringify(it).toLowerCase().includes(filter.toLowerCase()),
      )
    : items;

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 24,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#d6f6ff',
        background:
          'radial-gradient(1200px 700px at 20% 10%, rgba(0,255,255,0.14), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(0,140,255,0.12), transparent 55%), radial-gradient(900px 600px at 50% 80%, rgba(140,0,255,0.10), transparent 60%), linear-gradient(180deg, #040814 0%, #030513 55%, #02030a 100%)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <div style={{ letterSpacing: 3, fontSize: 12, color: '#7ce8ff', opacity: 0.9 }}>MISSION CONTROL</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 28, textShadow: '0 0 18px rgba(0,220,255,0.25)' }}>Audit Log</h1>
        </div>
        <button
          onClick={() => load(limit)}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: '1px solid rgba(124,232,255,0.35)',
            background: 'rgba(0,120,160,0.15)',
            color: '#d6f6ff',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      <Nav />

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: '1 1 200px',
            maxWidth: 320,
            padding: '7px 12px',
            borderRadius: 10,
            border: '1px solid rgba(124,232,255,0.25)',
            background: 'rgba(0,0,0,0.28)',
            color: '#d6f6ff',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {loading ? 'Loading…' : `${filtered.length} of ${total} entries`}
        </div>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid rgba(124,232,255,0.25)',
            background: 'rgba(0,0,0,0.28)',
            color: '#d6f6ff',
            fontSize: 12,
          }}
        >
          {[50, 100, 200, 500].map((v) => (
            <option key={v} value={v}>{v} entries</option>
          ))}
        </select>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(255,80,120,0.4)', background: 'rgba(255,40,90,0.08)', color: '#ff7aa8', fontSize: 13 }}>
          {err}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          borderRadius: 14,
          border: '1px solid rgba(124,232,255,0.16)',
          background: 'rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 130px 80px 70px 80px 1fr',
            gap: '0 10px',
            padding: '8px 14px',
            borderBottom: '1px solid rgba(124,232,255,0.12)',
            fontSize: 10,
            opacity: 0.55,
            letterSpacing: 1.2,
          }}
        >
          <span>TIME</span>
          <span>ACTION</span>
          <span>RESULT</span>
          <span>AUTH</span>
          <span>IP</span>
          <span>DETAIL / ERROR</span>
        </div>

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 24, fontSize: 13, opacity: 0.7, textAlign: 'center' }}>
            No audit entries found.
          </div>
        )}

        {filtered.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 130px 80px 70px 80px 1fr',
              gap: '0 10px',
              padding: '8px 14px',
              borderBottom: idx < filtered.length - 1 ? '1px solid rgba(124,232,255,0.07)' : 'none',
              alignItems: 'start',
              background: it.result === 'error' ? 'rgba(255,80,120,0.04)' : undefined,
            }}
          >
            {/* Timestamp */}
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11,
                opacity: 0.65,
                whiteSpace: 'nowrap',
              }}
            >
              <div>{it.ts ? new Date(it.ts).toLocaleDateString() : '—'}</div>
              <div style={{ opacity: 0.8 }}>{it.ts ? new Date(it.ts).toLocaleTimeString() : ''}</div>
            </div>

            {/* Action */}
            <div style={{ fontWeight: 800, fontSize: 12, wordBreak: 'break-all' }}>
              {it.action ?? '—'}
              {it.idempotency_key && (
                <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.45 }} title={`idempotency: ${it.idempotency_key}`}>🔑</span>
              )}
            </div>

            {/* Result badge */}
            <div>
              {it.result ? (
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: resultBg(it.result),
                    color: resultFg(it.result),
                    border: '1px solid rgba(124,232,255,0.18)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.result}
                </span>
              ) : <span style={{ opacity: 0.35, fontSize: 11 }}>—</span>}
            </div>

            {/* Auth method */}
            <div style={{ fontSize: 10, opacity: 0.7 }}>
              {it.auth_method ? (
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: it.auth_method === 'hmac' ? 'rgba(51,255,204,0.12)' : 'rgba(124,232,255,0.10)',
                    color: it.auth_method === 'hmac' ? '#33ffcc' : '#7ce8ff',
                    border: '1px solid rgba(124,232,255,0.18)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.auth_method}
                </span>
              ) : <span style={{ opacity: 0.35 }}>—</span>}
            </div>

            {/* IP */}
            <div
              style={{
                fontSize: 10,
                opacity: 0.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {(it.ip && it.ip !== 'unknown') ? it.ip : '—'}
            </div>

            {/* Detail + error */}
            <div style={{ minWidth: 0 }}>
              {it.detail ? (
                <div style={{ fontSize: 11, opacity: 0.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {it.detail}
                </div>
              ) : null}
              {it.error ? (
                <div style={{ fontSize: 11, color: '#ff7aa8', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  ⚠ {it.error}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
