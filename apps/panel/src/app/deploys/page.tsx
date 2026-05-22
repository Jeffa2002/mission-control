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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    fetch('/api/deploys', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setDeploys(d.deploys ?? []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="Deploys"
          subtitle="Recent GitHub Actions deployments and release state"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

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
          <div className={card + ' overflow-hidden'}>
            <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr_0.7fr] gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <div>App</div>
              <div>Commit</div>
              <div>Operator</div>
              <div>Runtime</div>
              <div className="text-right">State</div>
            </div>

            <div className="divide-y divide-white/10">
              {deploys.map(d => {
                const meta = statusMeta(d.status);
                return (
                  <div
                    key={d.id}
                    className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr_0.7fr] gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-white/[0.025]"
                    style={{ borderLeft: `3px solid ${statusColor(d.status)}` }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="truncate font-semibold text-slate-100">{d.app}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-slate-400">{d.branch}</span>
                        <span>{timeAgo(d.startedAt)}</span>
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {deploys.length > 0 && (
          <div className="text-right text-[11px] text-slate-500">
            Showing {deploys.length} deployment{deploys.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </AppShell>
  );
}
