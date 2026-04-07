'use client';

import { AppShell, SectionTitle, card } from '../../components/ops-ui';
import { AgentActivityDrawer } from '../../components/AgentActivityDrawer';
import { useState } from 'react';

export default function AppsPage() { const [open, setOpen] = useState(false); return <AppShell><div className="space-y-8"><SectionTitle title="Agents" subtitle="Monitor automation and assistant activity" /><div className="grid gap-4 md:grid-cols-3"><button className={card + ' p-5 text-left hover:bg-white/[0.03]'} onClick={()=>setOpen(true)}><div className="text-lg font-semibold">OpenClaw</div><div className="text-sm text-slate-400">working · last seen 20s ago</div></button><div className={card + ' p-5'}><div className="text-lg font-semibold">Indexer</div><div className="text-sm text-slate-400">idle · healthy</div></div><div className={card + ' p-5'}><div className="text-lg font-semibold">Triage bot</div><div className="text-sm text-slate-400">watching alerts</div></div></div><AgentActivityDrawer agent={{id:'openclaw',label:'OpenClaw',emoji:'🦞',status:'Working',lastSeen:new Date().toISOString(),currentTask:'Monitoring threats'}} open={open} onClose={()=>setOpen(false)} /></div></AppShell>; }
