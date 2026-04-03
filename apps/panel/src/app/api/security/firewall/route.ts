import { NextResponse } from 'next/server';
import { readFirstExisting, runRemote, safeExec } from '../_security-logs';

type Event = { ts: string; src: string; dst: string; dpt: string; proto: string };

function parseEvent(line: string): Event | null {
  if (!line.includes('UFW BLOCK')) return null;
  const tsMatch = line.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s[\d:]{8})/);
  const src = line.match(/SRC=([0-9a-fA-F:.]+)/)?.[1] ?? 'unknown';
  const dst = line.match(/DST=([0-9a-fA-F:.]+)/)?.[1] ?? 'unknown';
  const dpt = line.match(/DPT=(\d+)/)?.[1] ?? 'unknown';
  const proto = line.match(/PROTO=([A-Za-z0-9]+)/)?.[1] ?? 'unknown';
  const ts = tsMatch ? new Date(`${tsMatch[1]} ${new Date().getFullYear()} UTC`).toISOString() : new Date().toISOString();
  return { ts, src, dst, dpt, proto };
}

export async function GET() {
  try {
    const fetchRaw = async (host: 'bazza' | 'prod'): Promise<string> => {
      if (host === 'bazza') {
        let raw = await readFirstExisting(['/host-logs/kern.log', '/var/log/kern.log']);
        if (!raw) raw = safeExec('journalctl -k --no-pager -n 4000 2>/dev/null');
        return raw;
      }
      return runRemote('journalctl -k --since "1 hour ago" --no-pager 2>/dev/null | grep "UFW BLOCK"');
    };

    const [bazzaRaw, prodRaw] = await Promise.all([fetchRaw('bazza'), fetchRaw('prod')]);
    const events = [
      ...bazzaRaw.split('\n').filter(Boolean).map(parseEvent).filter((x): x is Event => x !== null).map((e) => ({ ...e, host: 'bazza' as const })),
      ...prodRaw.split('\n').filter(Boolean).map(parseEvent).filter((x): x is Event => x !== null).map((e) => ({ ...e, host: 'prod' as const })),
    ].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.src, (counts.get(e.src) ?? 0) + 1);
    return NextResponse.json({
      recent: events.slice(0, 50),
      blockCount: events.length,
      topSources: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count })),
    });
  } catch {
    return NextResponse.json({ recent: [], blockCount: 0, topSources: [] });
  }
}
