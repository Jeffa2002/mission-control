import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { audit } from '../_util';
import { issueSessionToken } from '../_session-auth-core';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Max 10 attempts per IP per 5 minutes

interface RateBucket {
  count: number;
  windowStart: number;
}

const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_MAX_ATTEMPTS = 10;
const RATE_FILE = process.env.AUTH_RATE_FILE || '/auth-data/login-rate.json';

async function isRateLimited(ip: string): Promise<boolean> {
  const now = Date.now();
  await mkdir(RATE_FILE.slice(0, RATE_FILE.lastIndexOf('/')), { recursive: true });
  let buckets: Record<string, RateBucket> = {};
  try { buckets = JSON.parse(await readFile(RATE_FILE, 'utf8')); } catch {}
  for (const [key, bucket] of Object.entries(buckets)) {
    if (now - bucket.windowStart > RATE_WINDOW_MS) delete buckets[key];
  }
  const bucket = buckets[ip];

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    buckets[ip] = { count: 1, windowStart: now };
  } else {
    bucket.count += 1;
  }
  const tmp = `${RATE_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(buckets), { mode: 0o600 });
  await rename(tmp, RATE_FILE);
  return buckets[ip].count > RATE_MAX_ATTEMPTS;
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // nginx overwrites X-Real-IP from its trusted peer. Never trust the
  // client-controlled leftmost X-Forwarded-For value here.
  const ip = req.headers.get('x-real-ip') ?? 'unknown';

  // Rate limit check
  if (await isRateLimited(ip)) {
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
    value: issueSessionToken(user, cookieSecret, randomBytes(24).toString('base64url')),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return res;
}
