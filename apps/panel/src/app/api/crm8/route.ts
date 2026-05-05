import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';

const CRM8_HEALTH_URL = process.env.CRM8_HEALTH_URL || 'https://crm8.effectx.com.au/api/health';
const TIMEOUT_MS = 8_000;

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();

  try {
    const res = await Promise.race([
      fetch(CRM8_HEALTH_URL, { cache: 'no-store' }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
      ),
    ]);

    if (!res.ok) {
      // HTTP error means server is reachable but returned an error code
      const isAuthError = res.status === 401 || res.status === 403;
      return NextResponse.json({
        ok: false,
        reachable: true,
        service: 'crm8',
        label: 'CRM8',
        error: isAuthError ? `Auth error (${res.status})` : `Health check failed (HTTP ${res.status})`,
        checkedAt,
      });
    }

    const data = await res.json();
    return NextResponse.json({
      ...data,
      reachable: true,
      checkedAt,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      service: 'crm8',
      label: 'CRM8',
      error: String(err?.message || err),
      checkedAt,
    });
  }
}
