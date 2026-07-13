import { createHash } from 'node:crypto';

export const EVENT_KINDS = new Set(['lifecycle.started','lifecycle.ended','lifecycle.failed','phase.changed','tool.started','tool.completed','child.spawned','child.ended','approval.requested','approval.resolved','blocker.reported','blocker.cleared','artifact.produced','retry.scheduled','terminal.completed','terminal.failed','terminal.cancelled']);
export const STATUSES = new Set(['queued','running','waiting_for_tool','waiting_for_approval','blocked','retrying','completed','failed','cancelled','unknown']);
export const PHASES = new Set(['intake','research','implementation','validation','delivery','unknown']);
export const TOOL_CATEGORIES = new Set(['filesystem','code','web_research','browser','messaging','task','session','deployment','database','network','other']);
export const OUTCOMES = new Set(['success','error','cancelled','unknown']);
export const BLOCKERS = new Set(['approval','tool','dependency','resource','policy','unknown']);
const FORBIDDEN_KEY = /(?:prompt|thinking|reasoning|content|message|transcript|tool.?args?|tool.?input|tool.?output|tool.?result|command|environment|env|headers?|cookies?|tokens?|logs?)/i;
const FORBIDDEN_CONTENT = /(?:\b(?:bearer|password|secret|api[-_ ]?key|token)\s*[:=]|-----BEGIN [A-Z ]+PRIVATE KEY-----|(?:^|\s)(?:\/[\w.-]+){2,})/i;
const SAFE_EVENT_KEYS = new Set(['schemaVersion','eventId','occurredAt','agentId','workId','parentWorkId','kind','phase','status','toolCategory','outcome','blockerCategory','artifactRef','retryCount','summary']);

function safeId(value, name) { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`); return value; }
function hashId(prefix, value) { return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`; }
function staticSummary(kind, category, outcome) { if (kind === 'tool.started') return `${category} tool started`; if (kind === 'tool.completed') return `${category} tool ${outcome}`; return kind.replace('.', ' '); }
function toolCategory(name) {
  const value = typeof name === 'string' ? name.toLowerCase() : '';
  if (/^(read|write|edit|apply_patch|glob|grep)$/.test(value)) return 'filesystem';
  if (/(exec|shell|bash|python|node|compile|test|lint)/.test(value)) return 'code';
  if (/(web_search|web_fetch|search)/.test(value)) return 'web_research';
  if (/browser|playwright/.test(value)) return 'browser';
  if (/message|email|slack|discord|telegram/.test(value)) return 'messaging';
  if (/subagent|spawn|taskflow|task/.test(value)) return 'task';
  if (/session/.test(value)) return 'session';
  if (/deploy|docker|kubernetes|systemd/.test(value)) return 'deployment';
  if (/sqlite|database|postgres|mysql/.test(value)) return 'database';
  if (/ssh|network|ping|http/.test(value)) return 'network';
  return 'other';
}

export function assertSafeEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('event must be an object');
  for (const key of Object.keys(value)) { if (FORBIDDEN_KEY.test(key)) throw new Error(`${key} is forbidden`); if (!SAFE_EVENT_KEYS.has(key)) throw new Error(`${key} is not allowed`); }
  if (value.schemaVersion !== 1 || !EVENT_KINDS.has(value.kind) || !STATUSES.has(value.status) || !PHASES.has(value.phase)) throw new Error('event contract is invalid');
  safeId(value.eventId,'eventId'); safeId(value.agentId,'agentId'); safeId(value.workId,'workId'); if (value.parentWorkId !== null) safeId(value.parentWorkId,'parentWorkId');
  if (!Number.isFinite(Date.parse(value.occurredAt))) throw new Error('occurredAt is invalid');
  if (value.toolCategory !== null && !TOOL_CATEGORIES.has(value.toolCategory)) throw new Error('toolCategory is invalid');
  if (value.outcome !== null && !OUTCOMES.has(value.outcome)) throw new Error('outcome is invalid');
  if (value.blockerCategory !== null && !BLOCKERS.has(value.blockerCategory)) throw new Error('blockerCategory is invalid');
  if (value.artifactRef !== null && (typeof value.artifactRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.artifactRef))) throw new Error('artifactRef is invalid');
  if (value.retryCount !== null && (!Number.isInteger(value.retryCount) || value.retryCount < 0)) throw new Error('retryCount is invalid');
  if (typeof value.summary !== 'string' || value.summary.length > 80 || FORBIDDEN_CONTENT.test(value.summary)) throw new Error('summary contains forbidden content');
  return value;
}

