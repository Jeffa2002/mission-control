import { NextResponse } from 'next/server';
import { getPanicLatch } from '../_util';
import { requireSessionAuth } from '../_session-auth';

const SHAZZA_URL = process.env.SHAZZA_HEALTH_URL || 'https://shazza.taile9fed9.ts.net/health';
const TIMEOUT_MS = 5_000;

async function getShazzaTemp(): Promise<number | null> {
  try {
    const res = await Promise.race([
      fetch(SHAZZA_URL, { cache: 'no-store' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.temperature?.celsius ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const [panicLatch, shazzaTemp] = await Promise.all([
    getPanicLatch().catch(() => ({ latched: false, ts: new Date().toISOString() })),
    getShazzaTemp(),
  ]);

  const CPU_TEMP_CRITICAL = 90;
  const tempCritical = shazzaTemp !== null && shazzaTemp >= CPU_TEMP_CRITICAL;

  const checks: Record<string, { status: string; detail?: string }> = {
    app: { status: 'ok', detail: 'responding' },
    prometheus: { status: 'unknown', detail: 'unchecked' },
    grafana: { status: 'unknown', detail: 'unchecked' },
    heartbeat: { status: 'unknown', detail: 'unchecked' },
    panic_latch: panicLatch.latched
      ? { status: 'error', detail: `latched since ${panicLatch.ts}` }
      : { status: 'ok', detail: 'not latched' },
  };

  if (tempCritical) {
    checks['shazza_temp'] = {
      status: 'error',
      detail: `CPU temperature critical: ${shazzaTemp}°C`,
    };
  } else if (shazzaTemp !== null && shazzaTemp >= 80) {
    checks['shazza_temp'] = {
      status: 'degraded',
      detail: `CPU temperature elevated: ${shazzaTemp}°C`,
    };
  }

  const hasError = Object.values(checks).some((c) => c.status === 'error');
  const hasDegraded = Object.values(checks).some((c) => c.status === 'degraded');
  const overall = hasError ? 'red' : hasDegraded ? 'amber' : 'green';

  return NextResponse.json({
    ok: !hasError,
    overall,
    checks,
    checked_at: new Date().toISOString(),
  });
}
