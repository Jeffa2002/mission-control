'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/ops-ui';
import styles from './page.module.css';

type Tone = 'nominal' | 'attention' | 'incident' | 'unknown';
type ActivitySeverity = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

type AgentStatusItem = {
  id: string;
  label?: string;
  emoji?: string;
  status?: string;
  busy?: boolean;
  uptime?: string;
  restarts?: number;
  pm_id?: number;
};

type HealthData = {
  ok: boolean;
  overall: 'green' | 'amber' | 'red';
  checks: Record<string, { status: string; detail?: string }>;
  checked_at: string;
};

type EffectxApp = {
  id: string;
  name: string;
  description?: string;
  url: string;
  iconUrl?: string;
  status: 'up' | 'degraded' | 'down' | 'unknown';
  kind?: string;
  latencyMs?: number;
  ssl?: { daysRemaining: number; valid: boolean };
};

type Deploy = {
  id: string;
  app: string;
  commit: string;
  commitMsg: string;
  branch: string;
  status: 'success' | 'failure' | 'running';
  triggeredBy: string;
  startedAt: string;
  durationS?: number;
};

type HostData = {
  ok?: boolean;
  reachable?: boolean;
  label?: string;
  error?: string;
  checkedAt?: string;
  cpu?: { pct?: number | null; cores?: number };
  memory?: { pct?: number; used_pct?: number; usedMb?: number; totalMb?: number } | null;
  disk?: { pct?: number | string; used_pct?: number } | null;
  uptime?: { pretty?: string | null; since?: string | null } | string | null;
  containerCount?: number;
};

type ActivityItem = {
  id: string;
  ts: string;
  source: string;
  title: string;
  detail: string;
  severity: ActivitySeverity;
  href?: string;
  eventType?: string;
};

type PromAlert = {
  state?: string;
  activeAt?: string;
  value?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
};

type BriefData = {
  health: HealthData | null;
  agents: AgentStatusItem[];
  apps: EffectxApp[];
  deploys: Deploy[];
  activity: ActivityItem[];
  alerts: PromAlert[];
  bazza: HostData | null;
  shazza: HostData | null;
  network: {
    nodes: Array<{ id: string; label: string; role: string; status: 'online' | 'degraded' | 'offline'; latencyMs: number | null }>;
    measuredAt?: string;
    stale?: boolean;
  } | null;
};

type InspectorItem = {
  key: string;
  group: 'Action' | 'Application' | 'Host' | 'Agent';
  title: string;
  tone: Tone;
  state: string;
  summary: string;
  facts: Array<[string, string]>;
  href: string;
  hrefLabel: string;
  suggestion: string;
  metric?: { label: string; value: number; threshold: number; unit: string };
};

type QueueItem = InspectorItem & { rank: number; priority: number; age?: string };

type ChangeItem = {
  id: string;
  title: string;
  detail: string;
  ts: string;
  tone: Tone;
  source: string;
  href: string;
};

const EMPTY_DATA: BriefData = {
  health: null,
  agents: [],
  apps: [],
  deploys: [],
  activity: [],
  alerts: [],
  bazza: null,
  shazza: null,
  network: null,
};

function toneLabel(tone: Tone) {
  if (tone === 'nominal') return 'Nominal';
  if (tone === 'attention') return 'Attention';
  if (tone === 'incident') return 'Incident';
  return 'Unknown';
}

