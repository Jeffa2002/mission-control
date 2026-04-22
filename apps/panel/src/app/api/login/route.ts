import { NextResponse } from 'next/server';
import { audit } from '../_util';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Max 10 attempts per IP per 5 minutes

interface RateBucket {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_MAX_ATTEMPTS = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    // New window
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  bucket.count += 1;
  if (bucket.count > RATE_MAX_ATTEMPTS) {
    return true;
  }
  return false;
}

// Periodically clean up expired buckets
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateLimitMap.entries()) {
    if (now - bucket.windowStart > RATE_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, 60_000);

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // Rate limit check
  if (isRateLimited(ip)) {
    return new NextResponse('Too many login attempts. Try again in 5 minutes.', { status: 429 });
  }

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
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
