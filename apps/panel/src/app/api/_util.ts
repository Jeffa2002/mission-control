import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

export async function sh(cmd: string, args: string[] = [], opts: { cwd?: string; timeoutMs?: number } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: opts.timeoutMs ?? 60_000,
      cwd: opts.cwd,
    });
    const out = stdout?.toString() || '';
    const err = stderr?.toString() || '';
    return out || err;
  } catch (e: any) {
    const stderr = (e?.stderr || '').toString?.() || '';
    const stdout = (e?.stdout || '').toString?.() || '';
    const msg = e?.message || String(e);
    throw new Error([msg, stdout && `stdout:\n${stdout}`, stderr && `stderr:\n${stderr}`].filter(Boolean).join('\n\n'));
  }
}

export const RUNTIME_DIR = '/workspace/mission-control/runtime';
const ARMED_PATH = `${RUNTIME_DIR}/armed.json`;
const PANIC_LATCH_PATH = `${RUNTIME_DIR}/panic_latch.json`;
const AUDIT_PATH = `${RUNTIME_DIR}/audit.log`;

// ─────────────────────────────────────────────────────────────────────────────
//  Armed state
// ─────────────────────────────────────────────────────────────────────────────

export async function getArmed(): Promise<boolean> {
  try {
    const raw = await readFile(ARMED_PATH, 'utf-8');
    const j = JSON.parse(raw);
    return !!j.armed;
  } catch {
    return true; // default: armed
  }
}

export async function setArmed(armed: boolean) {
  await mkdir(RUNTIME_DIR, { recursive: true });
  await writeFile(ARMED_PATH, JSON.stringify({ armed, ts: new Date().toISOString() }, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Panic latch state
//
//  Once latched, arm/enable actions are blocked until explicit reset.
//  Persisted to disk so it survives process restarts.
// ─────────────────────────────────────────────────────────────────────────────

export interface PanicLatch {
  latched: boolean;
  ts: string;
  reason?: string;
}

export async function getPanicLatch(): Promise<PanicLatch> {
  try {
    const raw = await readFile(PANIC_LATCH_PATH, 'utf-8');
    return JSON.parse(raw) as PanicLatch;
  } catch {
    return { latched: false, ts: new Date().toISOString() };
  }
}

export async function setPanicLatch(latched: boolean, reason?: string) {
  await mkdir(RUNTIME_DIR, { recursive: true });
  const latch: PanicLatch = { latched, ts: new Date().toISOString(), reason };
  await writeFile(PANIC_LATCH_PATH, JSON.stringify(latch, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Audit log (append-only JSONL)
//
//  Fields: ts, action, detail, actor, idempotency_key, result, error, ip, ...extra
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditOptions {
  /** Actor identifier — session user or 'hmac' for machine callers */
  actor?: string;
  /** Idempotency key from X-Idempotency-Key header (if any) */
  idempotency_key?: string;
  /** Result of the action (e.g. 'ok', 'error', 'noop') */
  result?: string;
  /** Error message if the action failed */
  error?: string;
  /** Client IP */
  ip?: string;
  /** Auth method ('hmac' | 'session') */
  auth_method?: string;
  /** Panic flatten flag */
  flatten?: boolean;
  [key: string]: unknown;
}

export async function audit(action: string, detail?: string, extra?: AuditOptions) {
  await mkdir(RUNTIME_DIR, { recursive: true });
  const { actor, idempotency_key, result, error, ip, auth_method, ...rest } = extra || {};
  const evt: Record<string, unknown> = {
    ts: new Date().toISOString(),
    action,
    detail: detail || '',
  };
  if (actor)            evt.actor            = actor;
  if (idempotency_key)  evt.idempotency_key  = idempotency_key;
  if (result)           evt.result           = result;
  if (error)            evt.error            = error;
  if (ip)               evt.ip               = ip;
  if (auth_method)      evt.auth_method      = auth_method;
  // Merge any remaining known fields
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) evt[k] = v;
  }
  await appendFile(AUDIT_PATH, JSON.stringify(evt) + '\n', 'utf-8');
}

/** Read last N audit entries (newest first). */
export async function readAuditLog(limit = 50): Promise<Record<string, unknown>[]> {
  const raw = await readFile(AUDIT_PATH, 'utf-8').catch(() => '');
  const lines = raw.split('\n').filter(Boolean);
  const tail = lines.slice(-Math.min(limit, 500));
  return tail
    .map((line) => {
      if (line.trim().startsWith('{')) {
        try { return JSON.parse(line); } catch { return { raw: line }; }
      }
      const [ts, action, detail] = line.split('\t');
      return { ts, action, detail };
    })
    .reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Bot control server integration
//  Sends commands to the bot's built-in HTTP control server (port 8080 by default).
//  BOT_CONTROL_URL env var overrides (e.g. "http://127.0.0.1:8080").
//  Best-effort: never throws — returns a result object with ok/error fields.
// ─────────────────────────────────────────────────────────────────────────────

const BOT_CONTROL_URL = (process.env.BOT_CONTROL_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

export type BotAction = 'panic' | 'arm' | 'disarm' | 'status';

export interface BotControlResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

/**
 * Call the bot's HTTP control server.
 *
 * @param action  - 'panic' | 'arm' | 'disarm' | 'status'
 * @param opts.flatten - for panic: also market-sell all open positions
 * @param opts.timeoutMs - request timeout (default 8 s)
 */
export async function botControl(
  action: BotAction,
  opts: { flatten?: boolean; timeoutMs?: number } = {},
): Promise<BotControlResult> {
  const { flatten, timeoutMs = 8_000 } = opts;

  const method = action === 'status' ? 'GET' : 'POST';
  let url = `${BOT_CONTROL_URL}/api/action/${action}`;
  if (action === 'panic' && flatten !== undefined) {
    url += `?flatten=${flatten ? 'true' : 'false'}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method, signal: controller.signal });
    clearTimeout(timer);
    let body: unknown;
    try { body = await res.json(); } catch { body = null; }
    return { ok: res.ok, status: res.status, body };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: String(e?.message || e) };
  }
}
