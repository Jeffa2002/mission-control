/**
 * /api/agents/status
 *
 * Returns live status for each OpenClaw agent by reading their session JSONL
 * files from /agent-data (mounted read-only from /root/.openclaw/agents on host).
 *
 * Status heuristic (based on last message timestamp):
 *   Working  — last message < 45 s ago (active tool-calling or responding)
 *   Idle     — last message 45 s – 20 min ago
 *   Offline  — last message > 20 min ago or no sessions found
 *
 * Results are cached for 5 s server-side to avoid hammering the filesystem.
 */

import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { requireSessionAuth } from '../../_session-auth';

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENTS_DIR = '/agent-data';          // bind-mounted from /root/.openclaw/agents
const CACHE_TTL_MS = 5_000;
const WORKING_THRESHOLD_MS  =  45_000;    //  45 s  → Working
const IDLE_THRESHOLD_MS     = 20 * 60_000; // 20 min → Idle (else Offline)

// ─── In-memory cache ─────────────────────────────────────────────────────────

interface AgentStatus {
  id: string;
  name: string;
  label: string;
  emoji: string;
  role: string;
  model: string;
  busy: boolean;
  status: 'Working' | 'Idle' | 'Offline';
  lastSeen: string | null;
  currentTask: string | null;
  sessionId: string | null;
}

interface CacheEntry {
  ts: number;
  data: AgentStatus[];
}

let cache: CacheEntry | null = null;

// ─── Agent definitions ───────────────────────────────────────────────────────

const AGENT_DEFS = [
  { id: 'main',     label: 'Bazza',   emoji: '🦞',  role: 'Lead Assistant',   model: 'anthropic/claude-sonnet-4-6' },
  { id: 'dev',      label: 'Dev',     emoji: '🧑‍💻', role: 'Developer',        model: 'anthropic/claude-sonnet-4-6' },
  { id: 'writer',   label: 'Quinn',   emoji: '✍️',  role: 'Writer',           model: 'openai/gpt-5.2-pro'         },
  { id: 'designer', label: 'Nova',    emoji: '🎨',  role: 'Designer',         model: 'anthropic/claude-sonnet-4-6' },
  { id: 'research', label: 'Scout',   emoji: '🔬',  role: 'Research Analyst', model: 'openai/gpt-5.1-codex'       },
  { id: 'travel',   label: 'Travel',  emoji: '✈️',  role: 'Travel Assistant', model: 'openai/gpt-5.2-pro'         },
  { id: 'sec',      label: 'Secspy',  emoji: '🕵️', role: 'Security',         model: 'openai/gpt-5.4-mini'        },
];

// ─── Session parsing ─────────────────────────────────────────────────────────

interface SessionSummary {
  /** ISO timestamp of the most recent message */
  lastTs: string | null;
  /** Last assistant text snippet (first 120 chars) */
  lastAssistantText: string | null;
  /** Whether the last assistant message had a toolCall (active) */
  lastWasToolCall: boolean;
  sessionId: string | null;
}

