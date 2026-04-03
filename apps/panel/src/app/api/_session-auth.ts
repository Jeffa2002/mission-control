import { NextResponse } from 'next/server';

/**
 * Session cookie auth guard for API routes.
 * Reads `mc_auth` cookie from the request and validates it against
 * the `MISSION_COOKIE_SECRET` env var.
 *
 * Returns a 401 NextResponse if auth fails, or null if auth is OK.
 */
export function requireSessionAuth(req: Request): NextResponse | null {
  const cookieSecret = process.env.MISSION_COOKIE_SECRET || '';
  if (!cookieSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('mc_auth='));
  const authValue = authCookie ? authCookie.split('=').slice(1).join('=') : '';

  if (authValue !== cookieSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
