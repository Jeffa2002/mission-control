import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../_session-auth';
import { NETWORK_DB_PATHS, openNetworkDb } from '../_network-db';

const RANGES: Record<string, number> = { day: 1, week: 7, month: 31, year: 366 };
const LABELS: Record<string, string> = {
  bazza: 'Bazza', prod: 'Prod', crm8: 'CRM8', shazza: 'Shazza',
  sec1: 'Sec1', 'secspy-lab01': 'SecSpy Lab', 'backup-melb': 'Backup Melbourne',
};

function query(sql: string) {
  for (const path of NETWORK_DB_PATHS) {
    let db: ReturnType<typeof openNetworkDb> | null = null;
    try {
      db = openNetworkDb(path);
      return db.prepare(sql).all() as Array<Record<string, unknown>>;
    } catch {}
    finally { try { db?.close(); } catch {} }
  }
  return [];
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const range = url.searchParams.get('range') ?? 'week';
  if (!(range in RANGES)) return NextResponse.json({ ok: false, error: `Invalid range: ${range}` }, { status: 400 });
  const since = new Date(Date.now() - RANGES[range] * 86_400_000).toISOString();

  const transitions = query(`
    WITH ordered AS (
      SELECT ts,node_id,reachable,packet_loss,ping_ms,
             LAG(reachable) OVER (PARTITION BY node_id ORDER BY ts) AS previous
      FROM ping_history WHERE ts >= '${since}'
    )
    SELECT ts,node_id,reachable,packet_loss,ping_ms
    FROM ordered WHERE previous IS NOT NULL AND reachable <> previous
    ORDER BY ts DESC LIMIT 100
  `).map(row => ({
    ts: String(row.ts),
    node: String(row.node_id),
    kind: Number(row.reachable) ? 'recovery' : 'outage',
    severity: Number(row.reachable) ? 'healthy' : 'critical',
    title: `${LABELS[String(row.node_id)] ?? row.node_id} ${Number(row.reachable) ? 'recovered' : 'unreachable'}`,
    detail: Number(row.reachable)
      ? `Ping response restored${row.ping_ms == null ? '' : ` at ${row.ping_ms} ms`}.`
      : `No ping response; observed packet loss ${Number(row.packet_loss ?? 100).toFixed(0)}%.`,
  }));

  const speedTests = query(`
    SELECT ts,node_id,mbps_send,mbps_recv,rtt_ms,retransmits
    FROM iperf_history WHERE ts >= '${since}'
    ORDER BY ts DESC LIMIT 100
  `).map(row => ({
    ts: String(row.ts),
    node: String(row.node_id),
    kind: 'speed-test',
    severity: Number(row.retransmits ?? 0) > 0 ? 'warning' : 'info',
    title: `${LABELS[String(row.node_id)] ?? row.node_id} speed test`,
    detail: `${Number(row.mbps_send ?? 0).toFixed(0)} Mbps send · ${Number(row.mbps_recv ?? 0).toFixed(0)} Mbps receive · ${Number(row.rtt_ms ?? 0).toFixed(1)} ms RTT · ${Number(row.retransmits ?? 0)} retransmits.`,
  }));

  const events = [...transitions, ...speedTests]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 100);

  return NextResponse.json({ range, since, events, eventCount: events.length });
}
