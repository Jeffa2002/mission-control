import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../_session-auth';
import { runRemote } from '../_security-logs';

type AlertItem = { time: string; type: string; detail: string; severity: 'low' | 'medium' | 'high' };

function classify(line: string): AlertItem | null {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+)\s+(.*)$/);
  if (!m) return null;
  const [, time, rest] = m;
  const severity: AlertItem['severity'] = /FAIL|ERROR|CRITICAL|BAN/i.test(rest) ? 'high' : /WARN/i.test(rest) ? 'medium' : 'low';
  const type = /fail2ban/i.test(rest) ? 'fail2ban' : /ssh/i.test(rest) ? 'ssh' : /nginx/i.test(rest) ? 'nginx' : 'security';
  return { time, type, detail: rest.trim(), severity };
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  try {
    const raw = runRemote('tail -n 2000 /var/log/security-alert.log 2>/dev/null');
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const alerts = raw
      .split('\n')
      .filter(Boolean)
      .map(classify)
      .filter((x): x is AlertItem => x !== null)
      .filter((x) => {
        const t = new Date(x.time).getTime();
        return Number.isFinite(t) && t >= cutoff;
      })
      .reverse();
    return NextResponse.json({ alerts });
  } catch (e: any) {
    return NextResponse.json({ alerts: [], error: String(e?.message || e) }, { status: 200 });
  }
}
