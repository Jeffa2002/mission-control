/**
 * GET /api/actions?limit=100 — canonical audit log endpoint
 * Proxies to the same data source as /api/audit
 */
import { NextResponse } from 'next/server';
import { readAuditLog } from '../_util';
import { requireSessionAuth } from '../_session-auth';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || '100')));
    const items = await readAuditLog(limit);
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
