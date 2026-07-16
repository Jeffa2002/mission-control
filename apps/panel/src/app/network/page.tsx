// @ts-nocheck
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppShell, SectionTitle, StatusBadge, card } from '../../components/ops-ui';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface NodeData {
  id: string; label: string; emoji: string; ip: string;
  location: string; role: string;
  latencyMs: number | null; status: 'online' | 'degraded' | 'offline';
  history: number[];
  iperf?: { mbpsSend: number; mbpsRecv: number; rttMs: number; retransmits: number; measuredAt: string } | null;
}
interface LinkData {
  from: string; to: string; label: string; direction: string;
  latencyMs: number | null; active: boolean; packetLoss: number;
}
interface NetworkData {
  nodes: NodeData[]; links: LinkData[]; measuredAt: string;
}

/* ─── History types ──────────────────────────────────────────────────── */
interface HistoryPoint { ts: string; value: number; recv?: number; rtt?: number; }
interface HistoryData { node: string; range: string; metric: string; points: HistoryPoint[]; }

/* ─── Node positions (SVG viewBox 0 0 600 340) ──────────────────────── */
const NODE_POS: Record<string, { x: number; y: number }> = {
  bazza:        { x: 300, y: 152 },
  sec1:         { x: 300, y: 34  },
  'secspy-lab01': { x: 132, y: 92 },
  prod:         { x: 472, y: 122 },
  crm8:         { x: 492, y: 248 },
  shazza:       { x: 120, y: 244 },
  'backup-melb':{ x: 300, y: 286 },
};

/* ─── History node / range config ───────────────────────────────────── */
const HISTORY_NODES = [
  { id: 'prod',        label: 'Prod' },
  { id: 'crm8',        label: 'CRM8' },
  { id: 'shazza',      label: 'Shazza' },
  { id: 'backup-melb', label: 'Backup Melb' },
  { id: 'bazza',       label: 'Bazza' },
  { id: 'sec1',        label: 'Sec1' },
  { id: 'secspy-lab01', label: 'SecSpy Lab' },
];
const HISTORY_RANGES = ['day', 'week', 'month', 'year'] as const;
type HistoryRange = typeof HISTORY_RANGES[number];

/* ─── Helpers ────────────────────────────────────────────────────────── */
function latencyColor(ms: number | null) {
  if (ms === null) return '#6B7280';
  if (ms < 20)  return '#10B981';
  if (ms < 50)  return '#F59E0B';
  return '#EF4444';
}
function statusColor(s: string) {
  if (s === 'online')   return '#10B981';
  if (s === 'degraded') return '#F59E0B';
  return '#EF4444';
}
function fmtMs(ms: number | null) { return ms === null ? '—' : `${ms.toFixed(1)}ms`; }

function formatTs(ts: string, range: HistoryRange): string {
  try {
    const d = new Date(ts);
    if (range === 'day')   return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === 'week')  return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === 'month') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    /* year */             return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  } catch { return ts.slice(0, 10); }
}

/* ─── Sparkline ──────────────────────────────────────────────────────── */
function Sparkline({ data, color = '#7ce8ff', w = 80, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data.length) return <svg width={w} height={h}><text x={4} y={h/2+4} fontSize={10} fill="#475569">no data</text></svg>;
  const min = Math.min(...data);
  const max = Math.max(...data) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * (w - 4) + 2;
    const y = h - 4 - ((v - min) / (max - min || 1)) * (h - 8);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {data.length > 0 && (() => {
        const last = data[data.length - 1];
        const lx = w - 2;
        const ly = h - 4 - ((last - min) / (max - min || 1)) * (h - 8);
        return <circle cx={lx} cy={ly} r={2.5} fill={color} />;
      })()}
    </svg>
  );
}

