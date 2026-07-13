/**
 * GET /api/network/history
 *
 * Returns time-series ping or iperf data for a node from network-history.db
 * Query params:
 *   node   - node_id: prod, crm8, shazza, backup-melb, bazza
 *   range  - day | week | month | year (default: week)
 *   metric - ping | iperf (default: ping)
 */

import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { requireSessionAuth } from '../../_session-auth';

const DB_PATHS = [
  process.env.NETWORK_HISTORY_DB,
  '/workspace/mission-control/network-history.db',
  '/workspace-data/mission-control/network-history.db',
  '/agent-data/network-history.db',
].filter(Boolean) as string[];

type Range = 'day' | 'week' | 'month' | 'year';
type Metric = 'ping' | 'iperf';

const VALID_NODES = new Set(['prod', 'crm8', 'shazza', 'backup-melb', 'bazza', 'sec1', 'secspy-lab01']);
const VALID_RANGES = new Set<Range>(['day', 'week', 'month', 'year']);
const VALID_METRICS = new Set<Metric>(['ping', 'iperf']);

function sinceIso(range: Range): string {
  const now = new Date();
  switch (range) {
    case 'day':   now.setDate(now.getDate() - 1); break;
    case 'week':  now.setDate(now.getDate() - 7); break;
    case 'month': now.setMonth(now.getMonth() - 1); break;
    case 'year':  now.setFullYear(now.getFullYear() - 1); break;
  }
  return now.toISOString();
}

function groupBy(range: Range): string {
  // SQLite strftime format for bucketing
  switch (range) {
    case 'day':   return '%Y-%m-%dT%H:00:00Z'; // hourly
    case 'week':  return '%Y-%m-%dT%H:00:00Z'; // hourly
    case 'month': return '%Y-%m-%dT00:00:00Z'; // daily
    case 'year':  return '%Y-%m-%dT00:00:00Z'; // daily
  }
}

function queryDb(sql: string): unknown[] {
  for (const dbPath of DB_PATHS) {
    try {
      const out = execFileSync('sqlite3', ['-json', dbPath, sql], {
        timeout: 10_000,
        encoding: 'utf8',
      });
      return out.trim() ? JSON.parse(out) : [];
    } catch {}
  }
  return [];
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const node = url.searchParams.get('node') ?? 'prod';
  const range = url.searchParams.get('range') ?? 'week';
  const metric = url.searchParams.get('metric') ?? 'ping';

  if (!VALID_NODES.has(node)) {
    return NextResponse.json({ ok: false, error: `Invalid node: ${node}` }, { status: 400 });
  }
  if (!VALID_RANGES.has(range as Range)) {
    return NextResponse.json({ ok: false, error: `Invalid range: ${range}` }, { status: 400 });
  }
  if (!VALID_METRICS.has(metric as Metric)) {
    return NextResponse.json({ ok: false, error: `Invalid metric: ${metric}` }, { status: 400 });
  }

  const safeRange = range as Range;
  const safeMetric = metric as Metric;
  const since  = sinceIso(safeRange);
  const bucket = groupBy(safeRange);

  if (safeMetric === 'ping') {
    const rows = queryDb(
      `SELECT strftime('${bucket}', ts) AS bucket, ROUND(AVG(ping_ms),2) AS value
       FROM ping_history
       WHERE node_id = '${node}' AND ts >= '${since}'
       GROUP BY bucket ORDER BY bucket ASC`
    ) as Array<{ bucket: string; value: number }>;

    return NextResponse.json({
      node,
      range: safeRange,
      metric: 'ping',
      points: rows.map(r => ({ ts: r.bucket, value: r.value })),
    });
  }

  // iperf
  const rows = queryDb(
    `SELECT strftime('${bucket}', ts) AS bucket,
            ROUND(AVG(mbps_send),2) AS send,
            ROUND(AVG(mbps_recv),2) AS recv,
            ROUND(AVG(rtt_ms),2)   AS rtt
     FROM iperf_history
     WHERE node_id = '${node}' AND ts >= '${since}'
     GROUP BY bucket ORDER BY bucket ASC`
  ) as Array<{ bucket: string; send: number; recv: number; rtt: number }>;

  return NextResponse.json({
    node,
    range: safeRange,
    metric: 'iperf',
    points: rows.map(r => ({ ts: r.bucket, value: r.send, recv: r.recv, rtt: r.rtt })),
  });
}
