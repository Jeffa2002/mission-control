import { readFile } from 'node:fs/promises';
import type { SafeAgentSnapshot, SafeWorkProjection } from '../status/safe-work-model';

const TELEMETRY_PATHS = [
  process.env.AGENT_TELEMETRY_FILE || '',
  '/workspace/mission-control/runtime/agent-telemetry.json',
  '/workspace-data/mission-control/runtime/agent-telemetry.json',
  '/var/www/mission-control/runtime/agent-telemetry.json',
  '/app/runtime/agent-telemetry.json',
].filter(Boolean);
const FORBIDDEN_KEY = /(?:prompt|thinking|reasoning|content|message|transcript|tool.?args?|tool.?input|tool.?output|tool.?result|command|environment|env|headers?|cookies?|tokens?|logs?)/i;
const ROOT_KEYS = new Set(['schemaVersion','generatedAt','collector','events','work']);
const COLLECTOR_KEYS = new Set(['status','startedAt','heartbeatAt','lastEventAt','rejectedEvents']);
const WORK_KEYS = new Set(['workId','parentWorkId','agentId','source','title','goal','status','phase','startedAt','lastEventAt','elapsedMs','freshness','lastEvent','childCount','blockerCategory','progress','terminal']);
const EVENT_KEYS = new Set(['schemaVersion','eventId','occurredAt','agentId','workId','parentWorkId','kind','phase','status','toolCategory','outcome','blockerCategory','artifactRef','retryCount','summary']);
const EVENT_KINDS = new Set(['lifecycle.started','lifecycle.ended','lifecycle.failed','phase.changed','tool.started','tool.completed','child.spawned','child.ended','approval.requested','approval.resolved','blocker.reported','blocker.cleared','artifact.produced','retry.scheduled','terminal.completed','terminal.failed','terminal.cancelled']);

