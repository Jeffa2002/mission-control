import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
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

async function sampleCpu() {
  const raw = await readFile('/proc/stat', 'utf-8');
  const line = raw.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const [, ...values] = line.trim().split(/\s+/).map(Number);
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

async function fallbackBazzaStats() {
  const [cpuA, dockerInfoRaw, memInfoRaw, dfRaw, uptimeRaw] = await Promise.all([
    sampleCpu(),
    sh('docker', ['info', '--format', '{{json .}}'], { timeoutMs: 8_000 }).catch(() => ''),
    readFile('/proc/meminfo', 'utf-8').catch(() => ''),
    sh('df', ['-B1', '/workspace'], { timeoutMs: 8_000 }).catch(() => ''),
    readFile('/proc/uptime', 'utf-8').catch(() => ''),
  ]);

  await new Promise((resolve) => setTimeout(resolve, 250));
  const cpuB = await sampleCpu().catch(() => null);

  let dockerInfo: any = {};
  try { dockerInfo = dockerInfoRaw ? JSON.parse(dockerInfoRaw) : {}; } catch {}
  const cores = Number(dockerInfo.NCPU ?? 0) || undefined;
  let cpuPct: number | null = null;
  if (cpuA && cpuB && cpuB.total > cpuA.total) {
    const totalDelta = cpuB.total - cpuA.total;
    const idleDelta = cpuB.idle - cpuA.idle;
    cpuPct = Math.max(0, Math.min(100, Math.round(((1 - idleDelta / totalDelta) * 100) * 10) / 10));
  }

  const mem = Object.fromEntries(
    memInfoRaw.split('\n')
      .map((line) => line.match(/^(\w+):\s+(\d+)/))
      .filter(Boolean)
      .map((match) => [match![1], Number(match![2]) * 1024]),
  ) as Record<string, number>;
  const memTotalBytes = Number(dockerInfo.MemTotal ?? mem.MemTotal ?? 0);
  const memFreeishBytes = mem.MemAvailable ?? mem.MemFree ?? 0;
  const memUsedBytes = memTotalBytes && memFreeishBytes ? memTotalBytes - memFreeishBytes : 0;
  const memPct = memTotalBytes > 0 ? Math.round((memUsedBytes / memTotalBytes) * 100) : 0;

  let disk: { totalGb: number; usedGb: number; freeGb: number; pct: number } | null = null;
  const dfLine = dfRaw.trim().split('\n')[1];
  if (dfLine) {
    const parts = dfLine.trim().split(/\s+/);
    const total = Number(parts[1] ?? 0);
    const used = Number(parts[2] ?? 0);
    const free = Number(parts[3] ?? 0);
    if (total > 0) {
      disk = {
        totalGb: Math.round(total / 1e9 * 10) / 10,
        usedGb: Math.round(used / 1e9 * 10) / 10,
        freeGb: Math.round(free / 1e9 * 10) / 10,
        pct: Math.round((used / total) * 100),
      };
    }
  }

  const secs = parseFloat(uptimeRaw.split(' ')[0] ?? '0');
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const uptimePretty = secs
    ? d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
    : null;
  const uptimeSince = secs
    ? new Date(Date.now() - secs * 1000).toISOString().replace('T', ' ').substring(0, 16) + ' UTC'
    : null;

  return {
    cpu: { pct: cpuPct, cores: cores ?? 0 },
    memory: {
      totalMb: Math.round(memTotalBytes / 1e6),
      usedMb: Math.round(memUsedBytes / 1e6),
      freeMb: Math.round((memTotalBytes - memUsedBytes) / 1e6),
      pct: memPct,
    },
    disk,
    uptime: { pretty: uptimePretty, since: uptimeSince },
  };
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    let machine: any = null;
    let hostData: any = null;
    let fallback: Awaited<ReturnType<typeof fallbackBazzaStats>> | null = null;

    try {
      [machine, hostData] = await Promise.all([
        cadvisor('/api/v1.3/machine'),
        cadvisor('/api/v1.3/containers/'),
      ]);
    } catch {
      fallback = await fallbackBazzaStats();
      machine = { num_cores: fallback.cpu.cores, memory_capacity: fallback.memory.totalMb * 1e6 };
      hostData = { stats: [] };
    }

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
    } else if (fallback) {
      cpuPct = fallback.cpu.pct;
    }

    // ── Memory ─────────────────────────────────────────────────────────────
    const memTotalBytes = machine.memory_capacity ?? 0;
    const memUsedBytes  = latest?.memory?.working_set ?? (fallback ? fallback.memory.usedMb * 1e6 : 0);
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
    if (!disk && fallback?.disk) disk = fallback.disk;

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
      if (fallback?.uptime) {
        uptimePretty = fallback.uptime.pretty;
        uptimeSince = fallback.uptime.since;
      } else {
        const raw = await sh('cat', ['/proc/uptime']);
        const secs = parseFloat(raw.split(' ')[0]);
        const d = Math.floor(secs / 86400);
        const h = Math.floor((secs % 86400) / 3600);
        const m = Math.floor((secs % 3600)  / 60);
        uptimePretty = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
        const sinceMs = Date.now() - secs * 1000;
        uptimeSince   = new Date(sinceMs).toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
      }
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
