'use client';

import { useEffect, useMemo, useState } from 'react';
import { Nav } from '../nav';

type AgentStatus = {
  id: string;
  label: string;
  emoji: string;
  busy: boolean;
  status: 'Working' | 'Idle' | 'Offline';
  lastSeen: string | null;
  currentTask: string | null;
  sessionId: string | null;
};

type TeamMember = {
  key: string;
  type: 'human' | 'agent';
  label: string;
  emoji: string;
  role: string;
  responsibilities: string[];
  agentId?: string;
  planned?: boolean;
  model?: string;
};

const MEMBERS: TeamMember[] = [
  {
    key: 'jeff',
    type: 'human',
    label: 'Jeffa',
    emoji: '🧑💼',
    role: 'Owner / Operator',
    responsibilities: ['Direction & priorities', 'Approvals', 'Ops oversight'],
  },
  {
    key: 'main',
    type: 'agent',
    agentId: 'main',
    label: 'Archie',
    emoji: '🤖',
    role: 'Lead Assistant',
    responsibilities: ['Plan & coordinate work', 'Orchestrate the crew', 'Ship end-to-end slices'],
    model: 'anthropic/claude-sonnet-4-6',
  },
  {
    key: 'archie-pro',
    type: 'agent',
    agentId: 'archie-pro',
    label: 'ArchiePro',
    emoji: '⚡',
    role: 'Pro Assistant',
    responsibilities: ['Separate Telegram channel', 'Parallel task handling', 'Independent context'],
    model: 'anthropic/claude-sonnet-4-6',
  },
  {
    key: 'dev',
    type: 'agent',
    agentId: 'dev',
    label: 'Dev',
    emoji: '🛠️',
    role: 'Developer',
    responsibilities: ['UI + implementation tasks', 'Refactors', 'Bug fixes'],
    model: 'anthropic/claude-sonnet-4-6',
  },
  {
    key: 'writer',
    type: 'agent',
    agentId: 'writer',
    label: 'Quin',
    emoji: '✍️',
    role: 'Writer',
    responsibilities: ['Content, docs, release notes, customer-facing copy'],
    model: 'anthropic/claude-sonnet-4-6',
  },
  {
    key: 'designer',
    type: 'agent',
    agentId: 'designer',
    label: 'Nova',
    emoji: '🎨',
    role: 'Designer',
    responsibilities: ['UX flows, UI concepts, design system, visual mockups'],
    model: 'anthropic/claude-sonnet-4-6',
  },
  {
    key: 'research',
    type: 'agent',
    agentId: 'research',
    label: 'Scout',
    emoji: '🔭',
    role: 'Research',
    responsibilities: ['Deep research, competitor analysis, primary sources, synthesis'],
    model: 'google/gemini-2.5-pro',
  },
  {
    key: 'sec',
    type: 'agent',
    agentId: 'sec',
    label: 'SecSpy',
    emoji: '🕵️',
    role: 'Security',
    responsibilities: ['Security audits', 'Vulnerability analysis', 'Hardening', 'Actionable fixes'],
    model: 'anthropic/claude-sonnet-4-6',
  },
  {
    key: 'travel',
    type: 'agent',
    agentId: 'travel',
    label: 'Travel',
    emoji: '✈️',
    role: 'Travel Assistant',
    responsibilities: ['Trips, flights, planning', 'Itineraries', 'Reminders'],
    model: 'openai/gpt-5.2-pro',
  },
];

const ROLE_ORDER = [
  'Owner / Operator',
  'Lead Assistant',
  'Pro Assistant',
  'Developer',
  'Writer',
  'Designer',
  'Research',
  'Security',
  'Travel Assistant',
];

function pill(status: string, busy: boolean) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.3,
    border: '1px solid rgba(124,232,255,0.22)',
    background: 'rgba(0,0,0,0.18)',
    color: '#9fefff',
  };

  if (status === 'Working') {
    return (
      <span style={{ ...base, background: 'rgba(0,200,255,0.16)', color: '#d6f6ff' }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#00c8ff' }} />
        Working{busy ? ' (tooling)' : ''}
      </span>
    );
  }

  if (status === 'Idle') {
    return (
      <span style={base}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#7CE8FF' }} />
        Idle
      </span>
    );
  }

  return (
    <span style={{ ...base, opacity: 0.75 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: '#64748b' }} />
      Offline
    </span>
  );
}

