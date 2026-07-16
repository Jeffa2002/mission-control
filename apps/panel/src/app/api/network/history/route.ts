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
import { DatabaseSync } from 'node:sqlite';
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
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      return db.prepare(sql).all();
    } catch {}
    finally { try { db?.close(); } catch {} }
  }
  return [];
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
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
    const rows = (safeRange === 'year'
      ? queryDb(
          `SELECT bucket, ping_avg AS value, ping_min, ping_max,
                  packet_loss_avg AS loss, availability_pct AS availability, samples
           FROM ping_hourly WHERE node_id = '${node}' AND bucket >= '${since}'
           ORDER BY bucket ASC`
        )
      : queryDb(
          `SELECT strftime('${bucket}', ts) AS bucket,
                  ROUND(AVG(ping_ms),2) AS value,
                  ROUND(MIN(ping_ms),2) AS ping_min,
                  ROUND(MAX(ping_ms),2) AS ping_max,
                  ROUND(AVG(packet_loss),2) AS loss,
                  ROUND(AVG(reachable)*100,2) AS availability,
                  COUNT(*) AS samples
           FROM ping_history
           WHERE node_id = '${node}' AND ts >= '${since}'
           GROUP BY bucket ORDER BY bucket ASC`
        )) as Array<{ bucket: string; value: number | null; ping_min: number | null; ping_max: number | null; loss: number; availability: number; samples: number }>;

    const points = rows.map(r => ({ ts: r.bucket, value: r.value, min: r.ping_min, max: r.ping_max, loss: r.loss, availability: r.availability, samples: r.samples }));
    const latencies = points.flatMap(point => typeof point.value === 'number' ? [point.value] : []);
    const peaks = points.flatMap(point => typeof point.max === 'number' ? [point.max] : []);

    return NextResponse.json({
      node,
      range: safeRange,
      metric: 'ping',
      summary: {
        averageMs: average(latencies),
        maximumMs: peaks.length ? Math.max(...peaks) : null,
        packetLossPct: average(points.map(point => point.loss)),
        availabilityPct: average(points.map(point => point.availability)),
        samples: points.reduce((sum, point) => sum + Number(point.samples || 0), 0),
        latestAt: points.at(-1)?.ts ?? null,
      },
      points,
    });
  }

  // iperf
  const rows = queryDb(
    `SELECT strftime('${bucket}', ts) AS bucket,
            ROUND(AVG(mbps_send),2) AS send,
            ROUND(AVG(mbps_recv),2) AS recv,
            ROUND(AVG(rtt_ms),2)   AS rtt,
            SUM(retransmits) AS retransmits,
            COUNT(*) AS samples
     FROM iperf_history
     WHERE node_id = '${node}' AND ts >= '${since}'
     GROUP BY bucket ORDER BY bucket ASC`
  ) as Array<{ bucket: string; send: number; recv: number; rtt: number; retransmits: number; samples: number }>;

  const points = rows.map(r => ({ ts: r.bucket, value: r.send, recv: r.recv, rtt: r.rtt, retransmits: r.retransmits, samples: r.samples }));

  return NextResponse.json({
    node,
    range: safeRange,
    metric: 'iperf',
    summary: {
      averageSendMbps: average(points.map(point => point.value)),
      averageRecvMbps: average(points.map(point => point.recv)),
      averageRttMs: average(points.map(point => point.rtt)),
      retransmits: points.reduce((sum, point) => sum + Number(point.retransmits || 0), 0),
      samples: points.reduce((sum, point) => sum + Number(point.samples || 0), 0),
      latestAt: points.at(-1)?.ts ?? null,
    },
    points,
  });
}
