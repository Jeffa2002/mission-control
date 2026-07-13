import { timingSafeEqual } from 'node:crypto';

export function isSessionAuthorized(req: Request, cookieSecret: string): boolean {
  if (!cookieSecret) return false;
  const cookieHeader = req.headers.get('cookie') || '';
  const authCookie = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith('mc_auth='));
  const authValue = authCookie ? authCookie.split('=').slice(1).join('=') : '';
  if (authValue.length !== cookieSecret.length) return false;
  try { return timingSafeEqual(Buffer.from(authValue, 'utf8'), Buffer.from(cookieSecret, 'utf8')); } catch { return false; }
}