export interface LiveTelemetry {
  schemaVersion: 1;
  generatedAt: string;
  collector: { status: 'healthy' | 'stale' | 'unknown'; startedAt: string | null; heartbeatAt: string | null; lastEventAt: string | null; rejectedEvents: number };
  work: Array<SafeWorkProjection & { agentId: string; terminal: boolean }>;
  events: Record<string, unknown>[];
}

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: Set<string>, path: string) { for (const key of Object.keys(value)) { if (FORBIDDEN_KEY.test(key)) throw new Error(`${path}.${key} is forbidden`); if (!allowed.has(key)) throw new Error(`${path}.${key} is not allowed`); } }
function timestamp(value: unknown, path: string) { if (value == null) return null; if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${path} is invalid`); return value; }
function id(value: unknown, path: string) { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error(`${path} is invalid`); return value; }

export function parseLiveTelemetry(value: unknown, nowMs = Date.now()): LiveTelemetry {
  if (!object(value)) throw new Error('telemetry must be an object'); keys(value, ROOT_KEYS, 'telemetry');
  if (value.schemaVersion !== 1 || !object(value.collector) || !Array.isArray(value.events) || !Array.isArray(value.work)) throw new Error('telemetry contract is invalid');
  keys(value.collector, COLLECTOR_KEYS, 'telemetry.collector');
  const generatedAt = timestamp(value.generatedAt, 'telemetry.generatedAt'); if (!generatedAt) throw new Error('generatedAt is required');
  const heartbeatAt = timestamp(value.collector.heartbeatAt, 'collector.heartbeatAt');
  const rawStatus = value.collector.status === 'healthy' ? 'healthy' : 'unknown';
  const status = !heartbeatAt ? 'unknown' : nowMs - Date.parse(heartbeatAt) > 15_000 ? 'stale' : rawStatus;
  const events = value.events.map((candidate, index) => {
    if (!object(candidate)) throw new Error(`events[${index}] must be an object`); keys(candidate, EVENT_KEYS, `events[${index}]`);
    if (candidate.schemaVersion !== 1 || !EVENT_KINDS.has(String(candidate.kind))) throw new Error(`events[${index}] contract is invalid`);
    id(candidate.eventId, 'eventId'); id(candidate.agentId, 'agentId'); id(candidate.workId, 'workId');
    if (candidate.parentWorkId != null) id(candidate.parentWorkId, 'parentWorkId');
    timestamp(candidate.occurredAt, 'occurredAt');
    if (typeof candidate.summary !== 'string' || candidate.summary.length > 80 || FORBIDDEN_KEY.test(candidate.summary)) throw new Error(`events[${index}].summary is invalid`);
    return candidate;
  });
  const work = value.work.map((candidate, index) => {
    if (!object(candidate)) throw new Error(`work[${index}] must be an object`); keys(candidate, WORK_KEYS, `work[${index}]`);
    const statusValues = ['queued','running','waiting_for_tool','waiting_for_approval','blocked','retrying','completed','failed','cancelled','stale','unknown'];
    const phaseValues = ['intake','research','implementation','validation','delivery','unknown'];
    const freshnessValues = ['fresh','aging','stale','unknown'];
    if (!statusValues.includes(String(candidate.status)) || !phaseValues.includes(String(candidate.phase)) || !freshnessValues.includes(String(candidate.freshness))) throw new Error(`work[${index}] enum is invalid`);
    if (!object(candidate.lastEvent) || !object(candidate.progress) || candidate.progress.kind !== 'indeterminate') throw new Error(`work[${index}] nested contract is invalid`);
    const summary = candidate.lastEvent.summary;
    if (typeof summary !== 'string' || summary.length > 80 || FORBIDDEN_KEY.test(summary)) throw new Error(`work[${index}].lastEvent.summary is invalid`);
    return {workId:id(candidate.workId,'workId'),parentWorkId:candidate.parentWorkId==null?null:id(candidate.parentWorkId,'parentWorkId'),agentId:id(candidate.agentId,'agentId'),source:'session' as const,title:null,goal:null,status:candidate.status as SafeWorkProjection['status'],phase:candidate.phase as SafeWorkProjection['phase'],startedAt:timestamp(candidate.startedAt,'startedAt'),lastEventAt:timestamp(candidate.lastEventAt,'lastEventAt'),elapsedMs:typeof candidate.elapsedMs==='number'&&candidate.elapsedMs>=0?candidate.elapsedMs:null,freshness:candidate.freshness as SafeWorkProjection['freshness'],lastEvent:{category:candidate.lastEvent.category as NonNullable<SafeWorkProjection['lastEvent']>['category'],summary},childCount:Number.isInteger(candidate.childCount)&&Number(candidate.childCount)>=0?Number(candidate.childCount):0,blockerCategory:(candidate.blockerCategory??null) as SafeWorkProjection['blockerCategory'],progress:{kind:'indeterminate'} as const,terminal:candidate.terminal===true};
  });
  return {schemaVersion:1,generatedAt,collector:{status,startedAt:timestamp(value.collector.startedAt,'collector.startedAt'),heartbeatAt,lastEventAt:timestamp(value.collector.lastEventAt,'collector.lastEventAt'),rejectedEvents:Number.isInteger(value.collector.rejectedEvents)?Number(value.collector.rejectedEvents):0},events,work};
}

export async function loadLiveTelemetry(nowMs = Date.now()): Promise<LiveTelemetry | null> { for (const path of TELEMETRY_PATHS) { try { return parseLiveTelemetry(JSON.parse(await readFile(path,'utf8')),nowMs); } catch {} } return null; }

export function overlayLiveWork(agents: SafeAgentSnapshot[], telemetry: LiveTelemetry | null): SafeAgentSnapshot[] {
  if (!telemetry || telemetry.collector.status !== 'healthy') return agents;
  const latest = new Map<string, LiveTelemetry['work'][number]>();
  for (const work of telemetry.work) { const current=latest.get(work.agentId); if (!current || Date.parse(work.lastEventAt||'')>Date.parse(current.lastEventAt||'')) latest.set(work.agentId,work); }
  const seen = new Set<string>();
  const merged = agents.map(agent=>{const live=latest.get(agent.id);seen.add(agent.id);if(!live||live.terminal||Date.parse(live.lastEventAt||'')<=Date.parse(agent.work?.lastEventAt||''))return agent;return {...agent,busy:true,status:'Working' as const,lastSeen:live.lastEventAt,work:live};});
  for (const [agentId,live] of latest) if(!seen.has(agentId)&&!live.terminal) merged.push({id:agentId,label:agentId,emoji:'🤖',busy:true,status:'Working',lastSeen:live.lastEventAt,work:live});
  return merged;
}

export function serializeSse(event: string, data: unknown, idValue?: string) { const idLine=idValue?`id: ${idValue}\n`:''; return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; }
