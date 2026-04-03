/**
 * POST /api/panic-reset
 * Session-authenticated (browser UI) endpoint to clear the panic latch.
 *
 * The panic latch persists until explicitly reset here, even across server
 * restarts. This endpoint requires:
 *  - Valid mc_auth session cookie (enforced by middleware)
 *  - Body: { confirm: "RESET PANIC LATCH" }  (typed-phrase confirmation)
 *
 * After reset, arm/enable actions are unblocked.
 */
import { NextResponse } from 'next/server';
import { audit, getPanicLatch, setPanicLatch } from '../_util';

const REQUIRED_PHRASE = 'RESET PANIC LATCH';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';

  try {
    const body = await req.json().catch(() => ({}));
    const confirm = String(body.confirm || '');

    if (confirm !== REQUIRED_PHRASE) {
      return NextResponse.json(
        {
          ok: false,
          error: `Confirmation phrase mismatch. Expected: "${REQUIRED_PHRASE}"`,
          required_phrase: REQUIRED_PHRASE,
        },
        { status: 400 },
      );
    }

    const existing = await getPanicLatch();
    if (!existing.latched) {
      return NextResponse.json({
        ok: true,
        noop: true,
        message: 'Panic latch was not active',
      });
    }

    await setPanicLatch(false, 'manually reset via browser UI');
    await audit('panic_reset', 'panic latch cleared by operator', {
      actor: 'session',
      auth_method: 'session',
      ip,
      result: 'ok',
    });

    return NextResponse.json({ ok: true, panic_latched: false, message: 'Panic latch cleared. Arm is now permitted.' });
  } catch (e: any) {
    await audit('panic_reset_error', String(e?.message || e), {
      actor: 'session',
      auth_method: 'session',
      ip,
      result: 'error',
      error: String(e?.message || e),
    }).catch(() => {});
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}

/** GET /api/panic-reset — returns current latch state. */
export async function GET() {
  try {
    const latch = await getPanicLatch();
    return NextResponse.json({ ok: true, latch });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
