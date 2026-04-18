'use client';

import { useEffect, useState } from 'react';
import { AppShell, SectionTitle, card, muted } from '../../components/ops-ui';

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

export default function SystemsPage() {
  const [shazza, setShazza] = useState<ShazzaData | null>(null);
  const [crm8, setCrm8] = useState<Crm8Data | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [shazzaRes, crm8Res, agentsRes] = await Promise.allSettled([
        fetch('/api/shazza', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/crm8', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/agents/status', { cache: 'no-store' }).then(r => r.json()),
      ]);
      if (shazzaRes.status === 'fulfilled') setShazza(shazzaRes.value);
      if (crm8Res.status === 'fulfilled') setCrm8(crm8Res.value);
      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.agents || []);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  const shazzaState = !shazza ? 'unknown'
    : !shazza.reachable ? 'down'
    : shazza.memory && shazza.memory.pct > 85 ? 'degraded'
    : 'healthy';

  const memColor = shazza?.memory
    ? shazza.memory.pct > 85 ? '#EF4444' : shazza.memory.pct > 65 ? '#F59E0B' : '#10B981'
    : '#10B981';

  const diskPct = shazza?.disk?.pct ? parseInt(shazza.disk.pct) : 0;
  const diskColor = diskPct > 85 ? '#EF4444' : diskPct > 65 ? '#F59E0B' : '#10B981';

  const crm8State = !crm8 ? 'unknown'
    : !crm8.reachable ? 'down'
    : crm8.memory && crm8.memory.pct > 85 ? 'degraded'
    : 'healthy';

  const crm8MemColor = crm8?.memory
    ? crm8.memory.pct > 85 ? '#EF4444' : crm8.memory.pct > 65 ? '#F59E0B' : '#10B981'
    : '#10B981';

  return (
    <AppShell>
      <div className="space-y-8">
        <SectionTitle title="Systems" subtitle="Live host health and agent status" />

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
                  <div style={{ marginTop: 10, fontSize: 12, color: shazza.temperature.celsius > 80 ? '#F87171' : '#94A3B8' }}>
                    🌡️ {shazza.temperature.celsius.toFixed(0)}°C
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
            <StatRow label="Host" value="203.57.50.240" sub="Sydney VPS" />
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
          ) : !crm8?.reachable ? (
            <div className={card + ' p-5'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusDot state="down" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F87171' }}>Unreachable</div>
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
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>💻 Bazza</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>100.125.171.52 · Tailscale · OpenClaw host</span>
            <StatusDot state="healthy" />
          </div>
          <div className={card + ' p-5'}>
            <StatRow label="Role" value="Dev workstation + AI host" />
            <StatRow label="OpenClaw" value="Running" sub="main agent + crew" />
            <StatRow label="Access" value="Tailscale only" sub="bazza.taile9fed9.ts.net" />
          </div>
        </div>

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
