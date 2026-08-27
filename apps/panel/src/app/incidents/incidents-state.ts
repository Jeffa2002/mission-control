// incidents-state.ts — pure persistent-state logic for incident controls.
// Shared by the /api/incidents route and the incidents page. No I/O here.

export type IncidentActionKind =
  | 'ack'
  | 'unack'
  | 'close'
  | 'reopen'
  | 'silence'
  | 'unsilence'
  | 'assign'
  | 'note';

export const INCIDENT_ACTIONS: readonly IncidentActionKind[] = [
  'ack',
  'unack',
  'close',
  'reopen',
  'silence',
  'unsilence',
  'assign',
  'note',
];

export const MAX_SILENCE_MINUTES = 7 * 24 * 60;
export const MAX_HISTORY = 50;
export const MAX_NOTES = 50;

export interface IncidentNote {
  at: string;
  text: string;
}

export interface IncidentHistoryEntry {
  at: string;
  action: IncidentActionKind;
  detail?: string;
}

export interface IncidentControls {
  acknowledgedAt?: string | null;
  closedAt?: string | null;
  closeNote?: string | null;
  owner?: string | null;
  silenceUntil?: string | null;
  notes: IncidentNote[];
  history: IncidentHistoryEntry[];
}

export interface IncidentActionRequest {
  action: IncidentActionKind;
  note?: string;
  owner?: string;
  silenceMinutes?: number;
}

export type IncidentActionResult = IncidentControls | { error: string };

export function emptyControls(): IncidentControls {
  return { notes: [], history: [] };
}

export function isIncidentAction(value: unknown): value is IncidentActionKind {
  return typeof value === 'string' && (INCIDENT_ACTIONS as readonly string[]).includes(value);
}

export function isSilenced(controls: IncidentControls | null | undefined, nowMs: number): boolean {
  const until = controls?.silenceUntil;
  if (!until) return false;
  const ts = new Date(until).getTime();
  return Number.isFinite(ts) && ts > nowMs;
}

export function isResolved(controls: IncidentControls | null | undefined, nowMs: number): boolean {
  return Boolean(controls?.closedAt) || isSilenced(controls, nowMs);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, 500);
  return trimmed || null;
}

/**
 * Apply one operator action to an incident's persisted controls.
 * Returns the updated controls, or `{ error }` when the request is invalid.
 * Pure: the caller owns persistence and auditing.
 */
export function applyIncidentAction(
  existing: IncidentControls | null | undefined,
  request: IncidentActionRequest,
  atIso: string,
): IncidentActionResult {
  const controls: IncidentControls = existing
    ? { ...existing, notes: [...(existing.notes ?? [])], history: [...(existing.history ?? [])] }
    : emptyControls();
  const { action } = request;
  let detail: string | undefined;

  switch (action) {
    case 'ack':
      controls.acknowledgedAt = atIso;
      break;
    case 'unack':
      controls.acknowledgedAt = null;
      break;
    case 'close': {
      const note = cleanText(request.note);
      controls.closedAt = atIso;
      controls.closeNote = note;
      if (note) {
        controls.notes.push({ at: atIso, text: note });
        detail = note;
      }
      break;
    }
    case 'reopen':
      controls.closedAt = null;
      controls.closeNote = null;
      break;
    case 'silence': {
      const minutes = Math.floor(Number(request.silenceMinutes));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_SILENCE_MINUTES) {
        return { error: `silenceMinutes must be between 1 and ${MAX_SILENCE_MINUTES}` };
      }
      const base = new Date(atIso).getTime();
      controls.silenceUntil = new Date(base + minutes * 60_000).toISOString();
      detail = `${minutes}m`;
      break;
    }
    case 'unsilence':
      controls.silenceUntil = null;
      break;
    case 'assign': {
      const owner = cleanText(request.owner);
      if (!owner) return { error: 'assign requires a non-empty owner' };
      controls.owner = owner;
      detail = owner;
      break;
    }
    case 'note': {
      const text = cleanText(request.note);
      if (!text) return { error: 'note requires non-empty text' };
      controls.notes.push({ at: atIso, text });
      detail = text;
      break;
    }
    default:
      return { error: 'unknown action' };
  }

  controls.history.push({ at: atIso, action, ...(detail ? { detail } : {}) });
  controls.history = controls.history.slice(-MAX_HISTORY);
  controls.notes = controls.notes.slice(-MAX_NOTES);
  return controls;
}
