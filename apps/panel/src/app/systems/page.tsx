'use client';

import { useEffect, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, muted, sevPill } from '../../components/ops-ui';

interface ShazzaData {
  ok: boolean;
  reachable: boolean;
  label: string;
  tailscaleIp: string;
  uptime?: { pretty: string | null; since: string | null };
  services?: {
    llamaServer: { active: boolean; since: string | null; label: string };
  };
  memory?: { totalMb: number; usedMb: number; freeMb: number; pct: number } | null;
  disk?: { total: string; used: string; free: string; pct: string } | null;
  gpu?: { raw: string | null; label: string };
  temperature?: { celsius: number } | null;
  error?: string;
  checkedAt: string;
}

interface Crm8Data {
  ok: boolean;
  reachable: boolean;
  service: string;
  label: string;
  uptime?: { seconds: number; pretty: string };
  memory?: { totalMb: number; usedMb: number; freeMb: number; pct: number };
  nodeVersion?: string;
  error?: string;
  checkedAt: string;
}

interface BazzaData {
  ok: boolean;
  label: string;
  host: string;
  cpu?: { pct: number | null; cores: number } | null;
  memory?: { totalMb: number; usedMb: number; freeMb: number; pct: number } | null;
  disk?: { totalGb: number; usedGb: number; freeGb: number; pct: number } | null;
  uptime?: { pretty: string | null; since: string | null };
  containers?: string[];
  containerCount?: number;
  error?: string;
  checkedAt: string;
}

interface AgentStatus {
  id: string;
  label: string;
  emoji: string;
  role: string;
  model: string;
  status: 'Working' | 'Idle' | 'Offline';
  currentTask: string | null;
  lastSeen: string | null;
}

function StatusDot({ state }: { state: 'healthy' | 'degraded' | 'down' | 'stale' | 'unknown' }) {
  const colors: Record<string, string> = {
    healthy: '#10B981',
    degraded: '#F59E0B',
    down: '#EF4444',
    stale: '#6B7280',
    unknown: '#6B7280',
  };
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: colors[state] || '#6B7280',
      boxShadow: state === 'healthy' ? `0 0 6px ${colors.healthy}80` : undefined,
      flexShrink: 0,
    }} />
  );
}

function Bar({ pct, color = '#10B981' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>{value}</span>
        {sub && <div style={{ fontSize: 11, color: '#64748B' }}>{sub}</div>}
      </div>
    </div>
  );
}

type HostState = 'healthy' | 'degraded' | 'down' | 'stale' | 'unknown';
type UiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

function stateToUi(state: HostState): UiStatus {
  if (state === 'healthy') return 'healthy';
  if (state === 'degraded') return 'warning';
  if (state === 'down') return 'critical';
  if (state === 'stale') return 'neutral';
  return 'neutral';
}

function stateLabel(state: HostState) {
  if (state === 'healthy') return 'Healthy';
  if (state === 'degraded') return 'Degraded';
  if (state === 'down') return 'Down';
  if (state === 'stale') return 'Stale';
  return 'Unknown';
}

function HostCommandCard({
  name,
  role,
  address,
  state,
  primary,
  secondary,
}: {
  name: string;
  role: string;
  address: string;
  state: HostState;
  primary: string;
  secondary: string;
}) {
  const color = state === 'down'
    ? 'var(--sev-critical)'
    : state === 'degraded'
      ? 'var(--sev-warning)'
      : state === 'healthy'
        ? 'var(--sev-healthy)'
        : 'var(--sev-neutral)';

  return (
    <div className={card + ' p-5'} style={{ borderLeft: `3px solid ${color}` }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="truncate text-[16px] font-extrabold text-slate-50">{name}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">{role}</div>
        </div>
        <StatusBadge label={stateLabel(state)} status={stateToUi(state)} pulse={state === 'down'} />
      </div>
      <div className="font-mono text-[12px] text-[var(--accent)]">{address}</div>
      <div className="mt-4 text-[22px] font-extrabold leading-none text-slate-100">{primary}</div>
      <div className={muted + ' mt-2'}>{secondary}</div>
    </div>
  );
}

function AnomalyRow({ label, detail, state }: { label: string; detail: string; state: HostState }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/10 px-4 py-3">
      <StatusDot state={state} />
      <div style={{ minWidth: 0 }}>
        <div className="truncate text-[13px] font-bold text-slate-100">{label}</div>
        <div className="mt-1 truncate text-[11px] text-slate-500">{detail}</div>
      </div>
      <StatusBadge label={stateLabel(state)} status={stateToUi(state)} />
    </div>
  );
}