export default function TeamsClient() {
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch('/api/agents/status', { cache: 'no-store' });
        const j = await res.json();
        if (!alive) return;
        const map: Record<string, AgentStatus> = {};
        const list = j.agents ?? (Array.isArray(j) ? j : []);
        list.forEach((a: AgentStatus) => (map[a.id] = a));
        setAgents(map);
      } catch {
        // ignore
      }
    }

    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, TeamMember[]>();
    for (const r of ROLE_ORDER) m.set(r, []);
    for (const member of MEMBERS) {
      if (!m.has(member.role)) m.set(member.role, []);
      m.get(member.role)!.push(member);
    }
    return m;
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 24,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#d6f6ff',
        background:
          'radial-gradient(1200px 700px at 20% 10%, rgba(0,255,255,0.14), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(0,140,255,0.12), transparent 55%), radial-gradient(900px 600px at 50% 80%, rgba(140,0,255,0.10), transparent 60%), linear-gradient(180deg, #040814 0%, #030513 55%, #02030a 100%)',
      }}
    >
      <div style={{ letterSpacing: 3, fontSize: 12, color: '#7ce8ff', opacity: 0.9 }}>MISSION CONTROL</div>
      <h1 style={{ margin: '6px 0 0', fontSize: 28, textShadow: '0 0 18px rgba(0,220,255,0.25)' }}>
        Team Structure
      </h1>
      <Nav />
      <p style={{ marginTop: 14, color: '#9fefff', maxWidth: 980, lineHeight: 1.6 }}>
        Your active crew. Live status badges update every 15 seconds.
      </p>

      <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        {[...grouped.entries()].map(([role, members]) => {
          if (members.length === 0) return null;
          return (
            <section
              key={role}
              style={{
                border: '1px solid rgba(124,232,255,0.16)',
                borderRadius: 16,
                background: 'rgba(0,0,0,0.22)',
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16, letterSpacing: 0.5, color: '#d6f6ff' }}>{role}</h2>
                <span style={{ fontSize: 12, color: '#9fefff', opacity: 0.85 }}>{members.length} member(s)</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
                {members.map((m) => {
                  const live = m.agentId ? agents[m.agentId] : null;
                  const status = m.planned ? 'Offline' : (live?.status || 'Offline');
                  const busy = Boolean(live?.busy);

                  return (
                    <div
                      key={m.key}
                      style={{
                        border: '1px solid rgba(124,232,255,0.14)',
                        borderRadius: 14,
                        background: 'rgba(0,0,0,0.18)',
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 14,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 22,
                            background: 'rgba(0,200,255,0.10)',
                            border: '1px solid rgba(124,232,255,0.22)',
                          }}
                        >
                          {m.emoji}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 900, color: '#d6f6ff', letterSpacing: 0.3 }}>{m.label}</div>
                          <div style={{ marginTop: 6 }}>{m.type === 'agent' ? pill(status, busy) : (
                            <span style={{ fontSize: 12, color: '#9fefff', opacity: 0.9 }}>Human</span>
                          )}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, color: '#9fefff', fontSize: 12, lineHeight: 1.6 }}>
                        <strong style={{ color: '#d6f6ff' }}>Responsibilities</strong>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                          {m.responsibilities.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </div>

                      {m.type === 'agent' && !m.planned && (
                        <div style={{ marginTop: 10, fontSize: 12, color: '#9fefff', opacity: 0.9 }}>
                          <strong style={{ color: '#d6f6ff' }}>Now:</strong>{' '}
                          {live?.currentTask ? live.currentTask : '—'}
                        </div>
                      )}
                      {m.model && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#7ce8ff', opacity: 0.8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                          {m.model}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
