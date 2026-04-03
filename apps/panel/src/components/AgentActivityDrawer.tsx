'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Agent = {
  id: string;
  label: string;
  emoji: string;
  status: string;
  lastSeen: string | null;
  currentTask: string | null;
};

type ActivityEvent = {
  id: string;
  timestamp: string;
  type: 'message' | 'tool_call' | 'tool_result' | 'thinking';
  role?: string;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  summary: string;
};

function hhmmss(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function compactInput(input: unknown) {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, any>;
  if (typeof obj.command === 'string') return obj.command;
  if (typeof obj.input === 'string') return obj.input;
  if (typeof obj.text === 'string') return obj.text;
  try { return JSON.stringify(input); } catch { return ''; }
}

function EventRow({ event }: { event: ActivityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const long = event.content.length > 180;
  const shown = expanded || !long ? event.content : `${event.content.slice(0, 180)}…`;
  const color = event.type === 'tool_call' ? '#70d7ff' : event.type === 'tool_result' ? '#7dffb2' : event.type === 'thinking' ? '#c08bff' : event.role === 'user' ? '#9ba7b8' : '#f3f7ff';
  const style = event.type === 'thinking' || event.role === 'user' ? { fontStyle: 'italic' as const, opacity: 0.8 } : {};

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ color: '#6c7688', fontSize: 11, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>{hhmmss(event.timestamp)}</div>
      <div style={{ color, fontSize: 13, lineHeight: 1.5, ...style }}>
        {event.type === 'tool_call' ? (
          <>
            <span style={{ color: '#58d7ff' }}>🔧 {event.toolName || 'tool'}</span>
            <span style={{ color: '#d5f8ff' }}>: {compactInput(event.toolInput) || event.summary}</span>
          </>
        ) : event.type === 'tool_result' ? (
          <>
            <span style={{ color: '#7dffb2' }}>✅ {event.summary}</span>
          </>
        ) : (
          <>
            <span>{shown}</span>
            {long && (
              <button onClick={() => setExpanded((v) => !v)} style={{ marginLeft: 8, border: 'none', background: 'transparent', color: '#7ce8ff', cursor: 'pointer', fontSize: 11 }}>
                {expanded ? 'show less' : 'show more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AgentActivityDrawer({ agent, open, onClose }: { agent: Agent | null; open: boolean; onClose: () => void; }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const [lastPoll, setLastPoll] = useState(Date.now());
  const scroller = useRef<HTMLDivElement | null>(null);
  const lastTimestampRef = useRef('');

  const title = useMemo(() => agent?.label || 'Agent', [agent]);

  useEffect(() => {
    if (!open || !agent) return;
    let cancelled = false;
    setEvents([]);
    lastTimestampRef.current = '';
    setOffline(false);

    async function load(initial = false) {
      const since = lastTimestampRef.current;
      const url = initial || !since ? `/api/agents/${agent.id}/activity` : `/api/agents/${agent.id}/activity?since=${encodeURIComponent(since)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      const newEvents: ActivityEvent[] = j.events ?? [];
      if (cancelled) return;
      if (initial) setEvents(newEvents);
      else if (newEvents.length) setEvents((prev) => [...prev, ...newEvents]);
      if (newEvents.length) lastTimestampRef.current = newEvents[newEvents.length - 1].timestamp;
      setLastPoll(Date.now());
    }

    load(true);
    const t = setInterval(() => load(false), 2000);
    const offlineT = setInterval(() => setOffline(agent.status === 'Working' && Date.now() - lastPoll > 30000), 1000);
    return () => { cancelled = true; clearInterval(t); clearInterval(offlineT); };
  }, [open, agent?.id]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [events.length, open]);

  if (!open || !agent) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', pointerEvents: 'auto' }} />
      <aside style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 'min(480px, 100vw)', background: 'rgba(10,10,10,0.97)', borderLeft: '1px solid rgba(255,255,255,0.1)', boxShadow: '-20px 0 60px rgba(0,0,0,0.45)', transform: 'translateX(0)', transition: 'transform 200ms ease', pointerEvents: 'auto', display: 'flex', flexDirection: 'column' }}>
        <style>{`@media (max-width: 720px){aside{width:100vw !important;}}`}</style>
        <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{agent.emoji}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#f2f7ff', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: '#9ba7b8' }}>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>{agent.status}</span>
                {(agent.status === 'Working') && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#7dffb2' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7dffb2', boxShadow: '0 0 10px #7dffb2', animation: 'pulse 1.2s ease-in-out infinite' }} />Live</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', cursor: 'pointer' }}>✕</button>
        </div>
        <div ref={scroller} style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace", background: '#0a0a0a' }}>
          {offline && <div style={{ marginBottom: 12, color: '#ffb26b', fontSize: 12 }}>Agent went offline</div>}
          {events.length === 0 ? (
            <div style={{ color: '#8b93a6', fontSize: 13 }}>No activity yet<span style={{ animation: 'blink 1s steps(2,end) infinite' }}>▍</span></div>
          ) : events.map((event) => <EventRow key={event.id} event={event} />)}
        </div>
      </aside>
      <style>{`@keyframes blink{50%{opacity:0}} @keyframes pulse{50%{opacity:.45; transform:scale(.85)}}`}</style>
    </div>
  );
}
