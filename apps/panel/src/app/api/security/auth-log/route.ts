import { NextResponse } from 'next/server';
import { readFirstExisting, runRemote, safeExec } from '../_security-logs';

type AuthEvent = { ts: string; type: 'sudo' | 'ssh-accept' | 'auth-fail' | 'su'; user: string; detail: string };

function tsFromPrefix(prefix: string): string {
  return new Date(`${prefix} ${new Date().getFullYear()} UTC`).toISOString();
}

function parseLine(line: string): AuthEvent | null {
  const tsMatch = line.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s[\d:]{8})/);
  if (!tsMatch) return null;
  const ts = tsFromPrefix(tsMatch[1]);
  if (line.includes('sudo:')) {
    const user = line.match(/\s(\w+)\s*:\s*TTY=/)?.[1] ?? 'root';
    const detail = line.match(/COMMAND=(.*)$/)?.[1] ?? '';
    return { ts, type: 'sudo', user, detail };
  }
  if (line.includes('sshd') && line.includes('Accepted ')) {
    const user = line.match(/for\s+(\S+)/)?.[1] ?? 'unknown';
    const detail = line.match(/from\s+([0-9a-fA-F:.]+)/)?.[1] ?? '';
    return { ts, type: 'ssh-accept', user, detail };
  }
  if (line.includes('authentication failure') || line.includes('Failed password') || line.includes('Invalid user')) {
    const user = line.match(/user\s+(\S+)/)?.[1] ?? 'unknown';
    const detail = line;
    return { ts, type: 'auth-fail', user, detail };
  }
  if (line.includes('su:')) {
    const user = line.match(/for\s+(\S+)/)?.[1] ?? 'unknown';
    const detail = line;
    return { ts, type: 'su', user, detail };
  }
  return null;
}

export async function GET() {
  try {
    const fetchRaw = async (host: 'bazza' | 'prod'): Promise<string> => {
      if (host === 'bazza') {
        let raw = await readFirstExisting(['/host-logs/auth.log', '/var/log/auth.log']);
        if (!raw) raw = safeExec("journalctl -u ssh -u sshd --no-pager -n 2000 2>/dev/null");
        return raw;
      }
      return runRemote('journalctl _SYSTEMD_UNIT=ssh.service --since "1 hour ago" --no-pager 2>/dev/null');
    };
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const [bazzaRaw, prodRaw] = await Promise.all([fetchRaw('bazza'), fetchRaw('prod')]);
    const events = [
      ...bazzaRaw.split('\n').filter(Boolean).map(parseLine).filter((x): x is AuthEvent => x !== null).filter((e) => new Date(e.ts).getTime() >= hourAgo).map((e) => ({ ...e, host: 'bazza' as const })),
      ...prodRaw.split('\n').filter(Boolean).map(parseLine).filter((x): x is AuthEvent => x !== null).map((e) => ({ ...e, host: 'prod' as const })),
    ].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    return NextResponse.json({
      recent: events.slice(0, 100),
      sudoCount: events.filter((e) => e.type === 'sudo').length,
      failCount: events.filter((e) => e.type === 'auth-fail').length,
      sshAcceptCount: events.filter((e) => e.type === 'ssh-accept').length,
      total: events.length,
    });
  } catch {
    return NextResponse.json({ recent: [], sudoCount: 0, failCount: 0, sshAcceptCount: 0, total: 0 });
  }
}
