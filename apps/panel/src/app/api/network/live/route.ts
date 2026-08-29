import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../_session-auth';
import { NETWORK_DB_PATHS, openNetworkDb } from '../_network-db';

/**
 * GET /api/network/live
 *
 * Returns the most recent live per-node throughput (bytes/sec on the tailscale
 * interface), sampled by scripts/collect-live-throughput.sh into the
 * live_throughput table. This is genuine traffic flow (bytes actually moving),
 * as opposed to /api/network which reflects periodic iperf capacity tests.
 *
 * Response:
 *   {
 *     ok: true,
 *     measuredAt: string | null,        // ts of the latest sample batch
 *     nodes: { [node_id]: { rxBps, txBps, mbps, iface, ts } },
 *     stale: boolean                     // true if newest sample older than STALE_MS
 *   }
 */

const STALE_MS = 150_000; // collector and prod sync both run every minute

function query(sql: string): Array<Record<string, unknown>> {
  for (const path of NETWORK_DB_PATHS) {
    let db: ReturnType<typeof openNetworkDb> | null = null;
    try {
      db = openNetworkDb(path);
      return db.prepare(sql).all() as Array<Record<string, unknown>>;
    } catch {
      /* try next path */
    } finally {
      try {
        db?.close();
      } catch {
        /* ignore */
      }
    }
  }
  return [];
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  // Latest sample per node (rows share a batch ts, but be robust to skew).
  const rows = query(`
    WITH ranked AS (
      SELECT node_id, iface, rx_bps, tx_bps, ts,
             ROW_NUMBER() OVER (PARTITION BY node_id ORDER BY ts DESC) AS rn
      FROM live_throughput
    )
    SELECT node_id, iface, rx_bps, tx_bps, ts FROM ranked WHERE rn = 1
  `);

  const nodes: Record<
    string,
    { rxBps: number; txBps: number; mbps: number; iface: string | null; ts: string }
  > = {};
  let newest = 0;

  for (const row of rows) {
    const id = String(row.node_id);
    const rxBps = Number(row.rx_bps) || 0;
    const txBps = Number(row.tx_bps) || 0;
    const ts = String(row.ts);
    // Combined throughput in Mbps (bits/sec / 1e6), reusing the same unit the
    // flow-animation helpers already expect from iperf data.
    const mbps = +(((rxBps + txBps) * 8) / 1e6).toFixed(3);
    nodes[id] = { rxBps, txBps, mbps, iface: row.iface ? String(row.iface) : null, ts };
    const t = Date.parse(ts);
    if (!Number.isNaN(t) && t > newest) newest = t;
  }

  const measuredAt = newest ? new Date(newest).toISOString() : null;
  const stale = newest ? Date.now() - newest > STALE_MS : true;

  return NextResponse.json(
    { ok: true, measuredAt, stale, nodes },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
