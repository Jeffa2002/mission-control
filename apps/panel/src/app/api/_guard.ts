/**
 * _guard.ts — HMAC authentication for machine-to-machine API endpoints.
 *
 * Callers must include an `X-Signature` header with a hex HMAC-SHA256
 * of the action name, signed with the PANEL_HMAC_SECRET env var.
 *
 * Usage:
 *   const authErr = verifyHmac(req, 'arm');
 *   if (authErr) return new NextResponse(authErr, { status: 401 });
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const HMAC_SECRET = process.env.PANEL_HMAC_SECRET ?? '';

export function verifyHmac(req: Request, action: string): string | null {
  if (!HMAC_SECRET) {
    // If no secret configured, skip HMAC check (dev mode)
    return null;
  }
  const sig = req.headers.get('x-signature') ?? '';
  if (!sig) return 'Missing X-Signature header';

  const expected = createHmac('sha256', HMAC_SECRET).update(action).digest('hex');
  try {
    const match = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    return match ? null : 'Invalid signature';
  } catch {
    return 'Invalid signature format';
  }
}

export function callerIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}
