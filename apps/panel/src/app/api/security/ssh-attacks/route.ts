import { NextResponse } from 'next/server';
import { readFirstExisting, runRemote, safeExec } from '../_security-logs';

type Attack = { ts: string; ip: string; user: string };
type LabeledAttack = Attack & { host: 'bazza' | 'prod' };

type Bucket = { label: string; count: number };

function isoFromAuthLogPrefix(prefix: string): string {
  const nowYear = new Date().getFullYear();
  const d = new Date(`${prefix} ${nowYear} UTC`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parseLine(line: string): Attack | null {
  if (!line.includes('sshd') || (!line.includes('Failed password') && !line.includes('Invalid user') && !line.includes('Connection closed by invalid user'))) return null;
  const m = line.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s[\d:]{8})\s+.*sshd\[\d+\]:\s+(.*)$/);
  if (!m) return null;
  const ts = isoFromAuthLogPrefix(m[1]);
  const rest = m[2];
  const ip = (rest.match(/from\s+([0-9a-fA-F:.]+)/)?.[1] ?? rest.match(/rhost=([0-9a-fA-F:.]+)/)?.[1] ?? 'unknown');
  const user = (rest.match(/invalid user\s+(\S+)/)?.[1] ?? rest.match(/for\s+(?:invalid user\s+)?(\S+)/)?.[1] ?? 'unknown');
  return { ts, ip, user };
}

export async function GET() {
  try {
    const fetchRaw = async (host: 'bazza' | 'prod'): Promise<string> => {
      if (host === 'bazza') {
        let raw = await readFirstExisting(['/host-logs/auth.log', '/var/log/auth.log']);
        if (!raw) raw = safeExec("journalctl -u ssh -u sshd --no-pager -n 2000 2>/dev/null");
        return raw;
      }
      return runRemote('journalctl _SYSTEMD_UNIT=ssh.service --since "1 hour ago" --no-pager 2>/dev/null | grep -i "failed password\\|invalid user"');
    };

    const parseHost = async (host: 'bazza' | 'prod'): Promise<LabeledAttack[]> => {
      const raw = await fetchRaw(host);
      return raw.split('\n').filter(Boolean).map(parseLine).filter((x): x is Attack => x !== null).map((a) => ({ ...a, host }));
    };

    const [bazza, prod] = await Promise.all([parseHost('bazza'), parseHost('prod')]);
    const attacks: LabeledAttack[] = [...bazza, ...prod];
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const recentWindow = attacks.filter((a) => a.host === 'prod' || new Date(a.ts).getTime() >= hourAgo);
    const recent = recentWindow.slice().sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).slice(0, 50);
    const ipCounts = new Map<string, number>();
    for (const a of attacks) ipCounts.set(a.ip, (ipCounts.get(a.ip) ?? 0) + 1);
    const topIPs = [...ipCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count }));
    const buckets: Bucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const end = now - i * 5 * 60 * 1000;
      const start = end - 5 * 60 * 1000;
      const count = recentWindow.filter((a) => {
        const t = new Date(a.ts).getTime();
        return t >= start && t < end;
      }).length;
      const label = new Date(end).toISOString().slice(11, 16);
      buckets.push({ label, count });
    }
    return NextResponse.json({ total: recentWindow.length, recent, topIPs, buckets });
  } catch {
    return NextResponse.json({ total: 0, recent: [], topIPs: [], buckets: [] });
  }
}
