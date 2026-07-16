import { createHmac, timingSafeEqual } from 'node:crypto';

type SessionPayload = { user: string; nonce: string; iat: number; exp: number };

function signature(value: string, secret: string) {
  return createHmac('sha256', secret).update(`mission-control-session:v1:${value}`).digest('base64url');
}

export function issueSessionToken(user: string, secret: string, nonce: string, now = Date.now()) {
  if (!secret) throw new Error('session signing secret is missing');
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { user, nonce, iat, exp: iat + 8 * 60 * 60 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): SessionPayload | null {
  if (!secret || !token) return null;
  const [encoded, supplied, extra] = token.split('.');
  if (!encoded || !supplied || extra) return null;
  const expected = signature(encoded, secret);
  if (supplied.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    const current = Math.floor(now / 1000);
    if (!payload.user || !payload.nonce || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
    if (payload.iat > current + 60 || payload.exp <= current || payload.exp - payload.iat > 8 * 60 * 60) return null;
    return payload;
  } catch { return null; }
}

export function isSessionAuthorized(req: Request, cookieSecret: string): boolean {
  const cookieHeader = req.headers.get('cookie') || '';
  const authCookie = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith('mc_auth='));
  const authValue = authCookie ? authCookie.split('=').slice(1).join('=') : '';
  return Boolean(verifySessionToken(authValue, cookieSecret));
}
