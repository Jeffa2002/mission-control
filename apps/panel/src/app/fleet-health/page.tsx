'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, muted } from '../../components/ops-ui';

type MonitorState = 'ok' | 'degraded' | 'down' | string;
type UiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

interface MonitorStatus {
  ts?: string;
  state?: MonitorState;
  incident_since?: string;
  failing_targets?: string;
  targets_total?: number;
}

interface TargetSummary {
  ts: string;
  target: string;
  url: string;
  ok: boolean;
  http_code: string;
  latency_ms: number;
  reason: string;
  consecutive_failures: number;
  probes_24h: number;
  ok_24h: number;
  uptime_24h: number | null;
  p95_24h: number | null;
}

interface ProbeSet {
  available: boolean;
  status: MonitorStatus | null;
  targets: TargetSummary[];
  probe_count: number;
}

interface FleetHealthData {
  generated_at: string;
  window_hours: number;
  fleet: ProbeSet;
  timepulse: ProbeSet;
}

function stateStatus(state?: MonitorState): UiStatus {
  if (state === 'ok') return 'healthy';
  if (state === 'degraded') return 'warning';
  if (state === 'down') return 'critical';
  return 'neutral';
}

function stateLabel(state?: MonitorState) {
  if (state === 'ok') return 'Healthy';
  if (state === 'degraded') return 'Degraded';
  if (state === 'down') return 'Down';
  return 'Unknown';
}

function fmtPct(value: number | null) {
  if (value === null) return 'No data';
  return `${value.toFixed(2)}%`;
}

function fmtMs(value: number | null | undefined) {
  if (value === null || value === undefined) return 'No data';
  return `${Math.round(value)} ms`;
}

function fmtTime(value?: string) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={card + ' p-4'}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-[26px] font-extrabold leading-none text-slate-50">{value}</div>
      {detail ? <div className={muted + ' mt-2'}>{detail}</div> : null}
    </div>
  );
}

function TargetRow({ target }: { target: TargetSummary }) {
  const status: UiStatus = target.ok ? 'healthy' : target.consecutive_failures >= 3 ? 'critical' : 'warning';
  const reason = target.ok ? `HTTP ${target.http_code}` : `${target.reason || `HTTP ${target.http_code}`} (${target.consecutive_failures})`;

  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-3">
        <div className="text-[13px] font-bold text-slate-100">{target.target}</div>
        <div className="mt-1 max-w-[34rem] truncate font-mono text-[11px] text-slate-500">{target.url}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge label={target.ok ? 'OK' : 'Failing'} status={status} pulse={!target.ok} />
      </td>
      <td className="px-4 py-3 text-right font-mono text-[12px] text-slate-300">{target.latency_ms} ms</td>
      <td className="px-4 py-3 text-right font-mono text-[12px] text-slate-300">{fmtMs(target.p95_24h)}</td>
      <td className="px-4 py-3 text-right font-mono text-[12px] text-slate-300">{fmtPct(target.uptime_24h)}</td>
      <td className="px-4 py-3 text-right text-[12px] text-slate-400">{reason}</td>
    </tr>
  );
}

function MonitorBand({ title, data }: { title: string; data: ProbeSet }) {
  const status = data.available ? stateStatus(data.status?.state) : 'neutral';
  const state = data.available ? stateLabel(data.status?.state) : 'Unavailable';
  const failing = data.targets.filter((target) => !target.ok).length;

  return (
    <div className={card + ' p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</div>
          <div className="mt-2 text-[20px] font-extrabold text-slate-50">{state}</div>
          <div className={muted + ' mt-1'}>
            Last probe {fmtTime(data.status?.ts)}. {data.targets.length} targets loaded.
          </div>
        </div>
        <StatusBadge label={state} status={status} pulse={status === 'critical'} />
      </div>
      {failing > 0 || data.status?.incident_since ? (
        <div className="mt-4 rounded-md border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-[12px] text-amber-200">
          {failing} failing target{failing === 1 ? '' : 's'}
          {data.status?.incident_since ? ` since ${fmtTime(data.status.incident_since)}` : ''}.
        </div>
      ) : null}
    </div>
  );
}

export default function FleetHealthPage() {
  const [data, setData] = useState<FleetHealthData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch('/api/fleet-health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load fleet health');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const allTargets = useMemo(() => [...(data?.fleet.targets ?? []), ...(data?.timepulse.targets ?? [])], [data]);
  const failing = allTargets.filter((target) => !target.ok);
  const slowP95 = allTargets.filter((target) => (target.p95_24h ?? 0) > 1000);
  const lowestUptime = allTargets
    .filter((target) => target.uptime_24h !== null)
    .sort((a, b) => (a.uptime_24h ?? 0) - (b.uptime_24h ?? 0))[0];

  return (
    <AppShell>
      <SectionTitle
        title="Fleet Health"
        subtitle="Public HTTPS uptime, latency, and TimePulse detail from the production probes."
        action={<ToolbarButton onClick={load}>Refresh</ToolbarButton>}
      />

      {error ? <div className={card + ' mb-4 border-red-400/30 p-4 text-sm text-red-200'}>{error}</div> : null}

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <MonitorBand title="EffectX Fleet" data={data?.fleet ?? { available: false, status: null, targets: [], probe_count: 0 }} />
        <MonitorBand title="TimePulse Detail" data={data?.timepulse ?? { available: false, status: null, targets: [], probe_count: 0 }} />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatTile label="Targets" value={loading ? '...' : String(allTargets.length)} detail="Fleet plus TimePulse probes" />
        <StatTile label="Failing Now" value={String(failing.length)} detail={failing.length ? failing.map((t) => t.target).join(', ') : 'All latest probes healthy'} />
        <StatTile label="Lowest 24h Uptime" value={fmtPct(lowestUptime?.uptime_24h ?? null)} detail={lowestUptime?.target ?? 'No 24h window yet'} />
        <StatTile label="Slow p95" value={String(slowP95.length)} detail={slowP95.length ? slowP95.map((t) => t.target).join(', ') : 'No target above 1000 ms'} />
      </div>

      <div className={card + ' overflow-hidden'}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-bold text-slate-100">Target Status</h2>
            <p className={muted}>24-hour uptime and latency from the local production log mount.</p>
          </div>
          <div className="text-[12px] text-slate-500">Updated {fmtTime(data?.generated_at)}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Now</th>
                <th className="px-4 py-3 text-right">Last</th>
                <th className="px-4 py-3 text-right">p95</th>
                <th className="px-4 py-3 text-right">Uptime</th>
                <th className="px-4 py-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {allTargets.map((target) => <TargetRow key={`${target.target}:${target.url}`} target={target} />)}
              {!loading && allTargets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No probe data found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
