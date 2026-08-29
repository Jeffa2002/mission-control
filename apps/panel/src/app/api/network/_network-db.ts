import { DatabaseSync } from 'node:sqlite';

export const NETWORK_DB_PATHS = [
  process.env.NETWORK_HISTORY_DB,
  '/agent-data/network-history.db',
  '/workspace/mission-control/network-history.db',
  '/workspace-data/mission-control/network-history.db',
].filter(Boolean) as string[];

export function openNetworkDb(dbPath: string) {
  const location = dbPath.startsWith('/agent-data/')
    ? `file:${dbPath}?immutable=1`
    : dbPath;
  return new DatabaseSync(location, { readOnly: true });
}