/* ─── Animated dash for SVG links ──────────────────────────────────── */
function AnimatedLink({ x1, y1, x2, y2, color, active, latencyMs, mbps, selected, onClick }: any) {
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
  // Offset labels perpendicular to line so they don't overlap
  const dx = x2 - x1, dy = y2 - y1;
  const nx = -dy / len, ny = dx / len;
  const off = 9;

  return (
    <g
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Inspect endpoint link, ${active ? 'both endpoints online' : 'reachability incomplete'}`}
      style={{ cursor: 'pointer' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
      {selected && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={8} strokeOpacity={0.12} />}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={selected ? 2.5 : 1.5}
        strokeOpacity={active ? 0.85 : 0.25}
        strokeDasharray={active ? 'none' : '4 4'}
      />
      {active && (
        <circle r={4} fill={color} fillOpacity={0.9}>
          <animateMotion dur={`${(len / 80).toFixed(1)}s`} repeatCount="indefinite"
            path={`M${x1},${y1} L${x2},${y2}`} />
        </circle>
      )}
      {/* Latency label — above line */}
      {latencyMs !== null && (
        <text
          x={mid.x + nx * off} y={mid.y + ny * off - 5}
          textAnchor="middle" fontSize={9} fill={color} fontWeight={700}
          style={{ pointerEvents: 'none' }}>
          {fmtMs(latencyMs)}
        </text>
      )}
      {/* Mbps label — below latency */}
      {mbps != null && mbps > 0 && (
        <text
          x={mid.x + nx * off} y={mid.y + ny * off + 6}
          textAnchor="middle" fontSize={8} fill={color} fontWeight={600} fillOpacity={0.75}
          style={{ pointerEvents: 'none' }}>
          {mbps >= 1000 ? `${(mbps/1000).toFixed(1)}Gbps` : `${mbps}Mbps`}
        </text>
      )}
    </g>
  );
}

/* ─── Node circle ────────────────────────────────────────────────────── */
function NodeCircle({ node, selected, onClick }: { node: NodeData; selected: boolean; onClick: () => void }) {
  const pos = NODE_POS[node.id];
  if (!pos) return null;
  const sc = statusColor(node.status);
  const r = 28;

  return (
    <g
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${node.label}, ${node.status}, ${fmtMs(node.latencyMs)}`}
      style={{ cursor: 'pointer' }}>
      {/* Glow */}
      <circle cx={pos.x} cy={pos.y} r={r + 10} fill={sc} fillOpacity={selected ? 0.15 : 0.07}>
        {node.status === 'online' && (
          <animate attributeName="r" values={`${r+8};${r+14};${r+8}`} dur="3s" repeatCount="indefinite" />
        )}
      </circle>
      {/* Ring */}
      <circle cx={pos.x} cy={pos.y} r={r} fill="#0b1020"
        stroke={selected ? '#7ce8ff' : sc} strokeWidth={selected ? 2 : 1.5} />
      {/* Emoji */}
      <text x={pos.x} y={pos.y - 4} textAnchor="middle" fontSize={16} dominantBaseline="middle">
        {node.emoji}
      </text>
      {/* Label */}
      <text x={pos.x} y={pos.y + 14} textAnchor="middle" fontSize={9}
        fill="#CBD5E1" fontWeight={700} letterSpacing={0.5}>
        {node.label.toUpperCase()}
      </text>
      {/* Status dot */}
      <circle cx={pos.x + r - 4} cy={pos.y - r + 4} r={5} fill={sc}
        stroke="#0b1020" strokeWidth={1.5} />
    </g>
  );
}

/* ─── SVG Line Chart ─────────────────────────────────────────────────── */
interface LineConfig { points: HistoryPoint[]; valueKey: 'value' | 'recv'; color: string; label: string; }

