import { NextResponse } from 'next/server';
import { audit } from '../_util';

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const body = await req.json().catch(() => ({}));
  const user = String(body.user || '');
  const password = String(body.password || '');

  const expectedUser = process.env.MISSION_USER || 'jeff';
  const expectedPassword = process.env.MISSION_PASSWORD || '';
  const cookieSecret = process.env.MISSION_COOKIE_SECRET || '';

  if (!expectedPassword || !cookieSecret) {
    return new NextResponse('Server not configured', { status: 500 });
  }

  if (user !== expectedUser || password !== expectedPassword) {
    await audit('login_failed', `login attempt for user="${user}"`, {
      actor: user || 'unknown',
      auth_method: 'session',
      ip,
      result: 'error',
    }).catch(() => {});
    return new NextResponse('Invalid username or password', { status: 401 });
  }

  await audit('login', `user="${user}" authenticated`, {
    actor: user,
    auth_method: 'session',
    ip,
    result: 'ok',
  }).catch(() => {});

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: 'mc_auth',
    value: cookieSecret,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
