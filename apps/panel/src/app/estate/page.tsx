'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, muted } from '../../components/ops-ui';

type EstateStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

interface EstateRepo {
  name: string;
  fullName: string;
  owner: string;
  productionBranch: string;
  status: EstateStatus;
  github?: {
    latestRun?: {
      name: string;
      branch: string;
      status: EstateStatus;
      conclusion?: string;
      startedAt?: string;
      title: string;
      url?: string;
    } | null;
    dependabot: {
      status: EstateStatus;
      open: number;
      counts: Record<string, number>;
      worstSeverity?: string | null;
    };
    warning?: string;
  };
  smokes: Array<{
    name: string;
    url: string;
    status: EstateStatus;
    httpStatus: number | null;
    latencyMs: number;
    warning?: string;
  }>;
}

interface EstateData {
  ok: boolean;
  summary: {
    status: EstateStatus;
    repos: number;
    critical: number;
    warning: number;
    dependabotOpen: number;
    smokeCritical: number;
    checkedAt: string;
  };
  repos: EstateRepo[];
  runners: {
    status: EstateStatus;
    note: string;
    controls: string[];
  };
  residuals: string[];
}

function statusMeta(status: EstateStatus): { label: string; badge: 'healthy' | 'warning' | 'critical' | 'neutral' } {
  if (status === 'healthy') return { label: 'Healthy', badge: 'healthy' };
  if (status === 'warning') return { label: 'Watch', badge: 'warning' };
  if (status === 'critical') return { label: 'Critical', badge: 'critical' };
  return { label: 'Unknown', badge: 'neutral' };
}

function timeAgo(iso?: string) {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function EstatePage() {
  const [data, setData] = useState<EstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/estate', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Estate API returned ${res.status}`);
      setData(json);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const queues = useMemo(() => {
    if (!data) return [];
    return data.repos
      .flatMap((repo) => {
        const items = [];
        if (repo.status === 'critical') items.push({ repo: repo.name, label: 'Critical service signal', detail: 'Deploy, smoke, or dependency state needs attention.' });
        if ((repo.github?.dependabot.open ?? 0) > 0) items.push({ repo: repo.name, label: 'Dependabot backlog', detail: `${repo.github?.dependabot.open} open alert${repo.github?.dependabot.open === 1 ? '' : 's'}.` });
        if (repo.github?.warning) items.push({ repo: repo.name, label: 'GitHub API warning', detail: repo.github.warning });
        return items;
      })
      .slice(0, 8);
  }, [data]);

  const overall = statusMeta(data?.summary.status ?? 'unknown');

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="Estate Cockpit"
          subtitle="Deploys, dependency alerts, runners, and live smoke checks across Jeff's apps"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        {error && (
          <div className={card + ' border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.07)] p-5'}>
            <div className="text-sm font-semibold text-[var(--sev-critical)]">Could not load estate state</div>
            <div className={muted + ' mt-1'}>{error}</div>
          </div>
        )}

        {!data && loading && <div className={card + ' p-8 text-center text-sm text-slate-400'}>Loading estate cockpit...</div>}

        {data && (
          <>
            <div className={card + ' overflow-hidden'}>
              <div className="grid gap-4 border-b border-white/10 bg-[var(--bg-2)] p-5 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Estate state</div>
                  <div className="mt-2 flex items-center gap-3">
                    <StatusBadge label={overall.label} status={overall.badge} pulse={data.summary.status !== 'healthy'} />
                    <span className="text-[13px] text-slate-400">Checked {timeAgo(data.summary.checkedAt)}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[22px] font-semibold text-slate-100">{data.summary.repos}</div>
                  <div className="text-[12px] text-slate-500">Repos watched</div>
                </div>
                <div>
                  <div className="text-[22px] font-semibold text-[var(--sev-warning)]">{data.summary.dependabotOpen}</div>
                  <div className="text-[12px] text-slate-500">Open alerts</div>
                </div>
                <div>
                  <div className="text-[22px] font-semibold text-[var(--sev-critical)]">{data.summary.critical}</div>
                  <div className="text-[12px] text-slate-500">Critical repos</div>
                </div>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-3">
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[12px] font-semibold text-slate-200">Runner posture</div>
                  <div className="mt-2 flex items-center gap-2"><StatusBadge label="Sandboxed root" status="warning" /></div>
                  <div className="mt-3 text-[12px] leading-5 text-slate-400">{data.runners.note}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[12px] font-semibold text-slate-200">Active controls</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.runners.controls.map((control) => (
                      <span key={control} className="rounded border border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.06)] px-2 py-1 font-mono text-[11px] text-[var(--sev-healthy)]">{control}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[12px] font-semibold text-slate-200">Work queue</div>
                  <div className="mt-3 space-y-2">
                    {(queues.length > 0 ? queues : [{ repo: 'Estate', label: 'No live blockers', detail: 'Current automated signals are quiet.' }]).map((item, index) => (
                      <div key={`${item.repo}-${index}`} className="text-[12px]">
                        <span className="font-semibold text-slate-100">{item.repo}</span>
                        <span className="text-slate-500"> - {item.label}</span>
                        <div className="truncate text-slate-500" title={item.detail}>{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={card + ' overflow-hidden'}>
              <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr_0.6fr] gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <div>App</div>
                <div>Latest run</div>
                <div>Dependency alerts</div>
                <div>Smoke</div>
                <div className="text-right">State</div>
              </div>
              <div className="divide-y divide-white/10">
                {data.repos.map((repo) => {
                  const meta = statusMeta(repo.status);
                  const latestRun = repo.github?.latestRun;
                  const smokeWorst = statusMeta(repo.smokes.some((smoke) => smoke.status === 'critical') ? 'critical' : repo.smokes.some((smoke) => smoke.status === 'warning') ? 'warning' : repo.smokes.length > 0 ? 'healthy' : 'unknown');
                  return (
                    <div key={repo.fullName} className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr_0.6fr] gap-3 px-4 py-3 text-[13px]">
                      <div style={{ minWidth: 0 }}>
                        <div className="truncate font-semibold text-slate-100">{repo.name}</div>
                        <div className="mt-1 font-mono text-[11px] text-slate-500">{repo.fullName}</div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        {latestRun?.url ? (
                          <a href={latestRun.url} target="_blank" rel="noreferrer" className="truncate text-[var(--accent)]">{latestRun.name}</a>
                        ) : (
                          <div className="truncate text-slate-400">{latestRun?.name ?? 'No run loaded'}</div>
                        )}
                        <div className="mt-1 truncate text-[11px] text-slate-500">{latestRun?.title || repo.productionBranch}</div>
                      </div>
                      <div>
                        <div className="text-slate-200">{repo.github?.dependabot.open ?? 0} open</div>
                        <div className="mt-1 text-[11px] text-slate-500">{repo.github?.dependabot.worstSeverity ?? 'none'}</div>
                      </div>
                      <div>
                        <StatusBadge label={smokeWorst.label} status={smokeWorst.badge} />
                        <div className="mt-1 text-[11px] text-slate-500">{repo.smokes.map((smoke) => `${smoke.httpStatus ?? 'err'} ${smoke.latencyMs}ms`).join(', ') || 'not configured'}</div>
                      </div>
                      <div className="text-right">
                        <StatusBadge label={meta.label} status={meta.badge} pulse={repo.status === 'critical'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={card + ' p-5'}>
              <div className="text-[13px] font-semibold text-slate-100">Residuals</div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {data.residuals.map((item) => (
                  <div key={item} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-[12px] leading-5 text-slate-400">{item}</div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
