'use client';

import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Shared pill styles
// ─────────────────────────────────────────────────────────────────────────────

type PillColor = 'default' | 'green' | 'red' | 'yellow' | 'blue';

function pillColor(c: PillColor): string {
  switch (c) {
    case 'green':  return '#33ffcc';
    case 'red':    return '#ff7aa8';
    case 'yellow': return '#ffd080';
    case 'blue':   return '#7ce8ff';
    default:       return '#d6f6ff';
  }
}

function Pill({
  label,
  value,
  color = 'default',
  title,
}: {
  label: string;
  value: string;
  color?: PillColor;
  title?: string;
}) {
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 999,
        border: '1px solid rgba(124,232,255,0.18)',
        background: 'rgba(0,0,0,0.22)',
        display: 'flex',
        gap: 7,
        alignItems: 'baseline',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1, whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: pillColor(color),
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 140,
        }}
        title={title ?? String(value)}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function fmtAge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 60)   return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${(sec / 3600).toFixed(1)}h ago`;
}

function fmtPnl(usdt: number | null | undefined): string {
  if (usdt == null || !Number.isFinite(usdt)) return '—';
  const sign = usdt >= 0 ? '+' : '';
  return `${sign}${usdt.toFixed(2)} USDT`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HealthStrip — top-of-page green/amber/red status bar
// ─────────────────────────────────────────────────────────────────────────────

type HealthColor = 'green' | 'amber' | 'red';
type CheckStatus = 'ok' | 'degraded' | 'error' | 'unknown';

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
  value?: unknown;
}

interface HealthData {
  ok: boolean;
  overall: HealthColor;
  checks: Record<string, HealthCheck>;
  checked_at: string;
}

const HEALTH_BG: Record<HealthColor, string> = {
  green: 'rgba(51,255,204,0.12)',
  amber: 'rgba(255,208,128,0.12)',
  red:   'rgba(255,80,120,0.15)',
};
const HEALTH_BORDER: Record<HealthColor, string> = {
  green: 'rgba(51,255,204,0.35)',
  amber: 'rgba(255,208,128,0.35)',
  red:   'rgba(255,80,120,0.45)',
};
const HEALTH_DOT: Record<HealthColor, string> = {
  green: '#33ffcc',
  amber: '#ffd080',
  red:   '#ff5577',
};
const HEALTH_LABEL: Record<HealthColor, string> = {
  green: 'ALL SYSTEMS GO',
  amber: 'DEGRADED',
  red:   'CRITICAL',
};

/** Human-readable display name for each health check key */
const CHECK_DISPLAY: Record<string, string> = {
  app: 'Panel',
  prometheus: 'Prometheus',
  grafana: 'Grafana',
  heartbeat: 'Heartbeat',
  panic_latch: 'Panic Latch',
};

/** Background colour per status */
const STATUS_BG: Record<CheckStatus, string> = {
  ok:       'rgba(51,255,204,0.13)',
  degraded: 'rgba(255,208,128,0.15)',
  error:    'rgba(255,80,120,0.18)',
  unknown:  'rgba(124,232,255,0.10)',
};
const STATUS_BORDER: Record<CheckStatus, string> = {
  ok:       'rgba(51,255,204,0.35)',
  degraded: 'rgba(255,208,128,0.35)',
  error:    'rgba(255,80,120,0.45)',
  unknown:  'rgba(124,232,255,0.20)',
};
const STATUS_TEXT: Record<CheckStatus, string> = {
  ok:       '#33ffcc',
  degraded: '#ffd080',
  error:    '#ff7aa8',
  unknown:  '#9fefff',
};
const STATUS_ICON: Record<CheckStatus, string> = {
  ok:       '●',
  degraded: '◐',
  error:    '●',
  unknown:  '○',
};

function checkStatusColor(s: CheckStatus): PillColor {
  switch (s) {
    case 'ok':       return 'green';
    case 'degraded': return 'yellow';
    case 'error':    return 'red';
    default:         return 'default';
  }
}

function HealthCheckCard({ name, check }: { name: string; check: HealthCheck }) {
  const s = check.status;
  const label = CHECK_DISPLAY[name] ?? name.replace(/_/g, ' ').toUpperCase();
  const detail = check.detail ?? check.status;

  return (
    <div
      title={detail}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '7px 10px',
        borderRadius: 10,
        border: `1px solid ${STATUS_BORDER[s]}`,
        background: STATUS_BG[s],
        minWidth: 100,
        flex: '0 0 auto',
      }}
    >
      {/* Name + dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: STATUS_TEXT[s], fontSize: 9, lineHeight: 1 }}>{STATUS_ICON[s]}</span>
        <span style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.8, fontWeight: 700 }}>
          {label}
        </span>
      </div>
      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: STATUS_TEXT[s], letterSpacing: 0.3 }}>
          {s === 'ok' ? 'OK' : s === 'degraded' ? 'DEGRADED' : s === 'error' ? 'ERROR' : 'UNKNOWN'}
        </span>
      </div>
      {/* Detail (truncated) */}
      <div
        style={{
          fontSize: 10,
          opacity: 0.6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 140,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {detail}
      </div>
    </div>
  );
}

export function HealthStrip() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setErr(null);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
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

  const overall   = data?.overall ?? 'amber';
  const checks    = data?.checks  ?? {};
  const checkedAt = data?.checked_at ? new Date(data.checked_at).toLocaleTimeString() : '—';

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${HEALTH_BORDER[overall]}`,
        background: HEALTH_BG[overall],
        padding: '10px 14px',
        marginTop: 12,
        marginBottom: 4,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 99,
            background: HEALTH_DOT[overall],
            boxShadow: `0 0 10px ${HEALTH_DOT[overall]}`,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: HEALTH_DOT[overall] }}>
          {loading ? 'CHECKING…' : err ? 'CHECK FAILED' : HEALTH_LABEL[overall]}
        </span>
        <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 'auto' }}>
          last checked {loading ? '…' : checkedAt}
        </span>
        {!loading && !err && (
          <button
            onClick={refresh}
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 6,
              border: '1px solid rgba(124,232,255,0.25)',
              background: 'rgba(0,0,0,0.2)',
              color: '#9fefff',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            ↻
          </button>
        )}
      </div>

      {/* Per-check cards */}
      {!loading && !err && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(checks).map(([name, check]) => (
            <HealthCheckCard key={name} name={name} check={check} />
          ))}
        </div>
      )}

      {err && (
        <div style={{ fontSize: 12, color: '#ff7aa8', marginTop: 4 }}>Health check error: {err}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OpsStrip — Prometheus / Grafana / freshness summary
// ─────────────────────────────────────────────────────────────────────────────

export function OpsStrip() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setErr(null);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, []);

  const ops = data?.ops ?? {};
  const prom = data?.prom ?? {};

  // Scrape freshness: age of state.json data
  const staleThreshSec = 120; // flag as stale if >2 min old
  const freshnessSec: number | null = ops.scrapeFreshnessSec;
  const isStale = freshnessSec != null && freshnessSec > staleThreshSec;

  // Last trade: how long ago
  const lastTradeAt: string | null = ops.lastTradeAt;
  const lastTradeSec: number | null = lastTradeAt
    ? (Date.now() - new Date(lastTradeAt).getTime()) / 1_000
    : null;

  return (
    <div style={{ marginTop: 14 }}>
      {/* ── Row 1: System health ─────────────────────────────────── */}
      <div style={{ fontSize: 10, letterSpacing: 2, opacity: 0.55, marginBottom: 6 }}>SYSTEM</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Pill
          label="ARMED"
          value={data?.armed ? 'yes' : 'no'}
          color={data?.armed ? 'green' : 'yellow'}
        />
        <Pill
          label="BOT"
          value={data?.botRunning ? 'up' : 'down'}
          color={data?.botRunning ? 'green' : 'red'}
        />
        <Pill
          label="MODE"
          value={ops.mode ?? '—'}
          color={ops.mode === 'live' ? 'green' : ops.mode === 'paper' ? 'yellow' : 'default'}
        />
        <Pill
          label="PROM"
          value={prom.prometheusUp == null ? '—' : prom.prometheusUp ? 'up' : 'down'}
          color={prom.prometheusUp == null ? 'default' : prom.prometheusUp ? 'green' : 'red'}
        />
        <Pill
          label="NODE-EXP"
          value={prom.nodeExporterUp == null ? '—' : prom.nodeExporterUp ? 'up' : 'down'}
          color={prom.nodeExporterUp == null ? 'default' : prom.nodeExporterUp ? 'green' : 'red'}
        />
        <Pill
          label="CADV"
          value={prom.cadvisorUp == null ? '—' : prom.cadvisorUp ? 'up' : 'down'}
          color={prom.cadvisorUp == null ? 'default' : prom.cadvisorUp ? 'green' : 'red'}
        />
        <Pill
          label="CPU"
          value={prom.cpuPct == null ? '—' : `${prom.cpuPct.toFixed(1)}%`}
          color={prom.cpuPct != null && prom.cpuPct > 85 ? 'red' : 'default'}
        />
        <Pill
          label="MEM"
          value={prom.memPct == null ? '—' : `${prom.memPct.toFixed(1)}%`}
          color={prom.memPct != null && prom.memPct > 85 ? 'red' : 'default'}
        />
        <Pill
          label="UPDATED"
          value={data?.ts ? new Date(data.ts).toLocaleTimeString() : '—'}
        />
      </div>

      {/* Trading ops section removed */}

      {err ? (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ff7aa8' }}>Status error: {err}</div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusStrip — kept for backwards-compat; now just wraps OpsStrip
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use OpsStrip directly */
export function StatusStrip() {
  return <OpsStrip />;
}

// ─────────────────────────────────────────────────────────────────────────────
// RecentActions — audit log viewer (last 20 entries)
// ─────────────────────────────────────────────────────────────────────────────

function actionResultColor(result?: string): string {
  if (!result) return 'rgba(124,232,255,0.18)';
  if (result === 'ok') return 'rgba(51,255,204,0.20)';
  if (result === 'error') return 'rgba(255,80,120,0.20)';
  if (result === 'blocked') return 'rgba(255,208,128,0.20)';
  return 'rgba(124,232,255,0.18)';
}

function actionResultTextColor(result?: string): string {
  if (!result) return '#d6f6ff';
  if (result === 'ok') return '#33ffcc';
  if (result === 'error') return '#ff7aa8';
  if (result === 'blocked') return '#ffd080';
  return '#d6f6ff';
}

export function RecentActions() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setErr(null);
    try {
      const res = await fetch('/api/actions?limit=20', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setItems(j.items || []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#9fefff', opacity: 0.9 }}>RECENT ACTIONS</div>
        <div style={{ fontSize: 10, opacity: 0.5 }}>last 20</div>
      </div>
      <div
        style={{
          borderRadius: 14,
          border: '1px solid rgba(124,232,255,0.16)',
          background: 'rgba(0,0,0,0.22)',
          padding: 10,
        }}
      >
        {err ? <div style={{ fontSize: 12, color: '#ff7aa8' }}>Audit error: {err}</div> : null}
        {!items.length ? <div style={{ fontSize: 12, opacity: 0.7 }}>No actions logged yet.</div> : null}
        {items.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              gap: 10,
              padding: '7px 0',
              borderBottom: idx === items.length - 1 ? 'none' : '1px solid rgba(124,232,255,0.08)',
            }}
          >
            {/* Timestamp */}
            <div
              style={{
                width: 82,
                flexShrink: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11,
                opacity: 0.65,
              }}
            >
              {it.ts ? new Date(it.ts).toLocaleTimeString() : '—'}
            </div>

            {/* Action + badges */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 12 }}>{it.action || it.raw || '—'}</span>

                {/* Result badge */}
                {it.result ? (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 999,
                      background: actionResultColor(it.result),
                      color: actionResultTextColor(it.result),
                      border: '1px solid rgba(124,232,255,0.18)',
                      fontWeight: 700,
                    }}
                  >
                    {it.result}
                  </span>
                ) : null}

                {/* Auth method badge */}
                {it.auth_method ? (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 999,
                      background: it.auth_method === 'hmac' ? 'rgba(51,255,204,0.12)' : 'rgba(124,232,255,0.10)',
                      color: it.auth_method === 'hmac' ? '#33ffcc' : '#7ce8ff',
                      border: '1px solid rgba(124,232,255,0.18)',
                    }}
                  >
                    {it.auth_method}
                  </span>
                ) : null}

                {/* Actor (if present) */}
                {it.actor && it.actor !== it.auth_method ? (
                  <span style={{ fontSize: 10, opacity: 0.5 }}>{it.actor}</span>
                ) : null}

                {/* IP */}
                {it.ip && it.ip !== 'unknown' ? (
                  <span
                    style={{
                      fontSize: 10,
                      opacity: 0.45,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    }}
                  >
                    {it.ip}
                  </span>
                ) : null}

                {/* Idempotency key (if present) */}
                {it.idempotency_key ? (
                  <span style={{ fontSize: 10, opacity: 0.4 }} title={`idempotency: ${it.idempotency_key}`}>
                    🔑
                  </span>
                ) : null}
              </div>

              {/* Detail */}
              {it.detail ? (
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.65,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 2,
                  }}
                >
                  {it.detail}
                </div>
              ) : null}

              {/* Error (inline) */}
              {it.error ? (
                <div
                  style={{
                    fontSize: 11,
                    color: '#ff7aa8',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 2,
                  }}
                >
                  ⚠ {it.error}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
