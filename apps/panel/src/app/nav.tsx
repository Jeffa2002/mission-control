// nav.tsx — re-exports the canonical ROUTES constant from ops-ui.
// The old Nav component has been replaced by the AppShell sidebar.
// This file is kept for any lingering imports during migration.

export { ROUTES } from '../components/ops-ui';
export type { Route, RouteGroup } from '../components/ops-ui';
