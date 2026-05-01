import { NextResponse } from 'next/server';
import { sh } from '../_util';
import { requireSessionAuth } from '../_session-auth';

const CADVISOR = process.env.CADVISOR_URL ?? 'http://mission-cadvisor:8080';
const TIMEOUT_MS = 8_000;

async function cadvisor(path: string) {
  const res = await fetch(`${CADVISOR}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`cAdvisor ${path} → ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const [machine, hostData] = await Promise.all([
      cadvisor('/api/v1.3/machine'),
      cadvisor('/api/v1.3/containers/'),
    ]);

    const stats: any[] = hostData.stats ?? [];
    const latest = stats[stats.length - 1];
    const prev   = stats.length >= 2 ? stats[stats.length - 2] : null;

    // ── CPU % ──────────────────────────────────────────────────────────────
    let cpuPct: number | null = null;
    if (latest && prev) {
      const cpuDelta = latest.cpu.usage.total - prev.cpu.usage.total;
      const from = new Date(prev.timestamp).getTime();
      const to   = new Date(latest.timestamp).getTime();
      const elapsedNs = (to - from) * 1e6; // ms → ns
      const numCores  = machine.num_cores ?? 1;
      cpuPct = Math.min(100, Math.round((cpuDelta / elapsedNs / numCores) * 1000) / 10);
    }

    // ── Memory ─────────────────────────────────────────────────────────────
    const memTotalBytes = machine.memory_capacity ?? 0;
    const memUsedBytes  = latest?.memory?.working_set ?? 0;
    const memPct = memTotalBytes > 0 ? Math.round((memUsedBytes / memTotalBytes) * 100) : 0;

    // ── Disk (root filesystem) ─────────────────────────────────────────────
    let disk: { totalGb: number; usedGb: number; freeGb: number; pct: number } | null = null;
    const fsList: any[] = latest?.filesystem ?? [];
    // Pick the largest vda/sda device (root FS)
    const rootFs = fsList
      .filter(f => /\/dev\/(vda|sda|nvme)/.test(f.device ?? ''))
      .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))[0];
    if (rootFs?.capacity) {
      const totalGb = Math.round(rootFs.capacity  / 1e9 * 10) / 10;
      const usedGb  = Math.round((rootFs.usage ?? 0) / 1e9 * 10) / 10;
      const freeGb  = Math.round((totalGb - usedGb) * 10) / 10;
      const pct     = Math.round((usedGb / totalGb) * 100);
      disk = { totalGb, usedGb, freeGb, pct };
    }

    // ── Docker containers ──────────────────────────────────────────────────
    let containers: string[] = [];
    try {
      const raw = await sh('docker', ['ps', '--format', '{{.Names}}']);
      containers = raw.split('\n').map(s => s.trim()).filter(Boolean);
    } catch {}

    // ── Uptime ─────────────────────────────────────────────────────────────
    let uptimePretty: string | null = null;
    let uptimeSince: string | null  = null;
    try {
      const raw = await sh('cat', ['/proc/uptime']);
      const secs = parseFloat(raw.split(' ')[0]);
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      const m = Math.floor((secs % 3600)  / 60);
      uptimePretty = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
      const sinceMs = Date.now() - secs * 1000;
      uptimeSince   = new Date(sinceMs).toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
    } catch {}

    return NextResponse.json({
      ok: true,
      label: 'Bazza',
      host: 'bazza.taile9fed9.ts.net',
      cpu: { pct: cpuPct, cores: machine.num_cores },
      memory: {
        totalMb: Math.round(memTotalBytes / 1e6),
        usedMb:  Math.round(memUsedBytes  / 1e6),
        freeMb:  Math.round((memTotalBytes - memUsedBytes) / 1e6),
        pct:     memPct,
      },
      disk,
      uptime: { pretty: uptimePretty, since: uptimeSince },
      containers,
      containerCount: containers.length,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e), checkedAt: new Date().toISOString() });
  }
}
