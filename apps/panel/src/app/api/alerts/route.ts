import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';

const PROM = 'http://mission-prometheus:9090';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  try {
    const res = await fetch(`${PROM}/api/v1/alerts`, { cache: 'no-store' });
    const j = await res.json();
    return NextResponse.json(j);
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