function relativeTime(value?: string) {
  if (!value) return 'Time unavailable';
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return 'Time unavailable';
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function numericPercent(value?: number | string | null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace('%', ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function hostMemory(host: HostData | null) {
  return numericPercent(host?.memory?.pct ?? host?.memory?.used_pct);
}

function hostDisk(host: HostData | null) {
  return numericPercent(host?.disk?.pct ?? host?.disk?.used_pct);
}

function hostUptime(host: HostData | null) {
  if (typeof host?.uptime === 'string') return host.uptime;
  return host?.uptime?.pretty ?? undefined;
}

function appTone(status: EffectxApp['status']): Tone {
  if (status === 'up') return 'nominal';
  if (status === 'degraded') return 'attention';
  if (status === 'down') return 'incident';
  return 'unknown';
}

function activityTone(severity: ActivitySeverity): Tone {
  if (severity === 'critical') return 'incident';
  if (severity === 'warning') return 'attention';
  if (severity === 'healthy' || severity === 'info') return 'nominal';
  return 'unknown';
}

function hostTone(host: HostData | null): Tone {
  if (!host) return 'unknown';
  if (host.ok === false || host.reachable === false) return 'incident';
  const memory = hostMemory(host);
  const disk = hostDisk(host);
  if ((memory ?? 0) >= 90 || (disk ?? 0) >= 95) return 'incident';
  if ((memory ?? 0) >= 75 || (disk ?? 0) >= 85) return 'attention';
  return 'nominal';
}

function agentTone(agent: AgentStatusItem): Tone {
  const status = (agent.status ?? '').toLowerCase();
  if (status === 'working' || status === 'idle') return 'nominal';
  if (status === 'offline') return 'attention';
  return 'unknown';
}

function ToneBadge({ tone, label }: { tone: Tone; label?: string }) {
  return (
    <span className={styles.toneBadge} data-tone={tone}>
      <span aria-hidden="true" />
      {label ?? toneLabel(tone)}
    </span>
  );
}

function SectionHeading({ eyebrow, title, copy, action }: {
  eyebrow: string;
  title: string;
  copy?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        {copy ? <p className={styles.sectionCopy}>{copy}</p> : null}
      </div>
      {action}
    </div>
  );
}

function makeAppInspector(app: EffectxApp): InspectorItem {
  const tone = appTone(app.status);
  const ssl = !app.ssl ? 'Not reported' : app.ssl.valid ? `${app.ssl.daysRemaining} days remaining` : 'Invalid or expired';
  return {
    key: `app:${app.id}`,
    group: 'Application',
    title: app.name,
    tone,
    state: app.status === 'up' ? 'Online' : app.status === 'degraded' ? 'Degraded' : app.status === 'down' ? 'Down' : 'Unknown',
    summary: app.description || `Live application check for ${app.name}.`,
    facts: [
      ['Status', app.status],
      ['Latency', app.latencyMs == null ? 'Not reported' : `${app.latencyMs} ms`],
      ['TLS', ssl],
      ['Type', app.kind ?? 'app'],
    ],
    href: '/apps',
    hrefLabel: 'Open app health',
    suggestion: tone === 'incident' ? 'Confirm the failed health check before opening an incident.' : tone === 'attention' ? 'Review latency, TLS, and upstream health.' : 'No action required.',
  };
}

function makeHostInspector(id: string, host: HostData | null): InspectorItem {
  const title = host?.label || (id === 'bazza' ? 'Bazza' : 'Shazza');
  const tone = hostTone(host);
  const memory = hostMemory(host);
  const disk = hostDisk(host);
  const primaryMetric = (memory ?? 0) >= 75
    ? { label: 'Memory', value: memory ?? 0, threshold: 90, unit: '%' }
    : (disk ?? 0) >= 85
      ? { label: 'Disk', value: disk ?? 0, threshold: 95, unit: '%' }
      : undefined;
  return {
    key: `host:${id}`,
    group: 'Host',
    title,
    tone,
    state: tone === 'incident' ? 'Unavailable' : tone === 'attention' ? 'Watching' : tone === 'nominal' ? 'Healthy' : 'Unknown',
    summary: host?.error || (tone === 'attention' ? 'A host resource has crossed its preferred operating range.' : tone === 'nominal' ? 'Reachability and reported host resources are within operating thresholds.' : 'Host telemetry is not currently available.'),
    facts: [
      ['Reachability', host?.reachable === false || host?.ok === false ? 'Unreachable' : host ? 'Reachable' : 'Unknown'],
      ['Memory', memory == null ? 'Not reported' : `${Math.round(memory)}%`],
      ['Disk', disk == null ? 'Not reported' : `${Math.round(disk)}%`],
      ['Uptime', hostUptime(host) || 'Not reported'],
    ],
    href: '/estate',
    hrefLabel: 'Open estate detail',
    suggestion: tone === 'incident' ? 'Check host reachability and dependent services now.' : tone === 'attention' ? 'Review resource use before it reaches the escalation threshold.' : 'No action required.',
    metric: primaryMetric,
  };
}

function makeAgentInspector(agent: AgentStatusItem): InspectorItem {
  const tone = agentTone(agent);
  const status = agent.status || 'Unknown';
  return {
    key: `agent:${agent.id}`,
    group: 'Agent',
    title: agent.label || agent.id,
    tone,
    state: status,
    summary: tone === 'attention' ? 'The agent process is reported offline.' : tone === 'nominal' ? `The agent is ${status.toLowerCase()} and available in the mesh.` : 'Agent state has not been reported.',
    facts: [
      ['State', status],
      ['Busy', agent.busy == null ? 'Not reported' : agent.busy ? 'Yes' : 'No'],
      ['Uptime', agent.uptime || 'Not reported'],
      ['Restarts', agent.restarts == null ? 'Not reported' : String(agent.restarts)],
    ],
    href: `/agents/${encodeURIComponent(agent.id)}`,
    hrefLabel: 'Open agent detail',
    suggestion: tone === 'attention' ? 'Check the agent process before assigning new work.' : 'No action required.',
  };
}

function buildQueue(data: BriefData): QueueItem[] {
  const items: Array<Omit<QueueItem, 'rank'>> = [];

  data.alerts.filter((alert) => alert.state === 'firing').forEach((alert, index) => {
    const severity = (alert.labels?.severity ?? '').toLowerCase();
    const tone: Tone = severity === 'critical' || severity === 'page' ? 'incident' : 'attention';
    const name = alert.labels?.alertname || `Monitoring alert ${index + 1}`;
    items.push({
      key: `alert:${name}:${index}`,
      group: 'Action',
      title: name,
      tone,
      state: 'Firing',
      summary: alert.annotations?.summary || alert.annotations?.description || 'Prometheus reports an active alert.',
      facts: [
        ['State', alert.state || 'firing'],
        ['Severity', alert.labels?.severity || 'Not labelled'],
        ['Instance', alert.labels?.instance || 'Not labelled'],
        ['Value', alert.value || 'Not reported'],
      ],
      href: '/incidents',
      hrefLabel: 'Review incidents',
      suggestion: 'Validate impact and follow the relevant incident runbook.',
      priority: tone === 'incident' ? 100 : 78,
      age: relativeTime(alert.activeAt),
    });
  });

  Object.entries(data.health?.checks ?? {}).forEach(([name, check]) => {
    if (check.status !== 'error' && check.status !== 'degraded') return;
    const tone: Tone = check.status === 'error' ? 'incident' : 'attention';
    items.push({
      key: `health:${name}`,
      group: 'Action',
      title: name.replaceAll('_', ' '),
      tone,
      state: check.status === 'error' ? 'Failed' : 'Degraded',
      summary: check.detail || 'Health check requires review.',
      facts: [['Check', name], ['State', check.status], ['Detail', check.detail || 'Not reported']],
      href: '/systems',
      hrefLabel: 'Review systems',
      suggestion: check.status === 'error' ? 'Confirm service impact and escalate if persistent.' : 'Review the degraded check before it worsens.',
      priority: tone === 'incident' ? 96 : 72,
      age: relativeTime(data.health?.checked_at),
    });
  });

  data.apps.forEach((app) => {
    const inspector = makeAppInspector(app);
    const tlsIncident = app.ssl && !app.ssl.valid;
    const tlsAttention = app.ssl && app.ssl.valid && app.ssl.daysRemaining < 14;
    if (inspector.tone === 'nominal' && !tlsIncident && !tlsAttention) return;
    const tone: Tone = tlsIncident || inspector.tone === 'incident' ? 'incident' : inspector.tone === 'unknown' ? 'attention' : 'attention';
    items.push({
      ...inspector,
      tone,
      state: tlsIncident ? 'TLS invalid' : tlsAttention ? 'TLS expiring' : inspector.state,
      summary: tlsIncident ? 'The reported TLS certificate is invalid or expired.' : tlsAttention ? `TLS certificate expires in ${app.ssl?.daysRemaining} days.` : inspector.summary,
      priority: tone === 'incident' ? 92 : 68,
    });
  });

  [makeHostInspector('bazza', data.bazza), makeHostInspector('shazza', data.shazza)].forEach((host) => {
    if (host.tone !== 'incident' && host.tone !== 'attention') return;
    items.push({ ...host, priority: host.tone === 'incident' ? 90 : 66 });
  });

  const latestDeploys = new Map<string, Deploy>();
  [...data.deploys]
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
    .forEach((deploy) => {
      if (!latestDeploys.has(deploy.app)) latestDeploys.set(deploy.app, deploy);
    });

  latestDeploys.forEach((deploy) => {
    if (deploy.status === 'success') return;
    const tone: Tone = deploy.status === 'failure' ? 'incident' : 'attention';
    items.push({
      key: `deploy:${deploy.id}`,
      group: 'Action',
      title: `${deploy.app} deploy ${deploy.status}`,
      tone,
      state: deploy.status === 'failure' ? 'Failed' : 'In progress',
      summary: deploy.commitMsg || `${deploy.branch} at ${deploy.commit}`,
      facts: [['Application', deploy.app], ['Branch', deploy.branch], ['Commit', deploy.commit || 'Not reported'], ['Triggered by', deploy.triggeredBy || 'Not reported']],
      href: '/deploys',
      hrefLabel: 'Open deploys',
      suggestion: deploy.status === 'failure' ? 'Review the deployment log and confirm service health.' : 'Observe service health until the deployment completes.',
      priority: tone === 'incident' ? 88 : 62,
      age: relativeTime(deploy.startedAt),
    });
  });

  data.agents.forEach((agent) => {
    const inspector = makeAgentInspector(agent);
    if (inspector.tone !== 'attention') return;
    items.push({ ...inspector, priority: 45 });
  });

  return items
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 6)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function buildChanges(data: BriefData): ChangeItem[] {
  const activity: ChangeItem[] = data.activity
    .filter((item) => item.source !== 'deploys' && !item.eventType?.endsWith('.snapshot') && item.eventType !== 'audit.login')
    .map((item) => ({
    id: `activity:${item.id}`,
    title: item.title,
    detail: item.detail,
    ts: item.ts,
    tone: activityTone(item.severity),
    source: item.source,
    href: item.href || '/activity',
    }));
  const latestDeploys = new Map<string, Deploy>();
  [...data.deploys]
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
    .forEach((deploy) => {
      if (!latestDeploys.has(deploy.app)) latestDeploys.set(deploy.app, deploy);
    });
  const deploys: ChangeItem[] = [...latestDeploys.values()].map((deploy) => ({
    id: `deploy:${deploy.id}`,
    title: `${deploy.app} deploy ${deploy.status}`,
    detail: [deploy.branch, deploy.commit?.slice(0, 8), deploy.commitMsg].filter(Boolean).join(' · '),
    ts: deploy.startedAt,
    tone: deploy.status === 'failure' ? 'incident' : deploy.status === 'running' ? 'attention' : 'nominal',
    source: 'deploy',
    href: '/deploys',
  }));
  const seen = new Set<string>();
  return [...activity, ...deploys]
    .filter((item) => {
      const key = `${item.title}:${item.ts}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => new Date(right.ts).getTime() - new Date(left.ts).getTime())
    .slice(0, 5);
}

function SignalRibbon({ changes, currentTone }: { changes: ChangeItem[]; currentTone: Tone }) {
  const now = Date.now();
  const bins = Array.from({ length: 24 }, (_, index) => {
    const start = now - (23 - index) * 3_600_000;
    const end = start + 3_600_000;
    const events = changes.filter((change) => {
      const time = new Date(change.ts).getTime();
      return time >= start && time < end;
    });
    let tone: Tone = 'unknown';
    if (events.some((event) => event.tone === 'incident')) tone = 'incident';
    else if (events.some((event) => event.tone === 'attention')) tone = 'attention';
    else if (events.length > 0) tone = 'nominal';
    if (index === 23 && currentTone !== 'unknown' && tone === 'unknown') tone = currentTone;
    return { tone, count: events.length, start };
  });
  const eventCount = bins.reduce((sum, bin) => sum + bin.count, 0);

  return (
    <section className={styles.ribbonPanel} aria-labelledby="signal-title">
      <div className={styles.ribbonIntro}>
        <p className={styles.eyebrow}>Last 24 hours</p>
        <h2 id="signal-title">Signal ribbon</h2>
        <p>{eventCount ? `${eventCount} recorded operational changes` : 'No timestamped changes in the loaded activity window'}</p>
      </div>
      <div className={styles.ribbon} role="img" aria-label={`Twenty-four hour operational signal ribbon with ${eventCount} recorded changes`}>
        {bins.map((bin, index) => (
          <span
            key={bin.start}
            data-tone={bin.tone}
            title={`${new Date(bin.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${bin.count ? `${bin.count} recorded change${bin.count === 1 ? '' : 's'}` : index === 23 && bin.tone !== 'unknown' ? `current state ${toneLabel(bin.tone)}` : 'no recorded change'}`}
          />
        ))}
      </div>
      <div className={styles.ribbonScale} aria-hidden="true"><span>24h ago</span><span>12h</span><span>Now</span></div>
    </section>
  );
}

function Inspector({ item, onClose }: { item: InspectorItem | null; onClose: () => void }) {
  const [actionState, setActionState] = useState<'idle' | 'busy'>('idle');
  const [actionMessage, setActionMessage] = useState('');

  async function captureDiagnostics() {
    if (!item) return;
    setActionState('busy');
    setActionMessage('Recording diagnostic intent…');
    try {
      const response = await fetch('/api/runbook-actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'capture_diagnostics', source: `operational_brief:${item.key}` }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to record diagnostic intent');
      setActionMessage(result.next || 'Diagnostic intent recorded in the audit trail.');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Unable to record diagnostic intent');
    } finally {
      setActionState('idle');
    }
  }

  if (!item) {
    return (
      <aside className={styles.inspector} aria-label="Contextual inspector">
        <p className={styles.eyebrow}>Context</p>
        <h2>Select an operational signal</h2>
        <p className={styles.inspectorSummary}>Choose an action or estate node to inspect the evidence behind its current state.</p>
      </aside>
    );
  }

  return (
    <aside className={styles.inspector} aria-label="Contextual inspector" aria-live="polite">
      <div className={styles.inspectorTop}>
        <div><p className={styles.eyebrow}>{item.group}</p><h2>{item.title}</h2></div>
        <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Clear inspector selection">×</button>
      </div>
      <div className={styles.inspectorState}><ToneBadge tone={item.tone} label={item.state} /></div>
      <p className={styles.inspectorSummary}>{item.summary}</p>
      <dl className={styles.facts}>
        {item.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {item.metric ? (
        <div className={styles.threshold}>
          <div><span>{item.metric.label} threshold</span><strong>{Math.round(item.metric.value)}{item.metric.unit} / {item.metric.threshold}{item.metric.unit}</strong></div>
          <div className={styles.thresholdTrack} aria-hidden="true"><span style={{ width: `${Math.min(100, item.metric.value)}%` }} /></div>
          <small>Escalation threshold is explicit; current value comes from the host endpoint.</small>
        </div>
      ) : null}
      <div className={styles.inspectorActions}>
        <Link className={styles.primaryAction} href={item.href}>{item.hrefLabel}</Link>
        <button className={styles.secondaryAction} type="button" onClick={captureDiagnostics} disabled={actionState === 'busy'}>{actionState === 'busy' ? 'Recording…' : 'Capture diagnostics'}</button>
      </div>
      {actionMessage ? <p className={styles.actionMessage} role="status">{actionMessage}</p> : null}
      <div className={styles.inspectorNote}><span>Suggested next step</span><p>{item.suggestion}</p></div>
    </aside>
  );
}

function Queue({ items, selectedKey, onSelect }: { items: QueueItem[]; selectedKey?: string; onSelect: (item: QueueItem) => void }) {
  return (
    <section className={`${styles.panel} ${styles.queuePanel}`} aria-labelledby="queue-title">
      <SectionHeading eyebrow="Priority" title="Needs action" copy="Ranked by confirmed impact, threshold, and operator actionability." action={<Link href="/incidents">Incidents →</Link>} />
      {items.length ? (
        <ol className={styles.queueList}>
          {items.map((item) => (
            <li key={item.key}>
              <button type="button" className={styles.queueItem} data-selected={selectedKey === item.key} onClick={() => onSelect(item)}>
                <span className={styles.rank}>{String(item.rank).padStart(2, '0')}</span>
                <span className={styles.queueBody}><span><ToneBadge tone={item.tone} label={item.state} />{item.age ? <time>{item.age}</time> : null}</span><strong>{item.title}</strong><small>{item.summary}</small></span>
                <span className={styles.inspectArrow} aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyState}><ToneBadge tone="nominal" label="Clear" /><strong>No ranked action items</strong><p>Loaded checks, alerts, hosts, apps, deploys, and agents have not produced an actionable condition.</p></div>
      )}
    </section>
  );
}

function Changes({ items }: { items: ChangeItem[] }) {
  return (
    <section className={`${styles.panel} ${styles.changesPanel}`} aria-labelledby="changes-title">
      <SectionHeading eyebrow="Change log" title="What changed" copy="Most recent deploy and activity records." action={<Link href="/activity">Activity →</Link>} />
      {items.length ? (
        <div className={styles.changeList}>
          {items.map((item) => (
            <Link href={item.href} key={item.id} className={styles.changeItem}>
              <span className={styles.changeIcon} data-tone={item.tone} aria-hidden="true">{item.source === 'deploy' ? '↥' : item.tone === 'incident' ? '!' : item.tone === 'attention' ? '↗' : '✓'}</span>
              <span><strong>{item.title}</strong><small>{item.detail || item.source}</small></span>
              <time dateTime={item.ts}>{relativeTime(item.ts)}</time>
            </Link>
          ))}
        </div>
      ) : <div className={styles.emptyState}><strong>No recent changes loaded</strong><p>The activity and deployment endpoints returned no records.</p></div>}
    </section>
  );
}

function Constellation({ data, selectedKey, onSelect }: { data: BriefData; selectedKey?: string; onSelect: (item: InspectorItem) => void }) {
  const groups = [
    { label: 'Applications', items: data.apps.slice(0, 8).map(makeAppInspector) },
    { label: 'Hosts', items: [makeHostInspector('bazza', data.bazza), makeHostInspector('shazza', data.shazza)] },
    { label: 'Agent mesh', items: data.agents.map(makeAgentInspector) },
  ];

  return (
    <section className={`${styles.panel} ${styles.constellation}`} aria-labelledby="constellation-title">
      <SectionHeading eyebrow="Estate" title="Service constellation" copy="Live applications, hosts, and agents. Select a node to inspect its evidence." action={<Link href="/estate">Full estate →</Link>} />
      <div className={styles.constellationLegend} aria-label="State legend"><ToneBadge tone="nominal" /><ToneBadge tone="attention" /><ToneBadge tone="incident" /><ToneBadge tone="unknown" /></div>
      <div className={styles.constellationMap}>
        {groups.map((group, groupIndex) => (
          <div className={styles.constellationColumn} key={group.label}>
            <h3>{group.label}<span>{group.items.length}</span></h3>
            <ul>
              {group.items.length ? group.items.map((item) => (
                <li key={item.key}>
                  <button type="button" data-tone={item.tone} data-selected={selectedKey === item.key} onClick={() => onSelect(item)} aria-label={`Inspect ${item.title}, ${item.state}`}>
                    <span className={styles.nodeMark} aria-hidden="true">{item.title.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
                    <span><strong>{item.title}</strong><small>{item.state}</small></span>
                  </button>
                </li>
              )) : <li className={styles.noNodes}>No live records</li>}
            </ul>
            {groupIndex < groups.length - 1 ? <span className={styles.connector} aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

async function fetchJson(path: string) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

export default function Home() {
  const [data, setData] = useState<BriefData>(EMPTY_DATA);
  const [selected, setSelected] = useState<InspectorItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    const requests = [
      ['health', '/api/health'], ['agents', '/api/agents/status'], ['apps', '/api/effectx'],
      ['deploys', '/api/deploys'], ['activity', '/api/activity?limit=24'], ['alerts', '/api/alerts'],
      ['bazza', '/api/bazza'], ['shazza', '/api/shazza'], ['network', '/api/network'],
    ] as const;
    const results = await Promise.allSettled(requests.map(([, path]) => fetchJson(path)));
    const failures: string[] = [];
    const next: Partial<BriefData> = {};
    results.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === 'rejected') {
        failures.push(`${key}: ${result.reason instanceof Error ? result.reason.message : 'request failed'}`);
        return;
      }
      const value = result.value;
      if (key === 'health') next.health = value;
      if (key === 'agents') next.agents = value.agents ?? [];
      if (key === 'apps') next.apps = value.apps ?? [];
      if (key === 'deploys') next.deploys = value.deploys ?? [];
      if (key === 'activity') next.activity = value.items ?? [];
      if (key === 'alerts') next.alerts = value.data?.alerts ?? [];
      if (key === 'bazza') next.bazza = value;
      if (key === 'shazza') next.shazza = value;
      if (key === 'network') next.network = value;
    });
    setData((current) => ({ ...current, ...next }));
    setErrors(failures);
    if (results.some((result) => result.status === 'fulfilled')) setUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const refreshTimer = window.setInterval(() => load(true), 30_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [load]);

  const queue = useMemo(() => buildQueue(data), [data]);
  const changes = useMemo(() => buildChanges(data), [data]);
  const firingAlerts = data.alerts.filter((alert) => alert.state === 'firing').length;
  const incidentCount = queue.filter((item) => item.tone === 'incident').length;
  const attentionCount = queue.filter((item) => item.tone === 'attention').length;
  const unknownCount = data.apps.filter((app) => app.status === 'unknown').length + [data.bazza, data.shazza].filter((host) => hostTone(host) === 'unknown').length;
  const postureTone: Tone = incidentCount > 0 ? 'incident' : attentionCount > 0 ? 'attention' : data.health ? 'nominal' : 'unknown';
  const healthyApps = data.apps.filter((app) => app.status === 'up').length;
  const activeAgents = data.agents.filter((agent) => ['working', 'idle'].includes((agent.status ?? '').toLowerCase())).length;
  const onlineNodes = data.network?.nodes.filter((node) => node.status === 'online').length ?? 0;
  const successfulDeploys = data.deploys.filter((deploy) => deploy.status === 'success').length;
  const stale = updatedAt ? now - updatedAt.getTime() > 90_000 : false;
  const postureTitle = postureTone === 'incident' ? 'Incident active' : postureTone === 'attention' ? 'Needs attention' : postureTone === 'nominal' ? 'Estate stable' : 'Awaiting telemetry';
  const postureCopy = postureTone === 'incident'
    ? `${incidentCount} confirmed high-priority condition${incidentCount === 1 ? '' : 's'} require operator review.`
    : postureTone === 'attention'
      ? `${attentionCount} condition${attentionCount === 1 ? '' : 's'} should be reviewed; no confirmed incident is currently ranked.`
      : postureTone === 'nominal'
        ? 'Loaded checks and operational thresholds show no action required.'
        : 'Operational posture will appear when the health endpoint responds.';

  const selectedKey = selected?.key;

  return (
    <AppShell>
      <div className={styles.dashboard} data-posture={postureTone}>
        <header className={styles.briefHeader}>
          <div><p className={styles.eyebrow}>Live operations</p><h1>Mission Control</h1><p>What needs attention, what changed, and where to act.</p></div>
          <div className={styles.freshness} data-stale={stale}>
            <span>{loading ? 'Loading live telemetry…' : stale ? 'Telemetry is stale' : updatedAt ? `Updated ${relativeTime(updatedAt.toISOString())}` : 'No telemetry loaded'}</span>
            <button type="button" onClick={() => load(true)} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </header>

        {errors.length ? <div className={styles.errorBanner} role="status"><strong>Partial data</strong><span>{errors.length} endpoint{errors.length === 1 ? '' : 's'} failed; the brief retains the last successful values.</span><details><summary>Details</summary><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></details></div> : null}

        <section className={styles.statusBar} aria-labelledby="posture-title" data-tone={postureTone}>
          <div className={styles.statusSummary}>
            <ToneBadge tone={postureTone} />
            <div><h2 id="posture-title">{postureTitle}</h2><p>{postureCopy}</p></div>
          </div>
          <div className={styles.statusLinks}><Link href="/incidents">Incidents</Link><Link href="/activity">All activity</Link></div>
        </section>

        <dl className={styles.kpiStrip}>
          <Link href="/incidents"><dt>Needs action</dt><dd>{queue.length}</dd><span>{incidentCount} incident · {attentionCount} attention</span></Link>
          <Link href="/apps"><dt>Applications</dt><dd>{healthyApps}/{data.apps.length || '—'}</dd><span>{unknownCount ? `${unknownCount} unknown` : 'healthy checks'}</span></Link>
          <Link href="/network"><dt>Servers</dt><dd>{onlineNodes}/{data.network?.nodes.length || '—'}</dd><span>{data.network?.stale ? 'telemetry stale' : 'reachable now'}</span></Link>
          <Link href="/office"><dt>Agents</dt><dd>{activeAgents}/{data.agents.length || '—'}</dd><span>working or idle</span></Link>
          <Link href="/deploys"><dt>Deployments</dt><dd>{successfulDeploys}/{data.deploys.length || '—'}</dd><span>recently successful</span></Link>
          <Link href="/security"><dt>Alerts</dt><dd>{firingAlerts}</dd><span>currently firing</span></Link>
        </dl>

        <div className={styles.commandGrid}>
          <Queue items={queue} selectedKey={selected?.key} onSelect={setSelected} />
          <section className={`${styles.panel} ${styles.healthPanel}`} aria-labelledby="server-health-title">
            <SectionHeading eyebrow="Infrastructure" title="Server health" copy="Live reachability across the tailnet." action={<Link href="/network">Network →</Link>} />
            <div className={styles.healthList}>
              {(data.network?.nodes ?? []).map((node) => (
                <Link href={`/network?node=${encodeURIComponent(node.id)}`} key={node.id} className={styles.healthRow} data-tone={node.status === 'online' ? 'nominal' : node.status === 'degraded' ? 'attention' : 'incident'}>
                  <span className={styles.healthDot} /><span><strong>{node.label}</strong><small>{node.role}</small></span><span className={styles.healthValue}>{node.latencyMs == null ? 'Offline' : `${node.latencyMs.toFixed(1)} ms`}</span>
                </Link>
              ))}
              {!data.network?.nodes.length ? <div className={styles.emptyCompact}>Network telemetry unavailable</div> : null}
            </div>
          </section>
        </div>

        {selected ? <Inspector item={selected} onClose={() => setSelected(null)} /> : null}

        <div className={styles.operationsGrid}>
          <Changes items={changes} />
          <section className={`${styles.panel} ${styles.healthPanel}`} aria-labelledby="app-health-title">
            <SectionHeading eyebrow="Services" title="Application health" copy="Current public checks and response times." action={<Link href="/apps">Applications →</Link>} />
            <div className={styles.healthList}>
              {data.apps.slice(0, 8).map((app) => (
                <Link href="/apps" key={app.id} className={styles.healthRow} data-tone={appTone(app.status)}>
                  <span className={styles.healthDot} /><span><strong>{app.name}</strong><small>{app.kind ?? 'application'}</small></span><span className={styles.healthValue}>{app.latencyMs == null ? app.status : `${app.latencyMs} ms`}</span>
                </Link>
              ))}
              {!data.apps.length ? <div className={styles.emptyCompact}>Application telemetry unavailable</div> : null}
            </div>
          </section>
          <section className={`${styles.panel} ${styles.pulsePanel}`} aria-labelledby="agent-pulse-title">
            <SectionHeading eyebrow="Automation" title="Agent pulse" copy="Current OpenClaw worker state." action={<Link href="/office">Office →</Link>} />
            <div className={styles.pulseList}>
              {data.agents.slice(0, 7).map((agent) => <Link href={`/agents/${encodeURIComponent(agent.id)}`} key={agent.id}><span>{agent.emoji || '◇'}</span><span><strong>{agent.label || agent.id}</strong><small>{agent.busy ? 'Working now' : agent.status || 'Unknown'}</small></span><ToneBadge tone={agentTone(agent)} label={agent.busy ? 'Working' : agent.status || 'Unknown'} /></Link>)}
              {!data.agents.length ? <div className={styles.emptyCompact}>Agent status unavailable</div> : null}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
