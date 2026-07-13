import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../../_session-auth';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  return NextResponse.json({
    ok: false,
    error: 'Raw agent activity is disabled. Use /api/agents/status for the allowlisted current-work projection.',
  }, { status: 410 });
}
