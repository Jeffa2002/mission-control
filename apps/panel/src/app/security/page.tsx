'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, Metric, SectionTitle, StatusBadge, ToolbarButton, card, muted } from '../../components/ops-ui';

interface SecurityData {
  ok: boolean;
  checkedAt: string;
  source?: string;
  hasThreats: boolean;
  stale?: boolean;
  hosts?: Array<{
    id: string;
    label: string;
    reporting: boolean;
    checkedAt: string;
    sources: { auth: boolean; nginx: boolean; firewall: boolean; fail2ban: boolean };
    error?: string;
  }>;
  registeredHosts?: Array<{
    id: string;
    label: string;
    reporting: boolean;
    securityChannel: string;
  }>;
  fail2ban: {
    available: boolean;
    banned: number;
    totalFailed: number;
    bannedIPs: string[];
  };
  nginx: {
    errorCount: number;
    recentErrors: string[];
  };
  auth: {
    failCount: number;
    sshAcceptCount?: number;
    sudoCount?: number;
    recent: string[];
  };
  firewall?: {
    blockCount: number;
    recent: string[];
  };
}

type ThreatSeverity = 'healthy' | 'warning' | 'critical' | 'info';

interface ThreatItem {
  id: string;
  title: string;
  source: string;
  severity: ThreatSeverity;
  status: string;
  signal: string;
  evidence: string[];
  action: string;
}

function severityLabel(severity: ThreatSeverity) {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'Watch';
  if (severity === 'healthy') return 'Clear';
  return 'Info';
}

