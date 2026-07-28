import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export type UsageRecord = {
  ts: string;
  agent: string;
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  estimatedCost: number | null;
};

type Price = { input: number; cached: number | null; cacheWrite: number | null; output: number; long?: Omit<Price, 'long'> };

// USD per one million tokens. Source: https://developers.openai.com/api/docs/pricing
// Checked 2026-07-28. Standard processing; long rates apply above 272K context.
export const OPENAI_PRICES: Record<string, Price> = {
  'gpt-5.6-sol': { input: 5, cached: .5, cacheWrite: 6.25, output: 30, long: { input: 10, cached: 1, cacheWrite: 12.5, output: 45 } },
  'gpt-5.6-terra': { input: 2.5, cached: .25, cacheWrite: 3.125, output: 15, long: { input: 5, cached: .5, cacheWrite: 6.25, output: 22.5 } },
  'gpt-5.5': { input: 5, cached: .5, cacheWrite: null, output: 30, long: { input: 10, cached: 1, cacheWrite: null, output: 45 } },
};

export function estimateOpenAiCost(model: string, usage: Pick<UsageRecord, 'input'|'output'|'cacheRead'|'cacheWrite'>) {
  const base = OPENAI_PRICES[model];
  if (!base) return null;
  const context = usage.input + usage.cacheRead + usage.cacheWrite;
  const price = context > 272_000 && base.long ? base.long : base;
  const cacheWritePrice = price.cacheWrite ?? price.input;
  return (usage.input * price.input + usage.output * price.output + usage.cacheRead * (price.cached ?? price.input) + usage.cacheWrite * cacheWritePrice) / 1_000_000;
}

export function parseUsageTranscript(content: string, agent: string): UsageRecord[] {
  const records: UsageRecord[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const message = row?.type === 'message' ? row.message : null;
      const usage = message?.role === 'assistant' ? message.usage : null;
      if (!usage) continue;
      const record: UsageRecord = {
        ts: row.timestamp ?? new Date(0).toISOString(), agent,
        provider: message.provider ?? 'unknown', model: message.model ?? 'unknown',
        input: Number(usage.input ?? 0), output: Number(usage.output ?? 0),
        cacheRead: Number(usage.cacheRead ?? 0), cacheWrite: Number(usage.cacheWrite ?? 0),
        total: Number(usage.totalTokens ?? 0), estimatedCost: null,
      };
      record.estimatedCost = record.provider === 'openai' ? estimateOpenAiCost(record.model, record) : null;
      records.push(record);
    } catch { /* tolerate a partially appended final line */ }
  }
  return records;
}

export function parseCodexRollout(content: string, agent: string): UsageRecord[] {
  const records: UsageRecord[] = [];
  let model = 'unknown';
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row?.type === 'turn_context' && typeof row?.payload?.model === 'string') model = row.payload.model;
      const usage = row?.type === 'event_msg' && row?.payload?.type === 'token_count' ? row?.payload?.info?.last_token_usage : null;
      if (!usage) continue;
      const inputTotal = Number(usage.input_tokens ?? 0);
      const cacheRead = Number(usage.cached_input_tokens ?? 0);
      const record: UsageRecord = {
        ts: row.timestamp ?? new Date(0).toISOString(), agent, provider: 'openai', model,
        input: Math.max(0, inputTotal - cacheRead), output: Number(usage.output_tokens ?? 0),
        cacheRead, cacheWrite: 0, total: Number(usage.total_tokens ?? 0), estimatedCost: null,
      };
      record.estimatedCost = estimateOpenAiCost(record.model, record);
      records.push(record);
    } catch { /* tolerate a partially appended final line */ }
  }
  return records;
}

type CachedFile = { size: number; mtimeMs: number; records: UsageRecord[] };
const fileCache = new Map<string, CachedFile>();
const perthDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit' });

function transcript(name: string) {
  return !name.includes('.trajectory.') && /^.+\.jsonl(?:\.(?:reset|deleted)\..+Z)?$/.test(name);
}
function sum(target: any, row: UsageRecord) {
  target.input += row.input; target.output += row.output; target.cacheRead += row.cacheRead;
  target.cacheWrite += row.cacheWrite; target.total += row.total;
  if (row.estimatedCost != null) target.estimatedCost += row.estimatedCost;
  else if (row.total) target.unpricedTokens += row.total;
}
function bucket(id: string) { return { id, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, estimatedCost: 0, unpricedTokens: 0 }; }

