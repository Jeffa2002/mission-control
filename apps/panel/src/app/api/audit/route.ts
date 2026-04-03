/**
 * GET  /api/audit?limit=50  — recent audit log entries (legacy endpoint)
 * POST /api/audit            — append an audit entry
 *
 * Canonical endpoint is /api/actions (same data source).
 */

import { NextResponse } from 'next/server';
import { audit, readAuditLog } from '../_util';
import { requireSessionAuth } from '../_session-auth';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || '50')));
    const items = await readAuditLog(limit);
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}

export async function POST(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'external');
    const detail = String(body.detail || '');
    const { actor, idempotency_key, result, error, ip, ...rest } = body;

    await audit(action, detail, {
      actor: actor ? String(actor) : 'session',
      idempotency_key: idempotency_key ? String(idempotency_key) : undefined,
      result: result ? String(result) : undefined,
      error: error ? String(error) : undefined,
      ip: ip ? String(ip) : undefined,
      ...rest,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
