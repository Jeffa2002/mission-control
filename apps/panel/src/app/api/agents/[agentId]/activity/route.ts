import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { requireSessionAuth } from '../../../_session-auth';

type SessionRecord = {
  type?: string;
  id?: string;
  timestamp?: string;
  role?: string;
  content?: unknown;
  message?: { role?: string; content?: unknown };
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  text?: string;
};

type ActivityEvent = {
  id: string;
  timestamp: string;
  type: 'message' | 'tool_call' | 'tool_result' | 'thinking';
  role?: 'user' | 'assistant' | 'tool' | string;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  summary: string;
};

const DATA_ROOT = '/agent-data';

function toText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === 'string' ? item : item && typeof item === 'object' && 'text' in item ? String((item as any).text ?? '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (v && typeof v === 'object') {
    if ('content' in v) return toText((v as any).content);
    if ('text' in v) return String((v as any).text ?? '');
  }
  return '';
}

function summarize(text: string, max = 120) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function extractEvents(records: SessionRecord[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const rec of records) {
    const ts = rec.timestamp || new Date().toISOString();
    const id = rec.id || `${ts}-${events.length}`;
    const role = rec.role || rec.message?.role;
    const content = toText(rec.content ?? rec.message?.content ?? rec.text);
    const type = rec.type || 'message';

    if (type === 'tool_call') {
      events.push({
        id,
        timestamp: ts,
        type: 'tool_call',
        role: 'tool',
        content,
        toolName: rec.toolName,
        toolInput: rec.toolInput,
        summary: `${rec.toolName || 'tool'}: ${summarize(content || JSON.stringify(rec.toolInput ?? {}))}`,
      });
      continue;
    }
    if (type === 'tool_result') {
      events.push({
        id,
        timestamp: ts,
        type: 'tool_result',
        role: 'tool',
        content,
        toolName: rec.toolName,
        summary: summarize(content || toText(rec.toolResult)),
      });
      continue;
    }
    if (type.includes('thinking') || (!content && role === 'assistant')) {
      events.push({
        id,
        timestamp: ts,
        type: 'thinking',
        role: (role as any) || 'assistant',
        content,
        summary: summarize(content || 'Thinking…'),
      });
      continue;
    }
    if (content) {
      events.push({
        id,
        timestamp: ts,
        type: 'message',
        role: (role as any) || 'assistant',
        content,
        summary: summarize(content),
      });
    }
  }
  return events;
}

async function readLatestSession(agentId: string) {
  const agentDir = path.join(DATA_ROOT, agentId);
  const candidates: string[] = [];

  // Check sessions/ subdirectory (subagents like dev, designer)
  const sessionDir = path.join(agentDir, 'sessions');
  const entries = await readdir(sessionDir, { withFileTypes: true }).catch(() => [] as any[]);
  for (const e of entries) {
    if (e.isFile() && (e.name.endsWith('.jsonl') || e.name.endsWith('.json')) && !e.name.includes('.deleted.') && !e.name.includes('.reset.')) {
      candidates.push(path.join(sessionDir, e.name));
    }
  }

  // Also check root-level sessions.json (main agent)
  const rootSession = path.join(agentDir, 'sessions.json');
  const rootStat = await stat(rootSession).catch(() => null);
  if (rootStat) candidates.push(rootSession);

  if (candidates.length === 0) return { sessionFile: null, events: [] as ActivityEvent[] };

  const withStats = await Promise.all(candidates.map(async (file) => ({ file, stat: await stat(file) })));
  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const latest = withStats[0]?.file;
  if (!latest) return { sessionFile: null, events: [] as ActivityEvent[] };

  const raw = await readFile(latest, 'utf8');
  let records: SessionRecord[] = [];
  // JSONL format (one JSON object per line)
  if (latest.endsWith('.jsonl') || raw.trimStart().startsWith('{')) {
    records = raw.split(/\n+/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean) as SessionRecord[];
  } else {
    try {
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : parsed?.messages ?? [];
    } catch {
      records = [];
    }
  }
  return { sessionFile: latest, events: extractEvents(records) };
}

export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const { agentId } = await params;
  const since = new URL(req.url).searchParams.get('since');
  try {
    const { sessionFile, events } = await readLatestSession(agentId);
    const sliced = since ? events.filter((e) => e.timestamp > since) : events.slice(-100);
    return NextResponse.json({ ok: true, agentId, sessionFile, events: sliced.slice(-100), generatedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
