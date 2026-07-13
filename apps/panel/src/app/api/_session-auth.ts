import { NextResponse } from 'next/server';
import { isSessionAuthorized } from './_session-auth-core';

/**
 * Session cookie auth guard for API routes.
 * Reads `mc_auth` cookie from the request and validates it against
 * the `MISSION_COOKIE_SECRET` env var using a timing-safe comparison.
 *
 * Returns a 401 NextResponse if auth fails, or null if auth is OK.
 */
export function requireSessionAuth(req: Request): NextResponse | null {
  if (!isSessionAuthorized(req, process.env.MISSION_COOKIE_SECRET || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