export function sanitizeAgentEvent(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.seq) || typeof raw.runId !== 'string' || !['lifecycle','tool','approval'].includes(raw.stream)) return null;
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const occurredAt = new Date(Number.isFinite(raw.ts) ? raw.ts : Date.now()).toISOString();
  const workId = hashId('wrk', raw.runId);
  const agentId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.agentId || '') ? raw.agentId : 'unknown';
  let kind; let status = 'running'; let category = null; let outcome = null; let blockerCategory = null;
  if (raw.stream === 'lifecycle') {
    if (data.phase === 'start') kind = 'lifecycle.started';
    else if (data.phase === 'error') { kind = 'terminal.failed'; status = 'failed'; outcome = 'error'; }
    else if (data.phase === 'end') { kind = 'terminal.completed'; status = 'completed'; outcome = 'success'; }
    else return null;
  } else if (raw.stream === 'tool') {
    category = toolCategory(data.name);
    if (data.phase === 'start') { kind = 'tool.started'; status = 'waiting_for_tool'; }
    else if (data.phase === 'result') { kind = 'tool.completed'; outcome = data.isError === true || data.status === 'failed' ? 'error' : 'success'; }
    else return null;
  } else {
    const approvalStatus = typeof data.status === 'string' ? data.status : 'pending';
    if (data.phase === 'requested') { kind = 'approval.requested'; status = 'waiting_for_approval'; blockerCategory = 'approval'; }
    else if (data.phase === 'resolved') { kind = 'approval.resolved'; status = approvalStatus === 'approved' ? 'running' : approvalStatus === 'denied' ? 'blocked' : 'unknown'; outcome = approvalStatus === 'approved' ? 'success' : approvalStatus === 'denied' ? 'cancelled' : 'unknown'; }
    else return null;
  }
  return assertSafeEvent({schemaVersion:1,eventId:hashId('evt',`${raw.runId}:${raw.seq}`),occurredAt,agentId,workId,parentWorkId:null,kind,phase:'unknown',status,toolCategory:category,outcome,blockerCategory,artifactRef:null,retryCount:null,summary:staticSummary(kind,category,outcome)});
}

export function reduceEvents(events, nowMs = Date.now()) {
  const work = new Map();
  for (const event of events) {
    const previous = work.get(event.workId); if (previous && Date.parse(previous.lastEventAt) > Date.parse(event.occurredAt)) continue;
    const terminal = ['completed','failed','cancelled'].includes(event.status); const startedAt = previous?.startedAt || event.occurredAt; const age=nowMs-Date.parse(event.occurredAt); const freshness=age<=15000?'fresh':age<=120000?'aging':'stale';
    work.set(event.workId,{workId:event.workId,parentWorkId:event.parentWorkId,agentId:event.agentId,source:'session',title:null,goal:null,status:!terminal&&freshness==='stale'?'stale':event.status,phase:event.phase,startedAt,lastEventAt:event.occurredAt,elapsedMs:Math.max(0,(terminal?Date.parse(event.occurredAt):nowMs)-Date.parse(startedAt)),freshness,lastEvent:{category:event.kind.startsWith('tool.')?'tool':event.kind.startsWith('approval.')?'approval':'lifecycle',summary:event.summary},childCount:previous?.childCount||0,blockerCategory:event.blockerCategory,progress:{kind:'indeterminate'},terminal});
  }
  return [...work.values()].sort((a,b)=>b.lastEventAt.localeCompare(a.lastEventAt));
}

export function retainEvents(events,{nowMs=Date.now(),retentionHours=24,maxEvents=2000}={}) { const cutoff=nowMs-retentionHours*3600000; const byId=new Map(); for(const event of events) if(Date.parse(event.occurredAt)>=cutoff) byId.set(event.eventId,event); return [...byId.values()].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)).slice(-maxEvents); }
