import { NextResponse } from 'next/server';
import { statSync, openSync, closeSync, readSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { requireSessionAuth } from '../_session-auth';

/**
 * Fleet uptime pane data source.
 *
 * Reads the probe artifacts written by the EffectX fleet monitor
 * (/opt/fleet-monitoring on per-web) and the TimePulse uptime monitor
 * (timepulse-uptime.timer). Both log directories live under /var/log,
 * which the panel container mounts read-only at /host-logs.
 */

const FLEET_DIR = process.env.FLEET_UPTIME_DIR || '/host-logs/fleet-uptime';
const TIMEPULSE_DIR = process.env.TIMEPULSE_UPTIME_DIR || '/host-logs/timepulse';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const FLEET_TAIL_BYTES = 3_500_000; // ~24h at 30 targets / 5-minute cadence
const TIMEPULSE_TAIL_BYTES = 1_500_000; // ~1 week at 3 targets / 5-minute cadence

interface ProbeLine {
  ts: string;
  target: string;
  url: string;
  ok: boolean;
  http_code: string;
  latency_ms: number;
  reason: string;
  consecutive_failures: number;
}

interface TargetSummary extends ProbeLine {
  probes_24h: number;
  ok_24h: number;
  uptime_24h: number | null;
  p95_24h: number | null;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Read the trailing portion of a file and return complete lines. */
function tailLines(file: string, maxBytes: number): string[] {
  try {
    const size = statSync(file).size;
    if (size === 0) return [];
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, buf, 0, len, start);
    } finally {
      closeSync(fd);
    }
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    // Drop the first (possibly partial) line when reading from mid-file.
    return start > 0 ? lines.slice(1) : lines;
  } catch {
    return [];
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function parseLines(lines: string[]): ProbeLine[] {
  const out: ProbeLine[] = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as ProbeLine;
      if (rec && typeof rec.target === 'string' && typeof rec.ts === 'string') {
        out.push(rec);
      }
    } catch {
      // Skip malformed lines.
    }
  }
  return out;
}

function summarizeTargets(records: ProbeLine[], windowMs: number): TargetSummary[] {
  const now = Date.now();
  const latest = new Map<string, ProbeLine>();
  const stats = new Map<string, { total: number; ok: number; lat: number[] }>();

  for (const rec of records) {
    const prev = latest.get(rec.target);
    if (!prev || rec.ts > prev.ts) latest.set(rec.target, rec);

    const t = Date.parse(rec.ts);
    if (!Number.isNaN(t) && now - t <= windowMs) {
      const s = stats.get(rec.target) ?? { total: 0, ok: 0, lat: [] };
      s.total += 1;
      if (rec.ok) s.ok += 1;
      if (typeof rec.latency_ms === 'number') s.lat.push(rec.latency_ms);
      stats.set(rec.target, s);
    }
  }

  const targets: TargetSummary[] = [];
  for (const [name, l] of latest) {
    const s = stats.get(name);
    targets.push({
      ...l,
      probes_24h: s?.total ?? 0,
      ok_24h: s?.ok ?? 0,
      uptime_24h: s && s.total > 0 ? (100 * s.ok) / s.total : null,
      p95_24h: s && s.lat.length > 0 ? percentile(s.lat, 0.95) : null,
    });
  }

  targets.sort(
    (a, b) =>
      b.consecutive_failures - a.consecutive_failures ||
      Number(a.ok) - Number(b.ok) ||
      a.target.localeCompare(b.target),
  );
  return targets;
}

function loadProbeSet(dir: string, tailBytes: number) {
  const status = readJson(path.join(dir, 'status.json'));
  const records = parseLines(tailLines(path.join(dir, 'uptime.jsonl'), tailBytes));
  return {
    available: status !== null,
    status,
    targets: summarizeTargets(records, WINDOW_MS),
    probe_count: records.length,
  };
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const body = {
    generated_at: new Date().toISOString(),
    window_hours: WINDOW_MS / 3_600_000,
    fleet: loadProbeSet(FLEET_DIR, FLEET_TAIL_BYTES),
    timepulse: loadProbeSet(TIMEPULSE_DIR, TIMEPULSE_TAIL_BYTES),
  };

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