function SvgLineChart({ lines, range }: { lines: LineConfig[]; range: HistoryRange }) {
  const W = 560, H = 160;
  const PAD = { top: 14, right: 12, bottom: 38, left: 46 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Collect all values across all series
  const allVals = lines.flatMap(l =>
    l.points.map(p => (l.valueKey === 'recv' ? (p.recv ?? null) : p.value)).filter((v): v is number => v !== null && v !== undefined)
  );
  if (!allVals.length) return null;

  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.1 || 1;
  const minV = Math.max(0, rawMin - pad);
  const maxV = rawMax + pad;
  const rangeV = maxV - minV || 1;

  const basePoints = lines[0]?.points ?? [];
  const nPoints = basePoints.length;
  const toX = (i: number) => PAD.left + (i / Math.max(nPoints - 1, 1)) * plotW;
  const toY = (v: number) => PAD.top + plotH - ((v - minV) / rangeV) * plotH;

  // Grid lines (4 horizontal)
  const GRID_N = 4;
  const gridLines = Array.from({ length: GRID_N + 1 }, (_, gi) => {
    const v = minV + (gi / GRID_N) * rangeV;
    return { y: toY(v), v };
  });

  // X labels — at most 6 evenly spaced
  const xStep = Math.max(1, Math.floor(nPoints / 5));
  const xLabels = basePoints
    .map((p, i) => ({ i, ts: p.ts }))
    .filter((_, i, arr) => i % xStep === 0 || i === arr.length - 1)
    .slice(0, 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* Subtle grid */}
      {gridLines.map(({ y, v }, gi) => (
        <g key={gi}>
          <line
            x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke="rgba(148,163,184,0.1)" strokeWidth={0.75}
          />
          <text x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-3)">
            {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v < 10 ? v.toFixed(1) : Math.round(v)}
          </text>
        </g>
      ))}

      {/* X-axis baseline */}
      <line
        x1={PAD.left} y1={PAD.top + plotH}
        x2={W - PAD.right} y2={PAD.top + plotH}
        stroke="rgba(148,163,184,0.2)" strokeWidth={1}
      />

      {/* X labels */}
      {xLabels.map(({ i, ts }) => (
        <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-3)">
          {formatTs(ts, range)}
        </text>
      ))}

      {/* Data lines */}
      {lines.map((line, li) => {
        const pathParts: string[] = [];
        line.points.forEach((p, i) => {
          const raw = line.valueKey === 'recv' ? (p.recv ?? null) : p.value;
          if (raw === null || raw === undefined) return;
          const cmd = pathParts.length === 0 ? 'M' : 'L';
          pathParts.push(`${cmd}${toX(i).toFixed(1)} ${toY(raw).toFixed(1)}`);
        });
        if (!pathParts.length) return null;
        return (
          <path
            key={li}
            d={pathParts.join(' ')}
            fill="none"
            stroke={line.color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {/* Terminal dots */}
      {lines.map((line, li) => {
        const last = line.points[line.points.length - 1];
        if (!last) return null;
        const raw = line.valueKey === 'recv' ? (last.recv ?? null) : last.value;
        if (raw === null || raw === undefined) return null;
        return (
          <circle key={li}
            cx={toX(line.points.length - 1)} cy={toY(raw)} r={3}
            fill={line.color} stroke="var(--bg-1)" strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
}

/* ─── History Chart Panel ────────────────────────────────────────────── */
function HistoryChartPanel({
  title, lines, loading, range,
}: {
  title: string;
  lines: LineConfig[];
  loading: boolean;
  range: HistoryRange;
}) {
  const hasData = lines.some(l => l.points.length > 0);

  return (
    <div style={{
      flex: '1 1 340px', borderRadius: 14,
      border: '1px solid rgba(148,163,184,0.1)',
      background: 'var(--bg-1)',
      padding: '14px 16px',
      minWidth: 0,
      position: 'relative',
    }}>
      {/* Title + legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {lines.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 2, background: l.color, borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Loading spinner overlay - shown over existing data while refreshing */}
      {loading && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--text-3)', fontSize: 11,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ animation: 'spin 0.8s linear infinite' }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          Loading…
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && (
        <div style={{
          height: 130,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-3)', fontSize: 12,
          borderRadius: 8,
          border: '1px dashed rgba(148,163,184,0.12)',
        }}>
          No data available
        </div>
      )}

      {/* Chart */}
      {!loading && hasData && (
        <SvgLineChart lines={lines} range={range} />
      )}
    </div>
  );
}

/* ─── Network History Section ────────────────────────────────────────── */
function NetworkHistorySection() {
  const [activeNode, setActiveNode] = useState<string>('prod');
  const [activeRange, setActiveRange] = useState<HistoryRange>('day');
  const [pingData, setPingData]   = useState<HistoryData | null>(null);
  const [iperfData, setIperfData] = useState<HistoryData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchHistory = useCallback(async (node: string, range: HistoryRange) => {
    setLoading(true);
    setError(null);
    setPingData(null);
    setIperfData(null);
    try {
      const [pr, ir] = await Promise.all([
        fetch(`/api/network/history?node=${node}&range=${range}&metric=ping`),
        fetch(`/api/network/history?node=${node}&range=${range}&metric=iperf`),
      ]);
      if (!pr.ok || !ir.ok) throw new Error(`History request failed (${pr.status}/${ir.status})`);
      const [ping, iperf] = await Promise.all([pr.json(), ir.json()]);
      if (ping.node !== node || ping.range !== range || iperf.node !== node || iperf.range !== range) {
        throw new Error('History response did not match the selected node and range');
      }
      setPingData(ping);
      setIperfData(iperf);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(activeNode, activeRange); }, [activeNode, activeRange, fetchHistory]);

  const pingLines: LineConfig[] = [{
    points: pingData?.points ?? [],
    valueKey: 'value',
    color: 'var(--sev-warning)',
    label: 'RTT',
  }];

  const iperfLines: LineConfig[] = [
    { points: iperfData?.points ?? [], valueKey: 'value', color: 'var(--accent)',      label: '↑ Send' },
    { points: iperfData?.points ?? [], valueKey: 'recv',  color: 'var(--sev-healthy)', label: '↓ Recv' },
  ];

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: 999,
    border: active
      ? '1px solid rgba(103,213,255,0.4)'
      : '1px solid rgba(148,163,184,0.12)',
    background: active ? 'rgba(103,213,255,0.1)' : 'rgba(255,255,255,0.03)',
    color: active ? 'var(--accent)' : 'var(--text-3)',
    fontSize: 11,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    userSelect: 'none',
    outline: 'none',
    lineHeight: '1',
  });

  const rangeLabel: Record<HistoryRange, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', letterSpacing: 0, whiteSpace: 'nowrap' }}>
          📈 Network History
        </div>
        <div style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.1)' }} />
      </div>

      {error && <div role="status" style={{ color: 'var(--sev-critical)', fontSize: 12 }}>History unavailable: {error}</div>}

      {/* Controls row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
        {/* Node tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {HISTORY_NODES.map(n => (
            <button key={n.id} style={tabStyle(activeNode === n.id)} onClick={() => setActiveNode(n.id)}>
              {n.label}
            </button>
          ))}
        </div>
        {/* Range pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {HISTORY_RANGES.map(r => (
            <button key={r} style={tabStyle(activeRange === r)} onClick={() => setActiveRange(r)}>
              {rangeLabel[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Chart panels — side by side, stack on narrow */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <HistoryChartPanel
          title="Ping Latency (ms)"
          lines={pingLines}
          loading={loading}
          range={activeRange}
        />
        <HistoryChartPanel
          title="Throughput (Mbps)"
          lines={iperfLines}
          loading={loading}
          range={activeRange}
        />
      </div>
    </div>
  );
}

/* ─── Command centre helpers ─────────────────────────────────────────── */
function fmtMbps(v?: number | null) {
  if (v == null || Number.isNaN(v)) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}Gbps` : `${Math.round(v)}Mbps`;
}

function routeQuality(link: LinkData) {
  if (!link.active) return { label: 'Down', status: 'critical', score: 0, color: '#EF4444' };
  if ((link.packetLoss ?? 0) > 0 || (link.latencyMs ?? 999) > 50) return { label: 'Poor', status: 'critical', score: 42, color: '#EF4444' };
  if ((link.latencyMs ?? 999) > 20 || (link.iperf?.retransmits ?? 0) > 0) return { label: 'Watch', status: 'warning', score: 76, color: '#F59E0B' };
  return { label: 'Excellent', status: 'healthy', score: 98, color: '#22C55E' };
}

function StatTile({ label, value, hint, tone = 'info' }: { label: string; value: string; hint: string; tone?: 'healthy' | 'warning' | 'critical' | 'info' }) {
  const color = tone === 'healthy' ? '#22C55E' : tone === 'warning' ? '#F59E0B' : tone === 'critical' ? '#EF4444' : '#67D5FF';
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', minHeight: 96, padding: '14px 16px', borderRadius: 14,
      border: `1px solid ${color}33`,
      background: `linear-gradient(145deg, ${color}14, rgba(10,16,31,0.86) 48%, rgba(255,255,255,0.035))`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px rgba(0,0,0,0.22)`,
    }}>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 1, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.65 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 10, color: '#8B96AA', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800 }}>{label}</div>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: color, boxShadow: `0 0 18px ${color}` }} />
      </div>
      <div style={{ marginTop: 10, fontSize: 26, lineHeight: 1, fontWeight: 900, color: '#F3F7FF', letterSpacing: 0 }}>{value}</div>
      <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.35, color: '#8B96AA' }}>{hint}</div>
    </div>
  );
}

function PanelTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 10, color: '#67D5FF', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 900 }}>{eyebrow}</div>
        <div style={{ marginTop: 3, fontSize: 15, color: '#F3F7FF', fontWeight: 900, letterSpacing: 0 }}>{title}</div>
      </div>
      {action}
    </div>
  );
}

function GlassPanel({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      borderRadius: 14,
      border: '1px solid rgba(103,213,255,0.16)',
      background: 'linear-gradient(145deg, rgba(15,23,42,0.82), rgba(7,12,24,0.92))',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.055), 0 18px 46px rgba(0,0,0,0.26)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function DetailRow({ k, v, color }: { k: string; v: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
      <span style={{ color: '#64748B' }}>{k}</span>
      <span style={{ color: color ?? '#CBD5E1', fontWeight: 700, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function InspectorCard({ selectedNodeData, selectedLinkData, nodeMap, totals, stateTitle }: any) {
  return (
    <GlassPanel style={{ padding: 16 }}>
      {!selectedNodeData && !selectedLinkData && (
        <>
          <PanelTitle eyebrow="Network Brief" title={stateTitle} action={<StatusBadge label="AI brief" status="info" />} />
          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#94A3B8' }}>
            Tailnet telemetry is live. Select a node or route to lock the inspector and trace role, address, current RTT, iperf throughput, retransmits, and packet loss.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            {[
              ['Reachable', `${totals.online}/${totals.total}`],
              ['Routes', String(totals.links)],
              ['Packet loss', `${totals.loss}%`],
              ['Best link', totals.bestLink],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '10px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.075)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748B' }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#67D5FF', marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedNodeData && (
        <>
          <PanelTitle eyebrow="Node Inspector" title={`${selectedNodeData.emoji} ${selectedNodeData.label}`} action={<StatusBadge label={selectedNodeData.status} status={selectedNodeData.status === 'online' ? 'healthy' : selectedNodeData.status === 'degraded' ? 'warning' : 'critical'} />} />
          <DetailRow k="IP" v={selectedNodeData.ip} />
          <DetailRow k="Location" v={selectedNodeData.location} />
          <DetailRow k="Role" v={selectedNodeData.role} />
          <DetailRow k="Latency" v={fmtMs(selectedNodeData.latencyMs)} color={latencyColor(selectedNodeData.latencyMs)} />
          <DetailRow k="Last seen" v={selectedNodeData.latencyMs === null ? 'unreachable' : 'current scan'} color={selectedNodeData.latencyMs === null ? '#EF4444' : '#22C55E'} />

          {selectedNodeData?.iperf && (
            <div style={{ marginTop: 12, padding: '11px 12px', borderRadius: 11, background: 'rgba(103,213,255,0.07)', border: '1px solid rgba(103,213,255,0.16)' }}>
              <div style={{ fontSize: 10, color: '#67D5FF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 9, fontWeight: 900 }}>iperf3 stream</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Send', fmtMbps(selectedNodeData.iperf.mbpsSend)],
                  ['Recv', fmtMbps(selectedNodeData.iperf.mbpsRecv)],
                  ['RTT', `${selectedNodeData.iperf.rttMs ?? 0}ms`],
                  ['Retransmits', `${selectedNodeData.iperf.retransmits ?? 0}`],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '7px 6px', borderRadius: 8, background: 'rgba(0,0,0,0.22)', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748B' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#F3F7FF', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedNodeData.history.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800 }}>Latency trace</div>
              <Sparkline data={selectedNodeData.history} color={latencyColor(selectedNodeData.latencyMs)} w={252} h={38} />
            </div>
          )}
        </>
      )}

      {selectedLinkData && (
        <>
          {(() => {
            const quality = routeQuality(selectedLinkData);
            return (
              <>
                <PanelTitle
                  eyebrow="Route Inspector"
                  title={`${nodeMap[selectedLinkData.from]?.label} → ${nodeMap[selectedLinkData.to]?.label}`}
                  action={<StatusBadge label={quality.label} status={quality.status as any} />}
                />
                <div style={{ fontSize: 11, color: '#67D5FF', marginBottom: 10, fontWeight: 800 }}>{selectedLinkData.label}</div>
                <DetailRow k="Direction" v={selectedLinkData.direction} />
                <DetailRow k="Latency" v={fmtMs(selectedLinkData.latencyMs)} color={latencyColor(selectedLinkData.latencyMs)} />
                <DetailRow k="Packet loss" v={`${selectedLinkData.packetLoss}%`} color={selectedLinkData.packetLoss > 0 ? '#EF4444' : '#22C55E'} />
                <DetailRow k="Quality score" v={`${quality.score}/100`} color={quality.color} />
                <DetailRow k="Status" v={selectedLinkData.active ? 'ACTIVE' : 'DOWN'} color={selectedLinkData.active ? '#22C55E' : '#EF4444'} />

                {selectedLinkData?.iperf && (
                  <div style={{ marginTop: 12, padding: '11px 12px', borderRadius: 11, background: 'rgba(103,213,255,0.07)', border: '1px solid rgba(103,213,255,0.16)' }}>
                    <div style={{ fontSize: 10, color: '#67D5FF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 9, fontWeight: 900 }}>route throughput</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        ['Send', fmtMbps(selectedLinkData.iperf.mbpsSend)],
                        ['Recv', fmtMbps(selectedLinkData.iperf.mbpsRecv)],
                        ['RTT', `${selectedLinkData.iperf.rttMs ?? 0}ms`],
                        ['Retransmits', `${selectedLinkData.iperf.retransmits ?? 0}`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ padding: '7px 6px', borderRadius: 8, background: 'rgba(0,0,0,0.22)', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: '#64748B' }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: '#F3F7FF', marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}
    </GlassPanel>
  );
}

function NodeStatusList({ nodes, selectedNode, setSelectedNode, setSelectedLink }: any) {
  return (
    <GlassPanel style={{ padding: 14 }}>
      <PanelTitle eyebrow="Tailnet Nodes" title="Fleet reachability" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(nodes || []).map((node: NodeData) => (
          <button type="button" key={node.id}
            onClick={() => { setSelectedNode(selectedNode === node.id ? null : node.id); setSelectedLink(null); }}
            style={{
              width: '100%', color: 'inherit', textAlign: 'left',
              display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 9, padding: '9px 10px',
              borderRadius: 11, cursor: 'pointer',
              background: selectedNode === node.id ? 'rgba(103,213,255,0.10)' : 'rgba(255,255,255,0.025)',
              border: `1px solid ${selectedNode === node.id ? 'rgba(103,213,255,0.28)' : 'rgba(255,255,255,0.045)'}`,
              transition: 'all 0.15s',
            }}>
            <span style={{ fontSize: 16 }}>{node.emoji}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#F3F7FF' }}>{node.label}</div>
              <div style={{ fontSize: 10, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.role} · {node.ip}</div>
            </div>
            <Sparkline data={node.history ?? []} color={latencyColor(node.latencyMs)} w={54} h={20} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: latencyColor(node.latencyMs) }}>{fmtMs(node.latencyMs)}</div>
              <div style={{ fontSize: 9, color: statusColor(node.status), textTransform: 'uppercase', letterSpacing: '0.07em' }}>{node.status}</div>
            </div>
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}

function EventStrip({ nodes, links, measuredAt }: { nodes: NodeData[]; links: LinkData[]; measuredAt?: string }) {
  const events = [
    ...nodes
      .filter(n => n.status !== 'online')
      .map(n => ({ tone: n.status === 'degraded' ? '#F59E0B' : '#EF4444', title: `${n.label} ${n.status}`, body: n.latencyMs === null ? 'No ping response from latest scan.' : `RTT is ${fmtMs(n.latencyMs)}.` })),
    ...links
      .filter(l => !l.active || l.packetLoss > 0 || (l.latencyMs ?? 0) > 50)
      .map(l => ({ tone: !l.active ? '#EF4444' : '#F59E0B', title: `${l.from} → ${l.to}`, body: !l.active ? 'One or both endpoints did not respond.' : `Average endpoint RTT is ${fmtMs(l.latencyMs)}; this is not a route measurement.` })),
  ].slice(0, 5);

  const visibleEvents = events.length ? events : [
    { tone: '#22C55E', title: 'Tailnet healthy', body: 'All observed nodes responded in the latest scan.' },
    { tone: '#67D5FF', title: 'Telemetry loop active', body: measuredAt ? `Snapshot received ${new Date(measuredAt).toLocaleTimeString()}.` : 'Waiting for first live snapshot.' },
  ];

  return (
    <GlassPanel style={{ padding: 16 }}>
      <PanelTitle eyebrow="Incident Strip" title="What changed / what matters" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {visibleEvents.map((e, i) => (
          <div key={`${e.title}-${i}`} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, padding: 11, borderRadius: 11, border: `1px solid ${e.tone}25`, background: `linear-gradient(145deg, ${e.tone}12, rgba(255,255,255,0.025))` }}>
            <div style={{ width: 8, height: 8, marginTop: 4, borderRadius: 99, background: e.tone, boxShadow: `0 0 16px ${e.tone}` }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#F3F7FF' }}>{e.title}</div>
              <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.35, color: '#8B96AA' }}>{e.body}</div>
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function LayerPanel({ view, nodes, links, nodeMap, measuredAt, setSelectedNode, setSelectedLink }: any) {
  if (view === 'Services') {
    const groups = [
      { title: 'Prod edge', subtitle: 'public nginx + app upstreams', items: ['Mission Control', 'EffectX apps', 'Hearth preview'] },
      { title: 'Telemetry', subtitle: 'OpenClaw + security collectors', items: ['Bazza', 'Sec1', 'agent sync'] },
      { title: 'Continuity', subtitle: 'backup and recovery routes', items: ['Backup Melb', 'DB backup paths', 'workspace backups'] },
    ];
    return (
      <GlassPanel style={{ padding: 16 }}>
        <PanelTitle eyebrow="Service Layer" title="Host responsibilities" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {groups.map(g => (
            <div key={g.title} style={{ padding: 12, borderRadius: 12, border: '1px solid rgba(103,213,255,0.14)', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#F3F7FF' }}>{g.title}</div>
              <div style={{ marginTop: 3, fontSize: 11, color: '#64748B' }}>{g.subtitle}</div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.items.map(item => <span key={item} style={{ padding: '4px 7px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)', color: '#94A3B8', fontSize: 10, fontWeight: 800 }}>{item}</span>)}
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>
    );
  }

  if (view === 'Exposure') {
    return (
      <GlassPanel style={{ padding: 16 }}>
        <PanelTitle eyebrow="Exposure Layer" title="External, tailnet, and backup zones" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {[
            ['Public HTTPS edge', 'prod / per-web', '#F59E0B', 'Cloudflare + nginx routes'],
            ['Tailnet control', `${nodes.length || '—'} observed hosts`, '#67D5FF', 'private admin and telemetry'],
            ['Backup plane', 'backup-melb', '#22C55E', 'recovery and replication paths'],
            ['Unknown devices', '0 observed', '#94A3B8', 'no unknowns in current source'],
          ].map(([k, v, color, hint]) => (
            <div key={k} style={{ padding: 12, borderRadius: 12, border: `1px solid ${color}26`, background: `${color}10` }}>
              <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 900 }}>{k}</div>
              <div style={{ marginTop: 5, fontSize: 14, color, fontWeight: 900 }}>{v}</div>
              <div style={{ marginTop: 4, fontSize: 11, color: '#8B96AA' }}>{hint}</div>
            </div>
          ))}
        </div>
      </GlassPanel>
    );
  }

  if (view === 'Timeline') {
    return <EventStrip nodes={nodes} links={links} measuredAt={measuredAt} />;
  }

  return (
    <GlassPanel style={{ padding: 16 }}>
      <PanelTitle eyebrow="Endpoint Reachability" title="Derived link indicators" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {(links || []).slice(0, 6).map((link: LinkData) => {
          const key = `${link.from}-${link.to}`;
          const quality = routeQuality(link);
          return (
            <button type="button" key={key} onClick={() => { setSelectedLink(key); setSelectedNode(null); }} style={{ width: '100%', padding: 11, borderRadius: 12, cursor: 'pointer', textAlign: 'left', color: 'inherit', border: `1px solid ${quality.color}26`, background: `linear-gradient(145deg, ${quality.color}10, rgba(255,255,255,0.025))` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#F3F7FF', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nodeMap[link.from]?.label ?? link.from} → {nodeMap[link.to]?.label ?? link.to}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, color: '#64748B' }}>{link.label}</div>
                </div>
                <div style={{ fontSize: 11, color: quality.color, fontWeight: 900 }}>{quality.label}</div>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[
                  ['Avg endpoint RTT', fmtMs(link.latencyMs)],
                  ['Reachability', link.active ? 'both online' : 'incomplete'],
                  ['Flow', fmtMbps(link.iperf?.mbpsSend)],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '6px 4px', borderRadius: 8, background: 'rgba(0,0,0,0.18)', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#64748B' }}>{k}</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: '#CBD5E1', fontWeight: 850 }}>{v}</div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </GlassPanel>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function NetworkPage() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [view, setView] = useState<'Topology' | 'Services' | 'Exposure' | 'Timeline'>('Topology');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/network?ts=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setData(d);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, [load]);

  const nodeMap = Object.fromEntries((data?.nodes || []).map(n => [n.id, n]));
  const selectedNodeData = selectedNode ? nodeMap[selectedNode] : null;
  const selectedLinkData = selectedLink
    ? data?.links.find(l => `${l.from}-${l.to}` === selectedLink)
    : null;

  const nodes = data?.nodes ?? [];
  const links = data?.links ?? [];
  const totalNodes = data?.nodes.length ?? (loading ? 0 : HISTORY_NODES.length);
  const onlineCount = nodes.filter(n => n.status === 'online').length;
  const degradedCount = nodes.filter(n => n.status === 'degraded').length;
  const offlineCount = nodes.filter(n => n.status === 'offline').length;
  const activeLinks = links.filter(l => l.active).length;
  const lossPct = links.length ? Math.round(links.reduce((a, l) => a + (l.packetLoss ?? 0), 0) / links.length) : 0;
  const avgLatency = nodes.filter(n => n.latencyMs !== null).reduce((a, n, _, arr) =>
    a + (n.latencyMs! / arr.length), 0) ?? 0;
  const bestThroughput = Math.max(0, ...nodes.map(n => Math.max(n.iperf?.mbpsSend ?? 0, n.iperf?.mbpsRecv ?? 0)));
  const bestLink = links
    .filter(l => l.active && l.latencyMs !== null)
    .sort((a, b) => (a.latencyMs ?? 999) - (b.latencyMs ?? 999))[0];
  const networkTone = offlineCount ? 'critical' : degradedCount || lossPct ? 'warning' : onlineCount === totalNodes && totalNodes > 0 ? 'healthy' : 'info';
  const networkState = networkTone === 'healthy' ? 'Operational' : networkTone === 'warning' ? 'Degraded' : networkTone === 'critical' ? 'Attention required' : 'Scanning';

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{
          position: 'relative', overflow: 'hidden', padding: 18, borderRadius: 18,
          border: '1px solid rgba(103,213,255,0.18)',
          background: 'radial-gradient(circle at 15% 20%, rgba(103,213,255,0.16), transparent 28%), radial-gradient(circle at 86% 12%, rgba(124,140,255,0.16), transparent 30%), linear-gradient(145deg, rgba(13,20,36,0.95), rgba(5,9,18,0.98))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 22px 60px rgba(0,0,0,0.26)',
        }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.18, backgroundImage: 'linear-gradient(rgba(103,213,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(103,213,255,0.14) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'start' }}>
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
                <div style={{ fontSize: 22, fontWeight: 950, color: '#F3F7FF', letterSpacing: 0 }}>Network Operations Centre</div>
                <StatusBadge label={networkState} status={networkTone as any} pulse={loading || Boolean(data?.stale)} />
              </div>
              <div style={{ marginTop: 5, fontSize: 12, color: '#8B96AA' }}>
                Tailscale mesh · prod-origin ping telemetry · refresh 15s
                {lastUpdated && <span style={{ color: '#64748B', marginLeft: 12 }}>last scan {lastUpdated}</span>}
                {data?.stale && <span style={{ color: '#F59E0B', marginLeft: 8, fontSize: 11 }}>refreshing cache</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              {(['Topology', 'Services', 'Exposure', 'Timeline'] as const).map(label => (
                <button key={label} onClick={() => setView(label)} type="button" style={{
                  minHeight: 30, padding: '6px 11px', borderRadius: 999,
                  border: view === label ? '1px solid rgba(103,213,255,0.46)' : '1px solid rgba(255,255,255,0.10)',
                  background: view === label ? 'rgba(103,213,255,0.12)' : 'rgba(255,255,255,0.035)',
                  color: view === label ? '#67D5FF' : '#94A3B8',
                  fontSize: 11, fontWeight: 850, cursor: 'pointer',
                }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="mc-network-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <StatTile label="Reachability" value={`${onlineCount}/${totalNodes || '—'}`} hint={`${degradedCount} degraded · ${offlineCount} offline`} tone={networkTone as any} />
          <StatTile label="Route Quality" value={`${activeLinks}/${links.length || '—'}`} hint={`${lossPct}% average packet loss`} tone={lossPct ? 'critical' : activeLinks === links.length && links.length ? 'healthy' : 'warning'} />
          <StatTile label="Avg RTT" value={avgLatency ? `${avgLatency.toFixed(1)}ms` : '—'} hint="live ping average across reachable hosts" tone={avgLatency > 50 ? 'critical' : avgLatency > 20 ? 'warning' : 'healthy'} />
          <StatTile label="Throughput" value={fmtMbps(bestThroughput)} hint="best recent iperf stream observed" tone="info" />
        </div>

        <div className="mc-network-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div className="mc-network-canvas" style={{
              borderRadius: 18,
              border: '1px solid rgba(103,213,255,0.18)',
              background: 'radial-gradient(circle at 50% 45%, rgba(103,213,255,0.10), transparent 35%), linear-gradient(145deg, #070b16, #0B1020)',
              padding: 10,
              position: 'relative',
              minHeight: 420,
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 22px 56px rgba(0,0,0,0.30)',
            }}>
              <div style={{ position: 'absolute', left: 14, top: 12, zIndex: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  ['Zone', 'Tailnet'],
                  ['Origin', 'prod'],
                  ['Flow', `${activeLinks} active`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 9px', borderRadius: 999, border: '1px solid rgba(103,213,255,0.16)', background: 'rgba(4,8,18,0.72)', backdropFilter: 'blur(8px)' }}>
                    <span style={{ fontSize: 9, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 900 }}>{k}</span>
                    <span style={{ fontSize: 10, color: '#CBD5E1', fontWeight: 850 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.025) 3px, rgba(255,255,255,0.025) 4px)',
                zIndex: 1,
              }} />
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
                <defs>
                  <pattern id="network-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                    <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(103,213,255,0.055)" strokeWidth="1" />
                    <circle cx={14} cy={14} r={1} fill="rgba(103,213,255,0.12)" />
                  </pattern>
                  <radialGradient id="network-radar">
                    <stop offset="0%" stopColor="rgba(103,213,255,0.20)" />
                    <stop offset="70%" stopColor="rgba(103,213,255,0.04)" />
                    <stop offset="100%" stopColor="rgba(103,213,255,0)" />
                  </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#network-grid)" />
                <circle cx="50%" cy="50%" r="34%" fill="url(#network-radar)" />
              </svg>

              <svg viewBox="0 0 600 340" style={{ width: '100%', height: '100%', minHeight: 386, position: 'relative', zIndex: 2 }}>
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <circle cx="300" cy="152" r="124" fill="none" stroke="rgba(103,213,255,0.10)" strokeWidth="1" strokeDasharray="2 8" />
                <circle cx="300" cy="152" r="204" fill="none" stroke="rgba(103,213,255,0.07)" strokeWidth="1" strokeDasharray="2 10" />

                {(links || []).map(link => {
                  const fromPos = NODE_POS[link.from];
                  const toPos = NODE_POS[link.to];
                  if (!fromPos || !toPos) return null;
                  const key = `${link.from}-${link.to}`;
                  return (
                    <AnimatedLink key={key}
                      x1={fromPos.x} y1={fromPos.y}
                      x2={toPos.x} y2={toPos.y}
                      color={latencyColor(link.latencyMs)}
                      active={link.active}
                      latencyMs={link.latencyMs}
                      mbps={link.iperf?.mbpsSend ?? null}
                      selected={selectedLink === key}
                      onClick={() => {
                        setSelectedLink(selectedLink === key ? null : key);
                        setSelectedNode(null);
                      }}
                    />
                  );
                })}

                {(nodes || []).map(node => (
                  <NodeCircle key={node.id} node={node}
                    selected={selectedNode === node.id}
                    onClick={() => {
                      setSelectedNode(selectedNode === node.id ? null : node.id);
                      setSelectedLink(null);
                    }}
                  />
                ))}

                {[
                  { color: '#22C55E', label: 'excellent' },
                  { color: '#F59E0B', label: 'watch' },
                  { color: '#EF4444', label: 'poor/down' },
                  { color: '#6B7280', label: 'offline' },
                ].map(({ color, label }, i) => (
                  <g key={label} transform={`translate(${12 + i * 82}, 320)`}>
                    <line x1={0} y1={6} x2={16} y2={6} stroke={color} strokeWidth={2} />
                    <text x={20} y={10} fontSize={9} fill="#64748B">{label}</text>
                  </g>
                ))}
              </svg>

              {loading && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 18, background: 'rgba(7,11,22,0.82)', backdropFilter: 'blur(8px)', zIndex: 10,
                }}>
                  <div style={{ color: '#67D5FF', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>scanning mesh</div>
                </div>
              )}
            </div>

            <LayerPanel view={view} nodes={nodes} links={links} nodeMap={nodeMap} measuredAt={data?.measuredAt} setSelectedNode={setSelectedNode} setSelectedLink={setSelectedLink} />
            {view !== 'Timeline' && <EventStrip nodes={nodes} links={links} measuredAt={data?.measuredAt} />}
          </div>

          <div className="mc-network-rail" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InspectorCard
              selectedNodeData={selectedNodeData}
              selectedLinkData={selectedLinkData}
              nodeMap={nodeMap}
              totals={{ online: onlineCount, total: totalNodes, links: links.length, loss: lossPct, bestLink: bestLink ? `${bestLink.from}→${bestLink.to}` : '—' }}
              stateTitle={networkTone === 'healthy' ? 'Mesh operating normally' : networkState}
            />
            <NodeStatusList nodes={nodes} selectedNode={selectedNode} setSelectedNode={setSelectedNode} setSelectedLink={setSelectedLink} />
            <GlassPanel style={{ padding: 14 }}>
              <PanelTitle eyebrow="Exposure" title="Reachability zones" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Public edge', 'prod', '#F59E0B'],
                  ['Tailnet', `${totalNodes} hosts`, '#67D5FF'],
                  ['Backups', 'Melbourne', '#22C55E'],
                  ['Unknown', '0 seen', '#94A3B8'],
                ].map(([k, v, color]) => (
                  <div key={k} style={{ padding: 10, borderRadius: 10, border: `1px solid ${color}26`, background: `${color}10` }}>
                    <div style={{ fontSize: 10, color: '#64748B' }}>{k}</div>
                    <div style={{ marginTop: 3, fontSize: 12, color, fontWeight: 900 }}>{v}</div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>

        <NetworkHistorySection />

        <div style={{ fontSize: 11, color: '#475569', textAlign: 'right' }}>
          Pings measured from prod · Tailscale mesh · refreshes every 15s
          {data?.measuredAt && <span style={{ marginLeft: 8 }}>snapshot {new Date(data.measuredAt).toLocaleTimeString()}</span>}
        </div>
      </div>
    </AppShell>
  );
}
