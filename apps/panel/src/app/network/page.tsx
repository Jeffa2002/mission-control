// @ts-nocheck
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppShell, SectionTitle, card } from '../../components/ops-ui';

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
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
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
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
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

  const fetchHistory = useCallback(async (node: string, range: HistoryRange) => {
    setLoading(true);
    // Don't clear data immediately — keep old data visible while loading
    try {
      const [pr, ir] = await Promise.all([
        fetch(`/api/network/history?node=${node}&range=${range}&metric=ping`),
        fetch(`/api/network/history?node=${node}&range=${range}&metric=iperf`),
      ]);
      if (pr.ok)  setPingData(await pr.json());
      if (ir.ok) setIperfData(await ir.json());
    } catch {}
    setLoading(false);
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
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
          📈 Network History
        </div>
        <div style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.1)' }} />
      </div>

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

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function NetworkPage() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');

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

  const totalNodes = data?.nodes.length ?? HISTORY_NODES.length;
  const onlineCount = data?.nodes.filter(n => n.status === 'online').length ?? 0;
  const avgLatency = data?.nodes.filter(n => n.latencyMs !== null).reduce((a, n, _, arr) =>
    a + (n.latencyMs! / arr.length), 0) ?? 0;

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#F1F5F9', letterSpacing: -0.5 }}>
              🌐 Network Operations Centre
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
              Tailscale mesh · {totalNodes} nodes · auto-refresh 15s
              {lastUpdated && <span style={{ color: '#64748B', marginLeft: 12 }}>last ping: {lastUpdated}</span>}{data?.stale && <span style={{ color: '#F59E0B', marginLeft: 8, fontSize: 11 }}>↻ refreshing…</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ padding: '8px 14px', borderRadius: 999, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', fontSize: 12, fontWeight: 700, color: '#10B981' }}>
              {onlineCount}/{totalNodes} ONLINE
            </div>
            <div style={{ padding: '8px 14px', borderRadius: 999, background: 'rgba(124,232,255,0.08)', border: '1px solid rgba(124,232,255,0.2)', fontSize: 12, fontWeight: 700, color: '#7ce8ff' }}>
              AVG {avgLatency ? `${avgLatency.toFixed(1)}ms` : '—'}
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

          {/* Topology canvas */}
          <div style={{ borderRadius: 14, border: '1px solid rgba(124,232,255,0.12)', background: '#090d1a', padding: 8, position: 'relative', minHeight: 380 }}>
            {/* Scanline overlay */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none',
              background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)',
              zIndex: 1,
            }} />
            {/* Grid dots */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
              <defs>
                <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <circle cx={15} cy={15} r={1} fill="rgba(124,232,255,0.08)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            <svg
              viewBox="0 0 600 340"
              style={{ width: '100%', height: '100%', minHeight: 340, position: 'relative', zIndex: 2 }}
            >
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Links */}
              {(data?.links || []).map(link => {
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

              {/* Nodes */}
              {(data?.nodes || []).map(node => (
                <NodeCircle key={node.id} node={node}
                  selected={selectedNode === node.id}
                  onClick={() => {
                    setSelectedNode(selectedNode === node.id ? null : node.id);
                    setSelectedLink(null);
                  }}
                />
              ))}

              {/* Legend */}
              {[
                { color: '#10B981', label: '< 20ms' },
                { color: '#F59E0B', label: '20–50ms' },
                { color: '#EF4444', label: '> 50ms' },
                { color: '#6B7280', label: 'offline' },
              ].map(({ color, label }, i) => (
                <g key={label} transform={`translate(${12 + i * 72}, 320)`}>
                  <line x1={0} y1={6} x2={16} y2={6} stroke={color} strokeWidth={2} />
                  <text x={20} y={10} fontSize={9} fill="#64748B">{label}</text>
                </g>
              ))}
            </svg>

            {loading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 14, background: 'rgba(9,13,26,0.8)', zIndex: 10,
              }}>
                <div style={{ fontSize: 13, color: '#475569' }}>Pinging nodes…</div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Detail panel — node or link */}
            {(selectedNodeData || selectedLinkData) && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(124,232,255,0.2)', background: '#0d1424', padding: 16 }}>
                {selectedNodeData && (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#F1F5F9', marginBottom: 10 }}>
                      {selectedNodeData.emoji} {selectedNodeData.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        ['IP',       selectedNodeData.ip],
                        ['Location', selectedNodeData.location],
                        ['Role',     selectedNodeData.role],
                        ['Latency',  fmtMs(selectedNodeData.latencyMs)],
                        ['Status',   selectedNodeData.status.toUpperCase()],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ color: '#64748B' }}>{k}</span>
                          <span style={{ color: k === 'Status' ? statusColor(selectedNodeData.status) : '#CBD5E1', fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {selectedNodeData?.iperf && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(124,232,255,0.06)', border: '1px solid rgba(124,232,255,0.15)' }}>
                        <div style={{ fontSize: 10, color: '#7ce8ff', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 700 }}>⚡ iperf3 Throughput</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[
                            ['↑ Send', `${selectedNodeData?.iperf?.mbpsSend ?? 0} Mbps`],
                            ['↓ Recv', `${selectedNodeData?.iperf?.mbpsRecv ?? 0} Mbps`],
                            ['RTT', `${selectedNodeData?.iperf?.rttMs ?? 0}ms`],
                            ['Retransmits', `${selectedNodeData?.iperf?.retransmits ?? 0}`],
                          ].map(([k, v]) => (
                            <div key={k} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
                              <div style={{ fontSize: 10, color: '#475569' }}>{k}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#7ce8ff', marginTop: 2 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 9, color: '#374151', marginTop: 6, textAlign: 'right' }}>
                          tested {selectedNodeData?.iperf?.measuredAt ? new Date(selectedNodeData?.iperf?.measuredAt).toLocaleString() : '—'}
                        </div>
                      </div>
                    )}
                    {selectedNodeData.history.length > 1 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Latency history</div>
                        <Sparkline data={selectedNodeData.history} color={latencyColor(selectedNodeData.latencyMs)} w={252} h={36} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 2 }}>
                          <span>min: {Math.min(...selectedNodeData.history).toFixed(1)}ms</span>
                          <span>max: {Math.max(...selectedNodeData.history).toFixed(1)}ms</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {selectedLinkData && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#F1F5F9', marginBottom: 10 }}>
                      🔗 {nodeMap[selectedLinkData.from]?.emoji} {nodeMap[selectedLinkData.from]?.label} → {nodeMap[selectedLinkData.to]?.emoji} {nodeMap[selectedLinkData.to]?.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#7ce8ff', marginBottom: 10, fontWeight: 600 }}>{selectedLinkData.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        ['Direction',   selectedLinkData.direction],
                        ['Latency',     fmtMs(selectedLinkData.latencyMs)],
                        ['Packet loss', `${selectedLinkData.packetLoss}%`],
                        ['Status',      selectedLinkData.active ? 'ACTIVE' : 'DOWN'],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ color: '#64748B' }}>{k}</span>
                          <span style={{ color: k === 'Status' ? (selectedLinkData.active ? '#10B981' : '#EF4444') : '#CBD5E1', fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                    {selectedLinkData?.iperf && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(124,232,255,0.06)', border: '1px solid rgba(124,232,255,0.15)' }}>
                        <div style={{ fontSize: 10, color: '#7ce8ff', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 700 }}>⚡ iperf3 Throughput</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[
                            ['↑ Send', `${selectedLinkData?.iperf?.mbpsSend ?? 0} Mbps`],
                            ['↓ Recv', `${selectedLinkData?.iperf?.mbpsRecv ?? 0} Mbps`],
                            ['RTT', `${selectedLinkData?.iperf?.rttMs ?? 0}ms`],
                            ['Retransmits', `${selectedLinkData?.iperf?.retransmits ?? 0}`],
                          ].map(([k, v]) => (
                            <div key={k} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
                              <div style={{ fontSize: 10, color: '#475569' }}>{k}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#7ce8ff', marginTop: 2 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
              </div>
            )}

            {/* Node list */}
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: '#0d1424', padding: 14 }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Node Status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(data?.nodes || []).map(node => (
                  <div key={node.id}
                    onClick={() => { setSelectedNode(selectedNode === node.id ? null : node.id); setSelectedLink(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      borderRadius: 10, cursor: 'pointer',
                      background: selectedNode === node.id ? 'rgba(124,232,255,0.07)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${selectedNode === node.id ? 'rgba(124,232,255,0.2)' : 'transparent'}`,
                      transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: 16 }}>{node.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9' }}>{node.label}</div>
                      <div style={{ fontSize: 10, color: '#475569' }}>{node.location} · {node.ip}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: latencyColor(node.latencyMs) }}>{fmtMs(node.latencyMs)}</div>
                      <div style={{ fontSize: 9, color: statusColor(node.status), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{node.status}</div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(node.status), flexShrink: 0,
                      boxShadow: node.status === 'online' ? `0 0 6px ${statusColor(node.status)}` : 'none' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Latency sparklines */}
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: '#0d1424', padding: 14 }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Latency Trends</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(data?.nodes || []).filter(n => n.history?.length > 0).map(node => (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, width: 20 }}>{node.emoji}</span>
                    <Sparkline data={node.history} color={latencyColor(node.latencyMs)} w={150} h={24} />
                    <span style={{ fontSize: 11, color: latencyColor(node.latencyMs), fontWeight: 700, minWidth: 40, textAlign: 'right' }}>
                      {fmtMs(node.latencyMs)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connections list */}
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: '#0d1424', padding: 14 }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Active Links</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(data?.links || []).map(link => {
                  const key = `${link.from}-${link.to}`;
                  return (
                    <div key={key}
                      onClick={() => { setSelectedLink(selectedLink === key ? null : key); setSelectedNode(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                        borderRadius: 8, cursor: 'pointer',
                        background: selectedLink === key ? 'rgba(124,232,255,0.07)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${selectedLink === key ? 'rgba(124,232,255,0.2)' : 'transparent'}`,
                      }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: link.active ? latencyColor(link.latencyMs) : '#374151', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {nodeMap[link.from]?.emoji} {nodeMap[link.from]?.label} → {nodeMap[link.to]?.emoji} {nodeMap[link.to]?.label}
                        </div>
                        <div style={{ fontSize: 9, color: '#475569' }}>{link.label}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: latencyColor(link.latencyMs) }}>{fmtMs(link.latencyMs)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* ── Network History ─────────────────────────────────────────── */}
        <NetworkHistorySection />

        <div style={{ fontSize: 11, color: '#374151', textAlign: 'right' }}>
          Pings measured from prod · Tailscale mesh · refreshes every 15s
          {data?.measuredAt && <span style={{ marginLeft: 8 }}>measured {new Date(data.measuredAt).toLocaleTimeString()}</span>}
        </div>
      </div>
    </AppShell>
  );
}
