import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { aggregateOverview, SettledSource } from './overview-model';

/**
 * Aggregate overview endpoint.
 *
 * Fans out to the nine telemetry sources the overview brief needs, server-side,
 * and returns one payload with honest partial-failure semantics. The browser
 * makes a single request instead of a nine-way waterfall; each source keeps an
 * independent timeout so one slow probe cannot stall the whole brief.
 *
 * Runs inside the standalone Next server, so upstream calls go back to the
 * local listener with the caller's session cookie forwarded for auth.
 */

const BASE = process.env.PANEL_INTERNAL_BASE ?? 'http://127.0.0.1:3020';
const SOURCE_TIMEOUT_MS = 12_000;

const SOURCES = [
  ['health', '/api/health'],
  ['agents', '/api/agents/status'],
  ['apps', '/api/effectx'],
  ['deploys', '/api/deploys'],
  ['activity', '/api/activity?limit=24'],
  ['alerts', '/api/alerts'],
  ['bazza', '/api/bazza'],
  ['shazza', '/api/shazza'],
  ['network', '/api/network'],
] as const;

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const cookie = req.headers.get('cookie') ?? '';
  const headers = cookie ? { cookie } : {};

  const results = await Promise.allSettled(
    SOURCES.map(async ([, path]) => {
      const res = await fetch(`${BASE}${path}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`${path} returned ${res.status}`);
      return res.json();
    }),
  );

  const settled: SettledSource[] = SOURCES.map(([key], index) => [
    key,
    results[index],
  ]);
  const { data, failures } = aggregateOverview(settled);

  return NextResponse.json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    partial: failures.length > 0,
    failures,
    data,
  });
}