function buildThreats(data: SecurityData): ThreatItem[] {
  const threats: ThreatItem[] = [];
  const hosts = data.hosts ?? [];
  const missingHosts = hosts.filter((host) => !host.reporting);
  const unconfiguredRegisteredHosts = (data.registeredHosts ?? []).filter((host) => !host.reporting);

  if (missingHosts.length > 0 || unconfiguredRegisteredHosts.length > 0) {
    threats.push({
      id: 'host-reporting',
      title: `${missingHosts.length + unconfiguredRegisteredHosts.length} server${missingHosts.length + unconfiguredRegisteredHosts.length === 1 ? '' : 's'} not reporting security telemetry`,
      source: 'coverage',
      severity: 'warning',
      status: 'Needs wiring',
      signal: 'Every registered server should have an auth/firewall/web signal path back to Bazza.',
      evidence: [
        ...missingHosts.map((host) => `${host.label}: ${host.error || 'security command returned no usable data'}`),
        ...unconfiguredRegisteredHosts.map((host) => `${host.label}: security channel not configured`),
      ].slice(0, 8),
      action: 'Add or fix the host security channel so auth failures and firewall activity are visible here.',
    });
  }

  if (!data.fail2ban.available) {
    threats.push({
      id: 'fail2ban-unavailable',
      title: 'SSH jail telemetry unavailable',
      source: 'fail2ban',
      severity: 'warning',
      status: 'Needs validation',
      signal: 'fail2ban did not report current jail state.',
      evidence: ['No active jail readout available from the security API.'],
      action: 'Confirm fail2ban service state on prod before trusting SSH posture.',
    });
  } else if (data.fail2ban.banned > 0) {
    threats.push({
      id: 'fail2ban-active',
      title: `${data.fail2ban.banned} active SSH ban${data.fail2ban.banned === 1 ? '' : 's'}`,
      source: 'ssh',
      severity: data.fail2ban.banned > 5 ? 'critical' : 'warning',
      status: 'Contained',
      signal: `${data.fail2ban.totalFailed} total failed attempts recorded.`,
      evidence: data.fail2ban.bannedIPs.slice(0, 8),
      action: 'Review banned sources, confirm no trusted IP was caught, and keep monitoring auth failures.',
    });
  }

  if (data.auth.failCount > 0) {
    threats.push({
      id: 'auth-failures',
      title: `${data.auth.failCount} auth failure${data.auth.failCount === 1 ? '' : 's'}`,
      source: 'auth',
      severity: data.auth.failCount > 50 ? 'critical' : data.auth.failCount > 10 ? 'warning' : 'info',
      status: data.auth.failCount > 10 ? 'Investigate' : 'Observe',
      signal: 'Failed password events were seen in recent auth logs.',
      evidence: data.auth.recent.slice(0, 5),
      action: data.auth.failCount > 10 ? 'Correlate source IPs with fail2ban and check for repeated usernames.' : 'No immediate action unless the rate increases.',
    });
  }

  if (data.nginx.errorCount > 0) {
    threats.push({
      id: 'nginx-errors',
      title: `${data.nginx.errorCount} nginx 4xx/5xx response${data.nginx.errorCount === 1 ? '' : 's'}`,
      source: 'nginx',
      severity: data.nginx.errorCount > 5000 ? 'critical' : data.nginx.errorCount > 1000 ? 'warning' : 'info',
      status: data.nginx.errorCount > 1000 ? 'Investigate' : 'Observe',
      signal: 'Recent web requests are producing error responses.',
      evidence: data.nginx.recentErrors.slice(0, 5),
      action: data.nginx.errorCount > 1000 ? 'Check top paths and source IPs for scan patterns or app regressions.' : 'Sample recent errors and verify they are expected noise.',
    });
  }

  if ((data.firewall?.blockCount ?? 0) > 0) {
    threats.push({
      id: 'firewall-blocks',
      title: `${data.firewall?.blockCount ?? 0} firewall block${(data.firewall?.blockCount ?? 0) === 1 ? '' : 's'}`,
      source: 'firewall',
      severity: (data.firewall?.blockCount ?? 0) > 100 ? 'warning' : 'info',
      status: 'Contained',
      signal: 'UFW/kernel block events were seen in recent host logs.',
      evidence: data.firewall?.recent.slice(0, 5) ?? [],
      action: 'Check top sources if the block volume keeps rising or targets unusual ports.',
    });
  }

  if (threats.length === 0) {
    threats.push({
      id: 'clear',
      title: 'No active threats detected',
      source: 'security',
      severity: 'healthy',
      status: 'Clear',
      signal: 'fail2ban, auth, firewall, and nginx signals are within normal bounds.',
      evidence: [`Checked ${new Date(data.checkedAt).toLocaleTimeString()}`],
      action: 'No operator action required.',
    });
  }

  const rank: Record<ThreatSeverity, number> = { critical: 0, warning: 1, info: 2, healthy: 3 };
  return threats.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function EvidencePanel({ title, lines, tone = 'neutral' }: { title: string; lines: string[]; tone?: 'neutral' | 'warning' | 'critical' }) {
  const color = tone === 'critical' ? 'var(--sev-critical)' : tone === 'warning' ? 'var(--sev-warning)' : 'var(--text-3)';

  return (
    <div className={card + ' p-5'}>
      <SectionTitle title={title} subtitle={`${lines.length} recent evidence item${lines.length === 1 ? '' : 's'}`} />
      {lines.length === 0 ? (
        <div className={muted}>No evidence lines available.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div
              key={`${line}-${i}`}
              className="overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 font-mono text-[11px]"
              style={{ color }}
              title={line}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/security', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const threats = useMemo(() => (data ? buildThreats(data) : []), [data]);
  const topThreat = threats[0];
  const activeThreats = threats.filter((t) => t.severity === 'critical' || t.severity === 'warning').length;

  return (
    <AppShell>
      <div className="space-y-8">
        <SectionTitle
          title="Security Triage"
          subtitle="Ranked operational signals from prod and bazza"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        {loading && !data && (
          <div className={card + ' p-8 text-center text-sm text-slate-400'}>
            Loading security signals...
          </div>
        )}

        {error && (
          <div className={card + ' border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.07)] p-5'}>
            <div className="mb-1 font-semibold text-[var(--sev-warning)]">Could not load security data</div>
            <div className={muted}>{error}</div>
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <Metric
                label="Triage state"
                value={topThreat?.severity === 'healthy' ? 'Clear' : severityLabel(topThreat?.severity ?? 'info')}
                delta={topThreat?.title}
                status={topThreat?.severity === 'critical' ? 'critical' : topThreat?.severity === 'warning' ? 'warning' : 'healthy'}
              />
              <Metric
                label="Active items"
                value={String(activeThreats)}
                delta={activeThreats ? 'Needs operator review' : 'No action queue'}
                status={activeThreats ? 'warning' : 'healthy'}
              />
              <Metric
                label="Auth failures"
                value={String(data.auth.failCount)}
                delta={data.auth.failCount > 0 ? 'Recent failed password events' : 'None detected'}
                status={data.auth.failCount > 50 ? 'critical' : data.auth.failCount > 10 ? 'warning' : 'healthy'}
              />
              <Metric
                label="Web errors"
                value={String(data.nginx.errorCount)}
                delta={data.nginx.errorCount > 0 ? 'Recent 4xx/5xx responses' : 'No web error pressure'}
                status={data.nginx.errorCount > 5000 ? 'critical' : data.nginx.errorCount > 1000 ? 'warning' : 'healthy'}
              />
              <Metric
                label="Reporting hosts"
                value={`${(data.hosts ?? []).filter((host) => host.reporting).length}/${Math.max((data.hosts ?? []).length, 1)}`}
                delta={(data.hosts ?? []).every((host) => host.reporting) ? 'All configured channels online' : 'One or more channels need attention'}
                status={(data.hosts ?? []).every((host) => host.reporting) ? 'healthy' : 'warning'}
              />
            </section>

            <section className={card + ' overflow-hidden'}>
              <div className="border-b border-white/10 bg-[var(--bg-2)] px-5 py-4">
                <SectionTitle title="Server Reporting" subtitle={`Source: ${data.source || 'security api'}`} />
              </div>
              <div className="grid gap-0 divide-y divide-white/10 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                {(data.hosts ?? []).map((host) => (
                  <div key={host.id} className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[14px] font-semibold text-slate-100">{host.label}</div>
                        <div className="text-[11px] text-slate-500">{host.id}</div>
                      </div>
                      <StatusBadge label={host.reporting ? 'Reporting' : 'Offline'} status={host.reporting ? 'healthy' : 'warning'} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(host.sources).map(([source, ok]) => (
                        <span key={source} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ok ? 'border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--sev-healthy)]' : 'border-white/10 bg-white/[0.03] text-slate-500'}`}>
                          {source}
                        </span>
                      ))}
                    </div>
                    {host.error && <div className="mt-3 truncate font-mono text-[11px] text-[var(--sev-warning)]" title={host.error}>{host.error}</div>}
                  </div>
                ))}
              </div>
              {(data.registeredHosts ?? []).some((host) => !host.reporting) && (
                <div className="border-t border-white/10 px-5 py-4 text-[12px] text-slate-400">
                  Not yet wired for security telemetry: {(data.registeredHosts ?? []).filter((host) => !host.reporting).map((host) => host.label).join(', ')}
                </div>
              )}
            </section>

            <section className={card + ' overflow-hidden'}>
              <div className="border-b border-white/10 bg-[var(--bg-2)] px-5 py-4">
                <SectionTitle title="Triage Queue" subtitle="Summary to evidence to next action" />
              </div>
              <div className="divide-y divide-white/10">
                {threats.map((threat) => (
                  <div key={threat.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_1.2fr_1fr]">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge label={severityLabel(threat.severity)} status={threat.severity} pulse={threat.severity === 'critical'} />
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300">{threat.source}</span>
                      </div>
                      <div className="text-[15px] font-semibold text-slate-100">{threat.title}</div>
                      <div className="mt-1 text-[12px] text-slate-500">{threat.status}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Signal</div>
                      <div className="mt-2 text-[13px] leading-5 text-slate-300">{threat.signal}</div>
                      {threat.evidence.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {threat.evidence.slice(0, 3).map((line, i) => (
                            <span key={`${threat.id}-${i}`} className="max-w-full truncate rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-slate-500" title={line}>
                              {line}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Next action</div>
                      <div className="mt-2 text-[13px] leading-5 text-slate-300">{threat.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <EvidencePanel title="Auth Evidence" lines={data.auth.recent} tone={data.auth.failCount > 10 ? 'warning' : 'neutral'} />
              <EvidencePanel title="Nginx Evidence" lines={data.nginx.recentErrors} tone={data.nginx.errorCount > 1000 ? 'warning' : 'neutral'} />
            </section>

            <EvidencePanel title="Firewall Evidence" lines={data.firewall?.recent ?? []} tone={(data.firewall?.blockCount ?? 0) > 100 ? 'warning' : 'neutral'} />

            {data.fail2ban.available && data.fail2ban.bannedIPs.length > 0 && (
              <div className={card + ' p-5'}>
                <SectionTitle title="Contained SSH Sources" subtitle={`${data.fail2ban.banned} active fail2ban ban${data.fail2ban.banned === 1 ? '' : 's'}`} />
                <div className="flex flex-wrap gap-2">
                  {data.fail2ban.bannedIPs.map((ip) => (
                    <span key={ip} className="rounded-full border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 py-1 font-mono text-[12px] font-semibold text-[var(--sev-critical)]">
                      {ip}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-right text-[11px] text-slate-500">
              Last checked: {new Date(data.checkedAt).toLocaleTimeString()} · refreshes every 60s
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
