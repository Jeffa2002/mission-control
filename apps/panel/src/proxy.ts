import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from './app/api/_session-auth-core';

const PUBLIC_PATHS = ['/login', '/api/login'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths, API routes (they handle their own auth), and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const cookieSecret = process.env.MISSION_COOKIE_SECRET || '';
  const authCookie = req.cookies.get('mc_auth')?.value;

  if (!authCookie || !verifySessionToken(authCookie, cookieSecret)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