export default function SystemsPage() {
  const [shazza, setShazza] = useState<ShazzaData | null>(null);
  const [crm8, setCrm8] = useState<Crm8Data | null>(null);
  const [bazza, setBazza] = useState<BazzaData | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [shazzaRes, crm8Res, bazzaRes, agentsRes] = await Promise.allSettled([
      fetch('/api/shazza', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/crm8', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/bazza', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/agents/status', { cache: 'no-store' }).then(r => r.json()),
    ]);
    if (shazzaRes.status === 'fulfilled') setShazza(shazzaRes.value);
    if (crm8Res.status === 'fulfilled') setCrm8(crm8Res.value);
    if (bazzaRes.status === 'fulfilled') setBazza(bazzaRes.value);
    if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.agents || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  const shazzaState = !shazza ? 'unknown'
    : !shazza.reachable ? 'down'
    : shazza.temperature && shazza.temperature.celsius >= 90 ? 'down'
    : shazza.memory && shazza.memory.pct > 85 ? 'degraded'
    : shazza.temperature && shazza.temperature.celsius >= 80 ? 'degraded'
    : 'healthy';

  const memColor = shazza?.memory
    ? shazza.memory.pct > 85 ? '#EF4444' : shazza.memory.pct > 65 ? '#F59E0B' : '#10B981'
    : '#10B981';

  const diskPct = shazza?.disk?.pct ? parseInt(shazza.disk.pct) : 0;
  const diskColor = diskPct > 85 ? '#EF4444' : diskPct > 65 ? '#F59E0B' : '#10B981';

  const crm8State = !crm8 ? 'unknown'
    : !crm8.reachable && !crm8.ok ? 'down'
    : crm8.memory && crm8.memory.pct > 85 ? 'degraded'
    : 'healthy';

  const crm8MemColor = crm8?.memory
    ? crm8.memory.pct > 85 ? '#EF4444' : crm8.memory.pct > 65 ? '#F59E0B' : '#10B981'
    : '#10B981';

  const bazzaState: HostState = !bazza ? 'unknown'
    : !bazza.ok ? 'down'
    : bazza.memory && bazza.memory.pct > 85 ? 'degraded'
    : bazza.disk && bazza.disk.pct > 85 ? 'degraded'
    : 'healthy';

  const hostStates: HostState[] = [shazzaState as HostState, crm8State as HostState, bazzaState, 'healthy'];
  const downHosts = hostStates.filter((s) => s === 'down').length;
  const degradedHosts = hostStates.filter((s) => s === 'degraded').length;
  const healthyHosts = hostStates.filter((s) => s === 'healthy').length;
  const commandState: UiStatus = downHosts ? 'critical' : degradedHosts ? 'warning' : healthyHosts ? 'healthy' : 'neutral';
  const activeAgents = agents.filter((agent) => agent.status === 'Working').length;
  const anomalies = [
    {
      label: 'Shazza thermal and memory envelope',
      detail: shazza?.reachable
        ? `temp ${shazza.temperature?.celsius?.toFixed(0) ?? '?'}C · memory ${shazza.memory?.pct ?? '?'}%`
        : shazza?.error || 'waiting for first probe',
      state: shazzaState as HostState,
    },
    {
      label: 'Bazza local resource envelope',
      detail: bazza?.ok
        ? `cpu ${bazza.cpu?.pct ?? '?'}% · memory ${bazza.memory?.pct ?? '?'}% · disk ${bazza.disk?.pct ?? '?'}%`
        : bazza?.error || 'waiting for first probe',
      state: bazzaState,
    },
    {
      label: 'CRM8 application process',
      detail: crm8?.ok
        ? `uptime ${crm8.uptime?.pretty ?? 'unknown'} · memory ${crm8.memory?.pct ?? '?'}%`
        : crm8?.error || 'waiting for first probe',
      state: crm8State as HostState,
    },
    {
      label: 'Prod service posture',
      detail: 'PM2 + Docker suite, SSH on 2222, Mission Panel container published',
      state: 'healthy' as HostState,
    },
  ].sort((a, b) => {
    const rank: Record<HostState, number> = { down: 0, degraded: 1, unknown: 2, stale: 3, healthy: 4 };
    return rank[a.state] - rank[b.state];
  });

  return (
    <AppShell>
      <div className="space-y-8">
        <SectionTitle
          title="Systems"
          subtitle="Host command board for machine health, service pressure, and anomaly triage"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <HostCommandCard
            name="Bazza"
            role="OpenClaw host"
            address="bazza.taile9fed9.ts.net"
            state={bazzaState}
            primary={bazza?.ok ? `${bazza.containerCount ?? 0} containers` : 'No signal'}
            secondary={bazza?.ok ? `CPU ${bazza.cpu?.pct ?? '?'}% · RAM ${bazza.memory?.pct ?? '?'}% · disk ${bazza.disk?.pct ?? '?'}%` : bazza?.error || 'Local probe pending'}
          />
          <HostCommandCard
            name="Shazza"
            role="AI workstation"
            address="100.113.217.81"
            state={shazzaState as HostState}
            primary={shazza?.reachable ? `${shazza.temperature?.celsius?.toFixed(0) ?? '?'}C` : 'No signal'}
            secondary={shazza?.reachable ? `RAM ${shazza.memory?.pct ?? '?'}% · llama ${shazza.services?.llamaServer.active ? 'active' : 'inactive'}` : shazza?.error || 'Tailnet probe pending'}
          />
          <HostCommandCard
            name="CRM8"
            role="application host"
            address="103.230.159.104"
            state={crm8State as HostState}
            primary={crm8?.ok ? crm8.uptime?.pretty ?? 'Online' : 'No signal'}
            secondary={crm8?.ok ? `Node ${crm8.nodeVersion ?? '?'} · memory ${crm8.memory?.pct ?? '?'}%` : crm8?.error || 'App probe pending'}
          />
          <HostCommandCard
            name="Prod"
            role="EffectX suite"
            address="203.57.50.240"
            state="healthy"
            primary="PM2 + Docker"
            secondary="crossbench, abea-ndh, nurture, projectxify, mission-panel"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <section className={card + ' overflow-hidden'}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
              <div>
                <div className="text-[13px] font-bold text-slate-100">Fleet Anomaly Queue</div>
                <div className="mt-1 text-[12px] text-slate-500">Hosts sorted by the highest current operational pressure</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={sevPill(commandState)}>{stateLabel(downHosts ? 'down' : degradedHosts ? 'degraded' : healthyHosts ? 'healthy' : 'unknown')}</span>
                <span className={sevPill('critical')}>{downHosts} down</span>
                <span className={sevPill('warning')}>{degradedHosts} degraded</span>
              </div>
            </div>
            <div>
              {anomalies.map((item) => (
                <AnomalyRow key={item.label} label={item.label} detail={item.detail} state={item.state} />
              ))}
            </div>
          </section>

          <aside className={card + ' overflow-hidden'}>
            <div className="border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
              <div className="text-[13px] font-bold text-slate-100">Operator Readiness</div>
              <div className="mt-1 text-[12px] text-slate-500">Agent availability beside the machine state</div>
            </div>
            <div className="grid grid-cols-2 gap-0">
              <div className="border-r border-white/10 p-5">
                <div className="text-[28px] font-extrabold leading-none text-slate-50">{activeAgents}/{agents.length}</div>
                <div className={muted + ' mt-2'}>agents working</div>
              </div>
              <div className="p-5">
                <div className="text-[28px] font-extrabold leading-none text-slate-50">{healthyHosts}/4</div>
                <div className={muted + ' mt-2'}>hosts healthy</div>
              </div>
            </div>
            <div className="border-t border-white/10 p-4 text-[13px] text-slate-300">
              {downHosts || degradedHosts
                ? 'Review the anomaly queue before lower-priority telemetry.'
                : 'Fleet is nominal. Next useful work is incident workflow polish.'}
            </div>
          </aside>
        </div>

        {/* ── Shazza ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>🖥️ Shazza</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>Intel NUC u9-285H · 100.113.217.81 · Tailscale</span>
            {!loading && <StatusDot state={shazzaState} />}
            {!loading && <span style={{ fontSize: 11, color: shazzaState === 'healthy' ? '#10B981' : shazzaState === 'degraded' ? '#F59E0B' : '#EF4444' }}>
              {shazzaState.charAt(0).toUpperCase() + shazzaState.slice(1)}
            </span>}
          </div>

          {loading ? (
            <div className={card + ' p-5'} style={{ color: '#64748B', fontSize: 13 }}>Connecting to Shazza…</div>
          ) : !shazza?.reachable ? (
            <div className={card + ' p-5'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusDot state="down" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F87171' }}>Unreachable</div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{shazza?.error || 'Health check failed'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {/* Uptime card */}
              <div className={card + ' p-5'}>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Uptime</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>{shazza?.uptime?.pretty || 'N/A'}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>since {shazza?.uptime?.since || '—'}</div>
                {shazza?.temperature && (
                  <div style={{ marginTop: 10, fontSize: 12, color: shazza.temperature.celsius >= 90 ? '#EF4444' : shazza.temperature.celsius > 80 ? '#F87171' : '#94A3B8' }}>
                    🌡️ {shazza.temperature.celsius.toFixed(0)}°C
                    {shazza.temperature.celsius >= 90 && <span style={{ marginLeft: 6, fontWeight: 700 }}>CRITICAL</span>}
                  </div>
                )}
              </div>

              {/* Memory card */}
              <div className={card + ' p-5'}>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Memory</div>
                {shazza?.memory ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9' }}>{shazza.memory.usedMb.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>/ {shazza.memory.totalMb.toLocaleString()} MB</span></div>
                    <Bar pct={shazza.memory.pct} color={memColor} />
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{shazza.memory.pct}% used · {shazza.memory.freeMb.toLocaleString()} MB free</div>
                  </>
                ) : <div style={{ fontSize: 13, color: '#64748B' }}>Unavailable</div>}
              </div>

              {/* Disk card */}
              <div className={card + ' p-5'}>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Disk (/)</div>
                {shazza?.disk ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9' }}>{shazza.disk.used} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>/ {shazza.disk.total}</span></div>
                    <Bar pct={diskPct} color={diskColor} />
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{shazza.disk.pct} used · {shazza.disk.free} free</div>
                  </>
                ) : <div style={{ fontSize: 13, color: '#64748B' }}>Unavailable</div>}
              </div>

              {/* GPU + llama-server card */}
              <div className={card + ' p-5'}>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>GPU / AI Services</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#F1F5F9', marginBottom: 6 }}>Intel Arc (ARL) · 23GB VRAM</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusDot state={shazza?.services?.llamaServer.active ? 'healthy' : 'stale'} />
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>llama-server (SYCL)</span>
                    <span style={{ fontSize: 11, marginLeft: 'auto', color: shazza?.services?.llamaServer.active ? '#10B981' : '#6B7280' }}>
                      {shazza?.services?.llamaServer.active ? 'active' : 'inactive'}
                    </span>
                  </div>
                </div>
                {shazza?.gpu?.raw && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#64748B' }}>sycl-ls: {shazza.gpu.raw}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Prod server summary ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>🖧 Prod</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>203.57.50.240 · EffectX suite</span>
            <StatusDot state="healthy" />
            <span style={{ fontSize: 11, color: '#10B981' }}>Healthy</span>
          </div>
          <div className={card + ' p-5'}>
            <StatRow label="Host" value="203.57.50.240" sub="Perth VPS" />
            <StatRow label="Apps running" value="PM2 + Docker" sub="crossbench, abea-ndh, nurturerecord, projectxify, mission-panel" />
            <StatRow label="SSH port" value="2222" sub="non-standard (good)" />
          </div>
        </div>

        {/* ── CRM8 Server ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>🗄️ CRM8</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>103.230.159.104 · crm8.effectx.com.au</span>
            {!loading && <StatusDot state={crm8State} />}
            {!loading && <span style={{ fontSize: 11, color: crm8State === 'healthy' ? '#10B981' : crm8State === 'degraded' ? '#F59E0B' : '#EF4444' }}>
              {crm8State.charAt(0).toUpperCase() + crm8State.slice(1)}
            </span>}
          </div>

          {loading ? (
            <div className={card + ' p-5'} style={{ color: '#64748B', fontSize: 13 }}>Connecting to CRM8…</div>
          ) : !crm8?.ok ? (
            <div className={card + ' p-5'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusDot state={crm8?.reachable ? 'degraded' : 'down'} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: crm8?.reachable ? '#F59E0B' : '#F87171' }}>
                    {crm8?.reachable ? 'Health check failed' : 'Unreachable'}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{crm8?.error || 'Health check failed'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {/* Uptime card */}
              <div className={card + ' p-5'}>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Uptime</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>{crm8?.uptime?.pretty || 'N/A'}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Node {crm8?.nodeVersion || '—'}</div>
              </div>

              {/* Memory card */}
              <div className={card + ' p-5'}>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Process Memory</div>
                {crm8?.memory ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9' }}>{crm8.memory.usedMb.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>/ {crm8.memory.totalMb.toLocaleString()} MB</span></div>
                    <Bar pct={crm8.memory.pct} color={crm8MemColor} />
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{crm8.memory.pct}% used</div>
                  </>
                ) : <div style={{ fontSize: 13, color: '#64748B' }}>Unavailable</div>}
              </div>

              {/* App info card */}
              <div className={card + ' p-5'}>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>App</div>
                <StatRow label="Service" value="crm8" sub="PM2 · port 3044" />
                <StatRow label="Domain" value="crm8.effectx.com.au" />
                <StatRow label="SSH" value="port 2222" sub="id_ed25519 key" />
              </div>
            </div>
          )}
        </div>

        {/* ── Bazza ── */}
        {(() => {
          const bazzaState = !bazza ? 'unknown'
            : !bazza.ok ? 'down'
            : bazza.memory && bazza.memory.pct > 85 ? 'degraded'
            : bazza.disk && bazza.disk.pct > 85 ? 'degraded'
            : 'healthy';
          const bMemColor = bazza?.memory
            ? bazza.memory.pct > 85 ? '#EF4444' : bazza.memory.pct > 65 ? '#F59E0B' : '#10B981'
            : '#10B981';
          const bDiskColor = bazza?.disk
            ? bazza.disk.pct > 85 ? '#EF4444' : bazza.disk.pct > 65 ? '#F59E0B' : '#10B981'
            : '#10B981';
          const bCpuColor = bazza?.cpu?.pct != null
            ? bazza.cpu.pct > 80 ? '#EF4444' : bazza.cpu.pct > 50 ? '#F59E0B' : '#10B981'
            : '#10B981';
          return (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>💻 Bazza</span>
                <span style={{ fontSize: 12, color: '#64748B' }}>bazza.taile9fed9.ts.net · OpenClaw host</span>
                {!loading && <StatusDot state={bazzaState} />}
                {!loading && <span style={{ fontSize: 11, color: bazzaState === 'healthy' ? '#10B981' : bazzaState === 'degraded' ? '#F59E0B' : '#EF4444' }}>
                  {bazzaState.charAt(0).toUpperCase() + bazzaState.slice(1)}
                </span>}
              </div>

              {loading ? (
                <div className={card + ' p-5'} style={{ color: '#64748B', fontSize: 13 }}>Loading Bazza metrics…</div>
              ) : !bazza?.ok ? (
                <div className={card + ' p-5'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusDot state="down" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#F87171' }}>Error</div>
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{bazza?.error || 'Metrics unavailable'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {/* Uptime card */}
                  <div className={card + ' p-5'}>
                    <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Uptime</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>{bazza?.uptime?.pretty || 'N/A'}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>since {bazza?.uptime?.since || '—'}</div>
                    <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8' }}>
                      🐳 {bazza?.containerCount ?? 0} containers · {bazza?.cpu?.cores ?? '?'} cores
                    </div>
                  </div>

                  {/* CPU card */}
                  <div className={card + ' p-5'}>
                    <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>CPU</div>
                    {bazza?.cpu?.pct != null ? (
                      <>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9' }}>{bazza.cpu.pct}%</div>
                        <Bar pct={bazza.cpu.pct} color={bCpuColor} />
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{bazza.cpu.cores} cores total</div>
                      </>
                    ) : <div style={{ fontSize: 13, color: '#64748B' }}>Unavailable</div>}
                  </div>

                  {/* Memory card */}
                  <div className={card + ' p-5'}>
                    <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Memory</div>
                    {bazza?.memory ? (
                      <>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9' }}>{bazza.memory.usedMb.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>/ {bazza.memory.totalMb.toLocaleString()} MB</span></div>
                        <Bar pct={bazza.memory.pct} color={bMemColor} />
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{bazza.memory.pct}% · {bazza.memory.freeMb.toLocaleString()} MB free</div>
                      </>
                    ) : <div style={{ fontSize: 13, color: '#64748B' }}>Unavailable</div>}
                  </div>

                  {/* Disk card */}
                  <div className={card + ' p-5'}>
                    <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Disk (/)</div>
                    {bazza?.disk ? (
                      <>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9' }}>{bazza.disk.usedGb} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>/ {bazza.disk.totalGb} GB</span></div>
                        <Bar pct={bazza.disk.pct} color={bDiskColor} />
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{bazza.disk.pct}% · {bazza.disk.freeGb} GB free</div>
                      </>
                    ) : <div style={{ fontSize: 13, color: '#64748B' }}>Unavailable</div>}
                  </div>
                </div>
              )}

              {/* Container list */}
              {!loading && bazza?.ok && bazza.containers && bazza.containers.length > 0 && (
                <div className={card + ' p-4 mt-4'}>
                  <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Running Containers</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {bazza.containers.map(name => (
                      <span key={name} style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
                        color: '#10B981', fontFamily: 'monospace',
                      }}>● {name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Agents ── */}
        {agents.length > 0 && (
          <div>
            <SectionTitle title="Agent crew" subtitle="Live status from session files" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agents.map(agent => {
                const statusColor = agent.status === 'Working' ? '#10B981' : agent.status === 'Idle' ? '#F59E0B' : '#6B7280';
                return (
                  <div key={agent.id} className={card + ' p-4'} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{agent.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>{agent.label}</span>
                        <span style={{ fontSize: 10, color: statusColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{agent.status}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{agent.role}</div>
                      {agent.currentTask && (
                        <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.currentTask}>
                          {agent.currentTask}
                        </div>
                      )}
                      {agent.lastSeen && (
                        <div style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>
                          Last seen: {new Date(agent.lastSeen).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                    <StatusDot state={agent.status === 'Working' ? 'healthy' : agent.status === 'Idle' ? 'degraded' : 'stale'} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: '#475569', textAlign: 'right' }}>
          Auto-refreshes every 30s
        </div>
      </div>
    </AppShell>
  );
}
