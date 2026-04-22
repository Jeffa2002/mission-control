'use client';

import { AppShell, SectionTitle } from '../../components/ops-ui';
import { RecentActions } from '../components';

export default function ActionsPage() {
  return (
    <AppShell>
      <SectionTitle title="Audit Log" subtitle="Live forensic record of all actions" />
      <RecentActions />
    </AppShell>
  );
}
