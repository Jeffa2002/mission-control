import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../_session-auth';
import { readCloudflare } from '../_cloudflare-source';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  try {
    return NextResponse.json(await readCloudflare());
  } catch (err) {
    return NextResponse.json({
      available: false,
      checkedAt: new Date().toISOString(),
      blocked24h: 0,
      windowHours: 23,
      baseline: null,
      deviation: null,
      spike: false,
      topOffenders: [],
      byZone: [],
      errors: [err instanceof Error ? err.message : 'error'],
    });
  }
}