async function parseSessionFile(filePath: string): Promise<SessionSummary> {
  const raw = await readFile(filePath, 'utf-8').catch(() => '');
  const lines = raw.split('\n').filter(Boolean);

  let lastTs: string | null = null;
  let lastAssistantText: string | null = null;
  let lastWasToolCall = false;
  let sessionId: string | null = null;

  for (const line of lines) {
    let obj: Record<string, unknown>;
    try { obj = JSON.parse(line); } catch { continue; }

    // Track session id from the header line
    if (obj.type === 'session' && typeof obj.id === 'string') {
      sessionId = obj.id as string;
    }

    // Only care about message lines
    if (obj.type !== 'message') continue;

    const msg = obj.message as Record<string, unknown> | undefined;
    if (!msg) continue;

    // Update timestamp (prefer message.timestamp over outer timestamp)
    const ts = (obj.timestamp ?? msg.timestamp) as string | undefined;
    if (ts) lastTs = ts as string;

    const role = msg.role as string | undefined;
    if (role === 'assistant') {
      const content = msg.content as unknown[];
      if (!Array.isArray(content)) continue;

      lastWasToolCall = false;
      lastAssistantText = null;

      for (const item of content) {
        const c = item as Record<string, unknown>;
        if (c.type === 'text' && typeof c.text === 'string') {
          // Use first substantial text block
          if (!lastAssistantText || lastAssistantText.length < 10) {
            lastAssistantText = (c.text as string).slice(0, 120).trim() || null;
          }
        }
        if (c.type === 'toolCall') {
          lastWasToolCall = true;
          // If it's a toolCall and no text, show the tool name as task hint
          if (!lastAssistantText) {
            const toolName = c.name as string | undefined;
            const args = c.arguments as Record<string, unknown> | undefined;
            if (toolName === 'exec' && args?.command) {
              lastAssistantText = `Running: ${String(args.command).slice(0, 80)}`;
            } else if (toolName) {
              lastAssistantText = `Using tool: ${toolName}`;
            }
          }
        }
      }
    }
  }

  return { lastTs, lastAssistantText, lastWasToolCall, sessionId };
}

async function getAgentStatus(agentId: string): Promise<{
  lastTs: string | null;
  lastAssistantText: string | null;
  busy: boolean;
  sessionId: string | null;
}> {
  const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');

  let files: string[];
  try {
    const entries = await readdir(sessionsDir);
    // Only active (non-deleted) JSONL files
    files = entries
      .filter((f) => f.endsWith('.jsonl') && !f.includes('.deleted.'))
      .map((f) => path.join(sessionsDir, f));
  } catch {
    return { lastTs: null, lastAssistantText: null, busy: false, sessionId: null };
  }

  if (!files.length) {
    return { lastTs: null, lastAssistantText: null, busy: false, sessionId: null };
  }

  // Sort by file mtime desc so we process newest first
  const withMtime = await Promise.all(
    files.map(async (f) => {
      const s = await stat(f).catch(() => null);
      return { f, mtime: s?.mtimeMs ?? 0 };
    }),
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);

  // Parse top 3 newest sessions for the most recent activity
  const summaries = await Promise.all(
    withMtime.slice(0, 3).map(({ f }) => parseSessionFile(f)),
  );

  // Pick the one with the most recent timestamp
  let best: SessionSummary = { lastTs: null, lastAssistantText: null, lastWasToolCall: false, sessionId: null };
  for (const s of summaries) {
    if (!s.lastTs) continue;
    if (!best.lastTs || s.lastTs > best.lastTs) best = s;
  }

  // "busy" = last activity was recent AND last message was a toolCall
  const ageMs = best.lastTs ? Date.now() - new Date(best.lastTs).getTime() : Infinity;
  const busy = ageMs < WORKING_THRESHOLD_MS && best.lastWasToolCall;

  return {
    lastTs: best.lastTs,
    lastAssistantText: best.lastAssistantText,
    busy,
    sessionId: best.sessionId,
  };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  // Serve from cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, ts: new Date().toISOString(), agents: cache.data });
  }

  const results: AgentStatus[] = await Promise.all(
    AGENT_DEFS.map(async (def) => {
      const { lastTs, lastAssistantText, busy, sessionId } = await getAgentStatus(def.id);

      let status: AgentStatus['status'] = 'Offline';
      if (lastTs) {
        const ageMs = Date.now() - new Date(lastTs).getTime();
        if (ageMs < WORKING_THRESHOLD_MS) {
          status = 'Working';
        } else if (ageMs < IDLE_THRESHOLD_MS) {
          status = 'Idle';
        }
      }

      return {
        id: def.id,
        name: def.id,
        label: def.label,
        emoji: def.emoji,
        role: def.role,
        model: def.model,
        busy,
        status,
        lastSeen: lastTs,
        currentTask: lastAssistantText,
        sessionId,
      };
    }),
  );

  cache = { ts: Date.now(), data: results };
  return NextResponse.json({ ok: true, ts: new Date().toISOString(), agents: results });
}
