'use client';

import { AppShell, SectionTitle } from '../../components/ops-ui';
import { LogViewer } from '../../components/security-components';

export default function ActionsPage() { return <AppShell><SectionTitle title="Audit Log" subtitle="Filterable forensic record" /><LogViewer rows={[{ts:'20:01:02',host:'prod',source:'audit',actor:'root',action:'assign',outcome:'info',detail:'incident assigned to on-call'},{ts:'20:00:31',host:'bazza',source:'agent',actor:'automation',action:'tool call',outcome:'neutral',detail:'baseline check collected'},{ts:'19:59:11',host:'prod',source:'ssh',actor:'185.193.*.*',action:'auth fail',outcome:'critical',detail:'password rejected'}]} /></AppShell>; }
