import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/**
 * Session cookie auth guard for API routes.
 * Reads `mc_auth` cookie from the request and validates it against
 * the `MISSION_COOKIE_SECRET` env var using a timing-safe comparison.
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

  // Timing-safe comparison: same byte length required
  if (authValue.length !== cookieSecret.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const a = Buffer.from(authValue,     'utf8');
    const b = Buffer.from(cookieSecret,  'utf8');
    if (!timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
