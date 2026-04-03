import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    prom: {
      nodeExporterUp: null,
      cadvisorUp: null,
      prometheusUp: null,
      cpuPct: null,
      memPct: null,
    },
    ops: {
      scrapeFreshnessSec: null,
    },
  });
}
