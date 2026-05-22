import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../_session-auth';
import { runRemote } from '../_security-logs';

type AlertItem = { time: string; type: string; detail: string; severity: 'low' | 'medium' | 'high' };

// Parse multi-line alert blocks: timestamp line followed by bullet lines
function parseAlerts(raw: string): AlertItem[] {
  const results: AlertItem[] = [];
  let currentTime = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentTime || currentLines.length === 0) return;
    const detail = currentLines.join(' | ');
    const severity: AlertItem['severity'] =
      /ban|critical|fail2ban/i.test(detail) ? 'high' :
      /nginx|error|non-au/i.test(detail) ? 'medium' : 'low';
    const type =
      /fail2ban|ban/i.test(detail) ? 'fail2ban' :
      /ssh|Failed password/i.test(detail) ? 'ssh' :
      /nginx/i.test(detail) ? 'nginx' : 'security';
    results.push({ time: currentTime, type, detail, severity });
  };

  for (const line of raw.split('\n')) {
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:+]+)\s+(.*)$/);
    if (tsMatch && !tsMatch[2].startsWith('ERROR')) {
      flush();
      currentTime = tsMatch[1];
      currentLines = tsMatch[2].replace(/[🚨*]/g, '').trim() ? [tsMatch[2].replace(/[🚨*]/g, '').trim()] : [];
    } else if (line.startsWith('•') && currentTime) {
      currentLines.push(line.replace(/^•\s*/, '').trim());
    }
  }
  flush();
  return results;
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  try {
    const raw = runRemote('tail -n 2000 /var/log/security-alert.log 2>/dev/null').trim();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const alerts = parseAlerts(raw)
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
