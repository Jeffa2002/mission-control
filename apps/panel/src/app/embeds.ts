export const GRAFANA_BASE = 'https://bazza.taile9fed9.ts.net:3000';

// UIDs are pinned in provisioning JSON in mission-control/infra/dashboards
export const DASH_UID_NODEEXP = 'nodeexp';
export const DASH_UID_DOCKMON = 'dockmon';

export function grafanaDash(uid: string, from: string = 'now-6h') {
  // kiosk=tv reduces chrome
  return `${GRAFANA_BASE}/d/${uid}?orgId=1&from=${encodeURIComponent(from)}&to=now&kiosk=tv`;
}
