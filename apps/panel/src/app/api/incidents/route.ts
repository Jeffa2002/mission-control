/**
 * GET  /api/incidents        — persisted incident control state (ack/close/silence/notes)
 * POST /api/incidents        — apply one operator action to an incident
 *
 * State lives in a single JSON document on the panel's writable runtime
 * mount (INCIDENTS_STATE_FILE). Incidents themselves are still derived from
 * live signals; this store only persists operator decisions keyed by the
 * stable incident id produced by buildIncidents().
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { audit } from '../_util';
import { callerIp } from '../_guard';
import {
  applyIncidentAction,
  INCIDENT_ACTIONS,
  isIncidentAction,
  type IncidentActionKind,
  type IncidentControls,
} from '../../incidents/incidents-state';

interface StateFile {
  version: 1;
  incidents: Record<string, IncidentControls>;
}

const DEFAULT_STATE_PATH = '/workspace/mission-control/runtime/incidents-state.json';
const MAX_HISTORY_PER_INCIDENT = 200;

function statePath(): string {
  return process.env.INCIDENTS_STATE_FILE || DEFAULT_STATE_PATH;
}

async function loadState(): Promise<StateFile> {
  try {
    const raw = await readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StateFile> | null;
    if (parsed && typeof parsed === 'object' && parsed.incidents && typeof parsed.incidents === 'object') {
      return { version: 1, incidents: parsed.incidents as Record<string, IncidentControls> };
    }
  } catch {
    // Missing or unreadable state means no operator decisions recorded yet.
  }
  return { version: 1, incidents: {} };
}

async function saveState(state: StateFile): Promise<void> {
  const target = statePath();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

function isValidIncidentId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[a-zA-Z0-9_.:-]+$/.test(value);
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  try {
    const state = await loadState();
    return NextResponse.json({ ok: true, incidents: state.incidents });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message ?? error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  try {
    const body = await req.json().catch(() => ({}));
    const incidentId = typeof body.incidentId === 'string' ? body.incidentId.trim() : '';
    if (!isValidIncidentId(incidentId)) {
      return NextResponse.json({ ok: false, error: 'incidentId must match [a-zA-Z0-9_.:-]{1,200}' }, { status: 400 });
    }
    const action = body.action;
    if (!isIncidentAction(action)) {
      return NextResponse.json({ ok: false, error: `action must be one of: ${INCIDENT_ACTIONS.join(', ')}` }, { status: 400 });
    }

    const state = await loadState();
    const atIso = new Date().toISOString();
    const result = applyIncidentAction(
      state.incidents[incidentId],
      {
        action: action as IncidentActionKind,
        note: typeof body.note === 'string' ? body.note : undefined,
        owner: typeof body.owner === 'string' ? body.owner : undefined,
        silenceMinutes: typeof body.silenceMinutes === 'number' ? body.silenceMinutes : undefined,
      },
      atIso,
    );
    if ('error' in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    state.incidents[incidentId] = result;
    // Keep the store bounded: drop the longest-idle entries beyond the cap.
    const ids = Object.keys(state.incidents);
    if (ids.length > MAX_HISTORY_PER_INCIDENT) {
      const ranked = ids
        .map((id) => ({ id, last: state.incidents[id]?.history?.at(-1)?.at ?? '' }))
        .sort((a, b) => a.last.localeCompare(b.last));
      for (const entry of ranked.slice(0, ids.length - MAX_HISTORY_PER_INCIDENT)) {
        delete state.incidents[entry.id];
      }
    }
    await saveState(state);
    await audit(`incident.${action}`, incidentId, {
      actor: 'session',
      result: 'ok',
      ip: callerIp(req),
    });
    return NextResponse.json({ ok: true, incidentId, controls: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message ?? error) }, { status: 500 });
  }
}