async function discover(root: string) {
  const found: Array<{ file: string; agent: string; kind: 'openclaw'|'codex' }> = [];
  async function walkCodex(directory: string, agent: string) {
    try {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, item.name);
        if (item.isDirectory()) await walkCodex(file, agent);
        else if (item.isFile() && item.name.startsWith('rollout-') && item.name.endsWith('.jsonl')) found.push({ file, agent, kind: 'codex' });
      }
    } catch { /* Codex session tree is optional */ }
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sessions = path.join(root, entry.name, 'sessions');
    try {
      for (const item of await readdir(sessions, { withFileTypes: true })) {
        if (item.isFile() && transcript(item.name)) found.push({ file: path.join(sessions, item.name), agent: entry.name, kind: 'openclaw' });
      }
    } catch { /* agent has no sessions directory */ }
    await walkCodex(path.join(root, entry.name, 'agent', 'codex-home', 'sessions'), entry.name);
  }
  return found;
}

export async function loadUsage(range: '7d'|'30d'|'90d'|'all' = '30d') {
  const telemetryFile = process.env.USAGE_TELEMETRY_FILE;
  if (telemetryFile) {
    const snapshot = JSON.parse(await readFile(telemetryFile, 'utf8'));
    const payload = snapshot?.ranges?.[range];
    if (!payload?.ok) throw new Error('Token usage telemetry is unavailable');
    return payload;
  }
  const root = process.env.AGENT_DATA_DIR ?? '/agent-data';
  const files = await discover(root);
  const live = new Set(files.map(item => item.file));
  for (const key of fileCache.keys()) if (!live.has(key)) fileCache.delete(key);
  await Promise.all(files.map(async ({ file, agent, kind }) => {
    const info = await stat(file);
    const cached = fileCache.get(file);
    if (cached?.size === info.size && cached.mtimeMs === info.mtimeMs) return;
    const content = await readFile(file, 'utf8');
    fileCache.set(file, { size: info.size, mtimeMs: info.mtimeMs, records: kind === 'codex' ? parseCodexRollout(content, agent) : parseUsageTranscript(content, agent) });
  }));
  const now = Date.now();
  const span = range === 'all' ? Infinity : Number(range.slice(0, -1)) * 86_400_000;
  const cutoff = now - span;
  const totals = bucket('total');
  const agents = new Map<string, ReturnType<typeof bucket>>();
  const models = new Map<string, ReturnType<typeof bucket> & { provider: string }>();
  const days = new Map<string, ReturnType<typeof bucket>>();
  let recordCount = 0; let lastActivity: string | null = null;
  for (const cached of fileCache.values()) for (const row of cached.records) {
    const time = Date.parse(row.ts); if (Number.isFinite(time) && time < cutoff) continue;
    recordCount++; sum(totals, row);
    const agent = agents.get(row.agent) ?? bucket(row.agent); sum(agent, row); agents.set(row.agent, agent);
    const modelKey = `${row.provider}/${row.model}`;
    const model = models.get(modelKey) ?? { ...bucket(modelKey), provider: row.provider }; sum(model, row); models.set(modelKey, model);
    const dayKey = perthDay.format(new Date(row.ts)); const day = days.get(dayKey) ?? bucket(dayKey); sum(day, row); days.set(dayKey, day);
    if (!lastActivity || row.ts > lastActivity) lastActivity = row.ts;
  }
  const sortTotal = <T extends { total: number }>(values: T[]) => values.sort((a,b) => b.total-a.total);
  return {
    ok: true, generatedAt: new Date().toISOString(), timezone: 'Australia/Perth', range,
    source: { root, transcriptCount: files.length, recordCount, lastActivity }, totals,
    agents: sortTotal([...agents.values()]), models: sortTotal([...models.values()]),
    days: [...days.values()].sort((a,b) => a.id.localeCompare(b.id)),
    pricing: { currency: 'USD', mode: 'estimated-standard', checkedAt: '2026-07-28', sourceUrl: 'https://developers.openai.com/api/docs/pricing', note: 'OpenAI Standard token pricing; long-context rates apply when request context exceeds 272K tokens.' },
  };
}

export function serializeUsageSse(payload: unknown) { return `event: usage\ndata: ${JSON.stringify(payload)}\n\n`; }
