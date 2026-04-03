import { NextResponse } from 'next/server';
import { readdirSync } from 'node:fs';
import { readFirstExisting, readGlobbed } from '../_security-logs';

type Item = { ts: string; ip: string; method: string; path: string; status: number; bytes: number };

function parseCombined(line: string): Item | null {
  const m = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]+" (\d{3}) (\S+)/);
  if (!m) return null;
  const [, ip, tsRaw, method, path, statusRaw, bytesRaw] = m;
  const ts = new Date(tsRaw.replace(/:/, ' ')).toISOString();
  return { ts, ip, method, path, status: Number(statusRaw), bytes: bytesRaw === '-' ? 0 : Number(bytesRaw) || 0 };
}

export async function GET() {
  try {
    let raw = await readFirstExisting(['/host-logs/nginx/access.log', '/var/log/nginx/access.log']);
    if (!raw) {
      const patterns = ['/workspace-data/*/logs/nginx*.log', '/host-logs/**/nginx*.log', '/var/log/**/nginx*.log'];
      raw = await readGlobbed(patterns);
    }
    if (!raw) return NextResponse.json({ recent: [], errorCount: 0, topPaths: [], topIPs: [] });
    const lines = raw.split('\n').filter(Boolean).slice(-100);
    const recent = lines.map(parseCombined).filter((x): x is Item => x !== null);
    const errorCount = recent.filter((r) => r.status >= 400).length;
    const paths = new Map<string, number>();
    const ips = new Map<string, number>();
    for (const r of recent) { paths.set(r.path, (paths.get(r.path) ?? 0) + 1); ips.set(r.ip, (ips.get(r.ip) ?? 0) + 1); }
    return NextResponse.json({
      recent,
      errorCount,
      topPaths: [...paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, count]) => ({ path, count })),
      topIPs: [...ips.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count })),
    });
  } catch {
    return NextResponse.json({ recent: [], errorCount: 0, topPaths: [], topIPs: [] });
  }
}
