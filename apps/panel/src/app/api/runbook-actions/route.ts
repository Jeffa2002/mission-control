import { NextResponse } from 'next/server';
import { audit } from '../_util';
import { requireSessionAuth } from '../_session-auth';

const ACTIONS: Record<string, { label: string; next: string; severity: 'info' | 'warning' }> = {
  open_incident: {
    label: 'Open incident runbook',
    next: 'Incident response intent recorded. Review the incident queue and export evidence bundle if needed.',
    severity: 'warning',
  },
  capture_diagnostics: {
    label: 'Capture diagnostics',
    next: 'Diagnostics capture intent recorded. Use incident bundle exports for the current evidence window.',
    severity: 'info',
  },
  notify_team: {
    label: 'Notify team',
    next: 'Team notification intent recorded. External messaging is intentionally not sent by this endpoint.',
    severity: 'warning',
  },
  archive_memory: {
    label: 'Archive memory',
    next: 'Memory archive intent recorded. Review the Memory surface before committing long-term notes.',
    severity: 'info',
  },
  review_audit_trail: {
    label: 'Review audit trail',
    next: 'Audit review intent recorded. Continue from the Audit Log surface.',
    severity: 'info',
  },
};

export async function POST(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const source = String(body.source || 'mission_control');
    const meta = ACTIONS[action];

    if (!meta) {
      return NextResponse.json({ ok: false, error: 'Unknown runbook action' }, { status: 400 });
    }

    await audit(`runbook_${action}`, meta.label, {
      actor: 'session',
      auth_method: 'session',
      ip,
      source,
      result: 'ok',
      severity: meta.severity,
      mode: 'intent_only',
    });

    return NextResponse.json({
      ok: true,
      action,
      label: meta.label,
      next: meta.next,
      mode: 'intent_only',
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    await audit('runbook_action_error', String(e?.message || e), {
      actor: 'session',
      auth_method: 'session',
      ip,
      result: 'error',
      error: String(e?.message || e),
    }).catch(() => {});
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
