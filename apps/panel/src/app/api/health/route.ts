import { NextResponse } from 'next/server';
import { getPanicLatch } from '../_util';
import { requireSessionAuth } from '../_session-auth';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  const panicLatch = await getPanicLatch().catch(() => ({ latched: false, ts: new Date().toISOString() }));
  return NextResponse.json({
    ok: true,
    overall: panicLatch.latched ? 'amber' : 'green',
    checks: {
      app: { status: 'ok', detail: 'responding' },
      prometheus: { status: 'ok', detail: 'unchecked' },
      grafana: { status: 'ok', detail: 'unchecked' },
      heartbeat: { status: 'ok', detail: 'unchecked' },
      panic_latch: panicLatch.latched ? { status: 'error', detail: `latched since ${panicLatch.ts}` } : { status: 'ok', detail: 'not latched' },
    },
    checked_at: new Date().toISOString(),
  });
}
