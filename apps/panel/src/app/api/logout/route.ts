import { NextResponse } from 'next/server';
import { audit } from '../_util';
import { requireSessionAuth } from '../_session-auth';

export async function POST(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  await audit('logout', 'session cookie cleared', {
    actor: 'session',
    auth_method: 'session',
    ip,
    result: 'ok',
  }).catch(() => {});

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: 'mc_auth',
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}
