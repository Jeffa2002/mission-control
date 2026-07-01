'use client';

import { useEffect, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, muted } from '../../components/ops-ui';

interface Deploy {
  id: string;
  app: string;
  repo: string;
  commit: string;
  commitMsg: string;
  branch: string;
  status: 'success' | 'failure' | 'running';
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationS?: number;
  runUrl?: string;
}

interface DeployFeedMeta {
  ok: boolean;
  source: 'github-actions' | 'deploy-log';
  count: number;
  warning?: string;
}

function statusColor(s: Deploy['status']) {
  if (s === 'success') return 'var(--sev-healthy)';
  if (s === 'failure') return 'var(--sev-critical)';
  return 'var(--sev-warning)';
}

function statusMeta(s: Deploy['status']): { label: string; status: 'healthy' | 'warning' | 'critical'; pulse?: boolean } {
  if (s === 'success') return { label: 'Success', status: 'healthy' };
  if (s === 'failure') return { label: 'Failed', status: 'critical' };
  return { label: 'Running', status: 'warning', pulse: true };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DeploysPage() {
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [feedMeta, setFeedMeta] = useState<DeployFeedMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Deploy['status']>('all');
  const [workflowFilter, setWorkflowFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    fetch('/api/deploys', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        setDeploys(d.deploys ?? []);
        setFeedMeta({ ok: Boolean(d.ok), source: d.source ?? 'deploy-log', count: Number(d.count ?? 0), warning: d.warning });
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  };

  useEffect(() => {
    load();
  }, []);

  const workflows = Array.from(new Set(deploys.map((deploy) => deploy.app).filter(Boolean))).sort();
  const filteredDeploys = deploys.filter((deploy) => {
    const statusOk = statusFilter === 'all' || deploy.status === statusFilter;
    const workflowOk = workflowFilter === 'all' || deploy.app === workflowFilter;
    return statusOk && workflowOk;
  });
  const failedCount = deploys.filter((deploy) => deploy.status === 'failure').length;
  const runningCount = deploys.filter((deploy) => deploy.status === 'running').length;

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="Deploys"
          subtitle={feedMeta?.source === 'github-actions' ? 'Live GitHub Actions deployment and release state' : 'Local deploy log fallback'}
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        {feedMeta && (
          <div className={card + ` border px-5 py-4 ${feedMeta.source === 'github-actions' ? 'border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.05)]' : 'border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.07)]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-slate-100">
                  Source: {feedMeta.source === 'github-actions' ? 'GitHub Actions API' : 'local deploy log'}
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  {feedMeta.source === 'github-actions'
                    ? `${feedMeta.count} workflow run${feedMeta.count === 1 ? '' : 's'} loaded from GitHub.`
                    : `GitHub read failed; showing ${feedMeta.count} local deploy log entr${feedMeta.count === 1 ? 'y' : 'ies'}.`}
                </div>
              </div>
              <StatusBadge label={feedMeta.source === 'github-actions' ? 'Live' : 'Fallback'} status={feedMeta.source === 'github-actions' ? 'healthy' : 'warning'} />
            </div>
            {feedMeta.warning && <div className="mt-3 truncate font-mono text-[11px] text-[var(--sev-warning)]" title={feedMeta.warning}>{feedMeta.warning}</div>}
          </div>
        )}

        {error && (
          <div className={card + ' border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.07)] p-5'}>
            <div className="text-sm font-semibold text-[var(--sev-critical)]">Could not load deploy data</div>
            <div className={muted + ' mt-1'}>{error}</div>
          </div>
        )}

        {loading && deploys.length === 0 && (
          <div className={card + ' p-8 text-center text-sm text-slate-400'}>Loading deployment timeline...</div>
        )}

        {!loading && deploys.length === 0 && (
          <div className={card + ' p-10 text-center'}>
            <div className="mx-auto mb-4 h-10 w-10 rounded-xl border border-[rgba(103,213,255,0.22)] bg-[rgba(103,213,255,0.06)]" />
            <div className="text-[15px] font-semibold text-slate-100">No deploys recorded yet</div>
            <div className="mt-1 text-[13px] text-slate-400">Deploys appear here after GitHub Actions runs.</div>
          </div>
        )}

        {deploys.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-white/10 bg-[var(--bg-2)] px-3 text-[12px] font-semibold text-slate-200 outline-none"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | Deploy['status'])}
                aria-label="Filter by deploy status"
              >
                <option value="all">All states</option>
                <option value="success">Success</option>
                <option value="running">Running</option>
                <option value="failure">Failed</option>
              </select>
              <select
                className="h-9 max-w-[260px] rounded-md border border-white/10 bg-[var(--bg-2)] px-3 text-[12px] font-semibold text-slate-200 outline-none"
                value={workflowFilter}
                onChange={(event) => setWorkflowFilter(event.target.value)}
                aria-label="Filter by workflow"
              >
                <option value="all">All workflows</option>
                {workflows.map((workflow) => (
                  <option key={workflow} value={workflow}>{workflow}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em]">
              {runningCount > 0 && <span className="rounded border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] px-2 py-1 text-[var(--sev-warning)]">{runningCount} running</span>}
              {failedCount > 0 && <span className="rounded border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-2 py-1 text-[var(--sev-critical)]">{failedCount} failed</span>}
            </div>
          </div>
        )}

        {deploys.length > 0 && filteredDeploys.length === 0 && (
          <div className={card + ' p-8 text-center text-sm text-slate-400'}>No deploys match the active filters.</div>
        )}

        {filteredDeploys.length > 0 && (
          <div className={card + ' overflow-hidden'}>
            <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr_0.7fr] gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <div>App</div>
              <div>Commit</div>
              <div>Operator</div>
              <div>Runtime</div>
              <div className="text-right">State</div>
            </div>

            <div className="divide-y divide-white/10">
              {filteredDeploys.map(d => {
                const meta = statusMeta(d.status);
                const Row = d.runUrl ? 'a' : 'div';
                return (
                  <Row
                    key={d.id}
                    href={d.runUrl}
                    target={d.runUrl ? '_blank' : undefined}
                    rel={d.runUrl ? 'noreferrer' : undefined}
                    className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr_0.7fr] gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-white/[0.025]"
                    style={{ borderLeft: `3px solid ${statusColor(d.status)}` }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate font-semibold text-slate-100">{d.app}</div>
                        {d.status === 'failure' && <span className="shrink-0 rounded border border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.09)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--sev-critical)]">fail</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-slate-400">{d.branch}</span>
                        <span>{timeAgo(d.startedAt)}</span>
                        {d.runUrl && <span className="text-[var(--accent)]">GitHub run</span>}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="font-mono text-[12px] text-[var(--accent)]">{d.commit ? d.commit.slice(0, 7) : 'unknown'}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-500" title={d.commitMsg}>{d.commitMsg || 'No commit message'}</div>
                    </div>
                    <div className="truncate text-slate-300">{d.triggeredBy}</div>
                    <div className="font-mono text-[12px] text-slate-400">{d.durationS ? `${d.durationS}s` : '—'}</div>
                    <div className="text-right">
                      <StatusBadge label={meta.label} status={meta.status} pulse={meta.pulse} />
                    </div>
                  </Row>
                );
              })}
            </div>
          </div>
        )}

        {deploys.length > 0 && (
          <div className="text-right text-[11px] text-slate-500">
            Showing {filteredDeploys.length} of {deploys.length} deployment{deploys.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </AppShell>
  );
}
