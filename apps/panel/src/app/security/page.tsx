'use client';

import { AppShell, SectionTitle, card } from '../../components/ops-ui';
import { AlertTriageCard, DrillDownDrawer, ThreatTimeline } from '../../components/security-components';
import { AttackMap } from '../../components/AttackMap';
import { useState } from 'react';

export default function SecurityPage() {
  const [open, setOpen] = useState(false);
  return <AppShell><div className="space-y-8"><SectionTitle title="Threats" subtitle="Triage queue and source intelligence" /><div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><ThreatTimeline /><div className={card + ' p-5 space-y-3'}><AlertTriageCard title="SSH brute force against prod" host="prod" severity="critical" evidence={["source IP recurring", "root targeted", "44 failures in 8m"]} /><AlertTriageCard title="Suspicious path scanning" host="bazza" severity="warning" evidence={["/.env", "/wp-admin", "non-browser user agent"]} /></div></div><div className="grid gap-4 xl:grid-cols-2"><div className={card + ' p-5'}><SectionTitle title="Geo visualization" /><AttackMap /></div><div className={card + ' p-5'}><SectionTitle title="Top IPs" /><div className="space-y-2 text-[13px]"><button className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10" onClick={()=>setOpen(true)}>185.193.*.* · 44 hits · prod</button><div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">94.102.*.* · 18 hits · bazza</div><div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">45.83.*.* · 11 hits · mixed</div></div></div></div><DrillDownDrawer open={open} title="IP drill-down: 185.193.*.*" items={["Appeared in 44 failed SSH logins", "Touched /root and /etc/ssh", "Related users: root", "Related host: prod"]} onClose={()=>setOpen(false)} /></div></AppShell>;
}
