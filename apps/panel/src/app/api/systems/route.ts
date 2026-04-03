import { NextResponse } from 'next/server';
import { sh } from '../_util';
import { requireSessionAuth } from '../_session-auth';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  try {
    const ps = await sh('docker', ['ps', '--format', 'table {{.Names}}\t{{.Status}}\t{{.Image}}']);
    return NextResponse.json({ ok: true, ps });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
