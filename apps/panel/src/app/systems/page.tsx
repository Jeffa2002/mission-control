'use client';

import { AppShell, SectionTitle, card } from '../../components/ops-ui';
import { BaselineIndicator, SystemHealthCard } from '../../components/security-components';

export default function SystemsPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <SectionTitle title="Systems" subtitle="Host health and anomaly deltas" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SystemHealthCard host="bazza" state="healthy" summary="Normal host health" anomalies={["memory within band", "auth stable"]} />
          <SystemHealthCard host="prod" state="degraded" summary="Drift from baseline" anomalies={["+38% auth failures", "disk IO 2.1× baseline"]} />
          <SystemHealthCard host="bazza" state="stale" summary="Agent check-in stale" anomalies={["last heartbeat 12m ago", "connectivity check needed"]} />
        </div>
        <div className={card + ' p-5'}>
          <SectionTitle title="Baseline vs anomaly" />
          <div className="grid gap-3 md:grid-cols-3">
            <BaselineIndicator state="normal" reason="CPU 4% within baseline" />
            <BaselineIndicator state="watch" reason="Memory trending high" />
            <BaselineIndicator state="alert" reason="Auth failures 2.1× baseline" />
          </div>
        </div>
        <div className={card + ' p-5'}>
          <SectionTitle title="Systems table" />
          <div className="grid gap-2 text-[13px]">
            <div className="grid grid-cols-[1fr_120px_160px_1fr] border-b border-white/10 pb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              <div>Host</div><div>Status</div><div>Last check</div><div>Notes</div>
            </div>
            <div className="grid grid-cols-[1fr_120px_160px_1fr] py-2"><div>prod</div><div>degraded</div><div>20s ago</div><div>auth spike + disk IO</div></div>
            <div className="grid grid-cols-[1fr_120px_160px_1fr] py-2"><div>bazza</div><div>healthy</div><div>18s ago</div><div>stable baseline</div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
