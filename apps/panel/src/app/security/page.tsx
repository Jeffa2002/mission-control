'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/ops-ui';
import styles from './security.module.css';

type Tone = 'nominal' | 'attention' | 'incident' | 'unknown' | 'info';
type Confidence = 'confirmed' | 'inferred' | 'unobserved';
type EvidenceTab = 'parsed' | 'raw' | 'context';

type Rollup = { key: string; label?: string; count: number; sampled?: boolean };
type HostCoverage = { id: string; label: string; reporting: boolean; checkedAt: string; sources: Record<string, boolean>; error?: string };
type RegisteredHost = { id: string; label: string; reporting: boolean; securityChannel: string };

type SecurityData = {
  ok: boolean;
  checkedAt: string;
  source?: string;
  hasThreats: boolean;
  stale?: boolean;
  hosts?: HostCoverage[];
  registeredHosts?: RegisteredHost[];
  fail2ban: { available: boolean; banned: number; totalFailed: number; bannedIPs: string[] };
  nginx: { errorCount: number; errorLogCount?: number; recentErrors: string[]; recentErrorLogs?: string[]; byHost?: Rollup[]; topSources?: Rollup[]; topPaths?: Rollup[]; topStatuses?: Rollup[] };
  auth: { failCount: number; sshAcceptCount?: number; sudoCount?: number; recent: string[]; recentAccepts?: string[]; recentSudo?: string[]; byHost?: Rollup[]; topUsers?: Rollup[] };
  firewall?: { blockCount: number; sampleCount?: number; sampleLimitPerHost?: number; byHost?: Array<Rollup & { label: string }>; topSources?: Rollup[]; topPorts?: Rollup[]; recent: string[] };
  kernel?: { issueCount: number; criticalCount?: number; byHost?: Rollup[]; recent: string[] };
  system?: { issueCount: number; criticalCount?: number; byHost?: Rollup[]; recent: string[] };
  timeline?: { recent: string[] };
};

type SecurityAlert = { time: string; type: string; detail: string; severity: 'low' | 'medium' | 'high' };
type AuthEvent = { ts: string; type: 'sudo' | 'ssh-accept' | 'auth-fail' | 'su'; user: string; detail: string; host: string };
type FirewallEvent = { ts: string; src: string; dst: string; dpt: string; proto: string; host: string };
type WebEvent = { ts: string; ip: string; method: string; path: string; status: number; bytes: number; host: string };
type SshAttack = { ts: string; ip: string; user: string; host: string };

type TargetedEvidence = {
  alerts: SecurityAlert[];
  auth: AuthEvent[];
  firewall: FirewallEvent[];
  web: WebEvent[];
  ssh: SshAttack[];
};

type EvidenceItem = {
  id: string;
  title: string;
  category: string;
  tone: Tone;
  state: string;
  confidence: Confidence;
  confidenceCopy: string;
  summary: string;
  priority: number;
  time?: string;
  parsed: Array<[string, string]>;
  raw: string[];
  context: Array<[string, string]>;
  action: string;
  href: string;
};

type KillStage = {
  id: string;
  label: string;
  status: Confidence;
  state: string;
  copy: string;
  item: EvidenceItem;
};

const EMPTY_SECURITY: SecurityData = {
  ok: false,
  checkedAt: '',
  hasThreats: false,
  stale: true,
  hosts: [],
  registeredHosts: [],
  fail2ban: { available: false, banned: 0, totalFailed: 0, bannedIPs: [] },
  nginx: { errorCount: 0, errorLogCount: 0, recentErrors: [], recentErrorLogs: [] },
  auth: { failCount: 0, sshAcceptCount: 0, sudoCount: 0, recent: [], recentAccepts: [], recentSudo: [] },
  firewall: { blockCount: 0, sampleCount: 0, recent: [] },
  kernel: { issueCount: 0, criticalCount: 0, recent: [] },
  system: { issueCount: 0, criticalCount: 0, recent: [] },
  timeline: { recent: [] },
};

const EMPTY_EVIDENCE: TargetedEvidence = { alerts: [], auth: [], firewall: [], web: [], ssh: [] };

function relativeTime(value?: string) {
  if (!value) return 'Time unavailable';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Time unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function toneLabel(tone: Tone) {
  if (tone === 'nominal') return 'Nominal';
  if (tone === 'attention') return 'Attention';
  if (tone === 'incident') return 'Incident';
  if (tone === 'info') return 'Observe';
  return 'Unknown';
}

function redact(value: string) {
  return value
    .replace(/(password|passwd|token|secret|authorization|cookie)=?\s*[^\s]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .slice(0, 1000);
}

function ToneBadge({ tone, label }: { tone: Tone; label?: string }) {
  return <span className={styles.toneBadge} data-tone={tone}><span aria-hidden="true" />{label ?? toneLabel(tone)}</span>;
}

function ConfidenceBadge({ value }: { value: Confidence }) {
  return <span className={styles.confidence} data-confidence={value}>{value === 'confirmed' ? 'Observed' : value === 'inferred' ? 'Inferred' : 'Unobserved'}</span>;
}

function SectionHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: React.ReactNode }) {
  return <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{eyebrow}</p><h2>{title}</h2>{copy ? <p>{copy}</p> : null}</div>{action}</div>;
}

function buildThreats(data: SecurityData, evidence: TargetedEvidence): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const criticalHostIssues = (data.kernel?.criticalCount ?? 0) + (data.system?.criticalCount ?? 0);
  const missingHosts = (data.registeredHosts ?? []).filter((host) => !host.reporting);

  if (data.source === 'empty-fallback' || data.stale) {
    items.push({
      id: 'coverage:stale', title: 'Security telemetry is stale or unavailable', category: 'Coverage', tone: 'attention', state: 'Verify coverage', confidence: 'confirmed',
      confidenceCopy: 'The collector reports stale or fallback data. Zero counts cannot be treated as a nominal security state.', summary: `Collector source: ${data.source || 'unknown'}.`, priority: 98, time: data.checkedAt,
      parsed: [['Collector source', data.source || 'Not reported'], ['Stale', data.stale ? 'Yes' : 'No'], ['Reporting hosts', `${(data.hosts ?? []).filter((host) => host.reporting).length}/${data.registeredHosts?.length ?? data.hosts?.length ?? 0}`]],
      raw: [], context: [['Security channel', 'Aggregate collector'], ['Data quality', 'Do not infer healthy zeroes'], ['Required response', 'Restore or verify collection']], action: 'Verify host channels and collector freshness before triage.', href: '/systems',
    });
  }

  missingHosts.forEach((host) => items.push({
    id: `coverage:${host.id}`, title: `${host.label} is not reporting security telemetry`, category: 'Coverage', tone: 'attention', state: 'Coverage gap', confidence: 'confirmed',
    confidenceCopy: 'The registered host coverage record explicitly reports this channel unavailable. This is a monitoring gap, not evidence of attack.', summary: `Expected channel: ${host.securityChannel || 'not described'}.`, priority: 94,
    parsed: [['Host', host.label], ['Reporting', 'No'], ['Security channel', host.securityChannel || 'Not reported']], raw: [],
    context: [['Claim', 'Coverage unavailable'], ['Attack evidence', 'None from this gap'], ['Certainty', 'Confirmed channel state']], action: 'Restore the registered security channel, then reassess posture.', href: '/estate',
  }));

  if (criticalHostIssues > 0) items.push({
    id: 'host:critical', title: `${criticalHostIssues} critical host signal${criticalHostIssues === 1 ? '' : 's'}`, category: 'Host integrity', tone: 'incident', state: 'Investigate now', confidence: 'confirmed',
    confidenceCopy: 'Kernel or system collectors labelled these records critical. Attribution and progression remain unconfirmed.', summary: 'Critical kernel or system evidence needs host-level review.', priority: 100, time: data.checkedAt,
    parsed: [['Kernel critical', String(data.kernel?.criticalCount ?? 0)], ['System critical', String(data.system?.criticalCount ?? 0)], ['Collector window', 'Current bounded sample']],
    raw: [...(data.kernel?.recent ?? []), ...(data.system?.recent ?? [])].slice(0, 20).map(redact), context: [['Source', 'Host kernel/system collectors'], ['Impact', 'Potential host integrity issue'], ['Attribution', 'Unconfirmed']], action: 'Preserve the bounded evidence and inspect the affected host.', href: '/systems',
  });

  evidence.alerts.forEach((alert, index) => {
    const tone: Tone = alert.severity === 'high' ? 'incident' : alert.severity === 'medium' ? 'attention' : 'info';
    items.push({
      id: `alert:${index}:${alert.time}`, title: `${alert.type} security alert`, category: 'Alert', tone, state: alert.severity === 'high' ? 'Escalate' : 'Review', confidence: 'confirmed',
      confidenceCopy: 'This is a parsed record from the security-alert log. Its relationship to other events is not assumed.', summary: alert.detail, priority: alert.severity === 'high' ? 96 : alert.severity === 'medium' ? 78 : 48, time: alert.time,
      parsed: [['Type', alert.type], ['Severity', alert.severity], ['Time', alert.time]], raw: [redact(alert.detail)], context: [['Source', 'security-alert.log'], ['Window', 'Last 24 hours'], ['Correlation', 'Not automatically joined']], action: 'Compare the alert with host, authentication, and firewall evidence.', href: '/incidents',
    });
  });

  if (data.auth.failCount > 0) items.push({
    id: 'auth:failures', title: `${data.auth.failCount} authentication failure${data.auth.failCount === 1 ? '' : 's'}`, category: 'Access', tone: data.auth.failCount >= 20 ? 'attention' : 'info', state: 'Review source pattern', confidence: 'confirmed',
    confidenceCopy: 'Failed authentication events are observed. They do not confirm successful access.', summary: `${data.auth.topUsers?.length ?? 0} user rollups and ${data.auth.byHost?.length ?? 0} host rollups are available.`, priority: data.auth.failCount >= 20 ? 82 : 58, time: evidence.ssh[0]?.ts,
    parsed: [['Failures', String(data.auth.failCount)], ['Accepted SSH', String(data.auth.sshAcceptCount ?? 0)], ['Top user', data.auth.topUsers?.[0]?.key || 'Not reported']],
    raw: evidence.ssh.slice(0, 20).map((event) => redact(`${event.ts} ${event.host} failed SSH for ${event.user} from ${event.ip}`)), context: [['Hosts', (data.auth.byHost ?? []).map((row) => `${row.label || row.key}: ${row.count}`).join(', ') || 'Not reported'], ['Fail2ban available', data.fail2ban.available ? 'Yes' : 'No'], ['Successful compromise', 'Not established']], action: 'Correlate sources against accepted login and privilege events before escalating.', href: '/security',
  });

  if (data.fail2ban.banned > 0) items.push({
    id: 'control:fail2ban', title: `Fail2ban is containing ${data.fail2ban.banned} source${data.fail2ban.banned === 1 ? '' : 's'}`, category: 'Containment', tone: 'attention', state: 'Control active', confidence: 'confirmed',
    confidenceCopy: 'Ban state is confirmed by the control. It is containment evidence, not attacker attribution.', summary: `${data.fail2ban.totalFailed} failures reported by Fail2ban.`, priority: 76, time: data.checkedAt,
    parsed: [['Active bans', String(data.fail2ban.banned)], ['Total failed', String(data.fail2ban.totalFailed)], ['Control available', data.fail2ban.available ? 'Yes' : 'No']], raw: data.fail2ban.bannedIPs.slice(0, 20).map((ip) => `Banned source ${ip}`), context: [['Control', 'Fail2ban'], ['Attribution', 'Not asserted'], ['Containment', 'Active ban list']], action: 'Review whether the source pattern changes; avoid extending blocks without corroboration.', href: '/security',
  });

  if ((data.firewall?.blockCount ?? 0) > 0) items.push({
    id: 'edge:firewall', title: `${data.firewall?.blockCount} firewall block${data.firewall?.blockCount === 1 ? '' : 's'}`, category: 'Edge', tone: (data.firewall?.blockCount ?? 0) >= 100 ? 'attention' : 'info', state: 'Control holding', confidence: 'confirmed',
    confidenceCopy: 'Firewall deny events are observed. Repeated blocks do not prove a successful intrusion attempt.', summary: `${data.firewall?.sampleCount ?? 0} bounded records are available for inspection.`, priority: (data.firewall?.blockCount ?? 0) >= 100 ? 72 : 46, time: evidence.firewall[0]?.ts,
    parsed: [['Blocks', String(data.firewall?.blockCount ?? 0)], ['Sample records', String(data.firewall?.sampleCount ?? 0)], ['Top port', data.firewall?.topPorts?.[0]?.key || 'Not reported']],
    raw: evidence.firewall.slice(0, 20).map((event) => redact(`${event.ts} ${event.host} ${event.proto} ${event.src} -> ${event.dst}:${event.dpt}`)), context: [['Source', 'UFW/kernel log'], ['Sample limit per host', String(data.firewall?.sampleLimitPerHost ?? 'Not reported')], ['Relationship', 'Edge control only']], action: 'Review concentration by source and port; correlate before changing policy.', href: '/network',
  });

  const webErrors = data.nginx.errorCount + (data.nginx.errorLogCount ?? 0);
  if (webErrors > 0) items.push({
    id: 'web:errors', title: `${webErrors} web error signal${webErrors === 1 ? '' : 's'}`, category: 'Web edge', tone: webErrors >= 50 ? 'attention' : 'info', state: 'Inspect pattern', confidence: 'confirmed',
    confidenceCopy: 'HTTP error and nginx error-log records are observed. They may be routine client or application failures.', summary: `Top path: ${data.nginx.topPaths?.[0]?.key || 'not reported'}.`, priority: webErrors >= 50 ? 70 : 44, time: evidence.web.find((event) => event.status >= 400)?.ts,
    parsed: [['Access errors', String(data.nginx.errorCount)], ['Error-log signals', String(data.nginx.errorLogCount ?? 0)], ['Top status', data.nginx.topStatuses?.[0]?.key || 'Not reported']],
    raw: evidence.web.filter((event) => event.status >= 400).slice(0, 20).map((event) => redact(`${event.ts} ${event.host} ${event.status} ${event.method} ${event.path} from ${event.ip}`)), context: [['Source', 'Nginx access/error logs'], ['Attribution', 'Not established'], ['Data quality', 'Bounded sample']], action: 'Check whether source, path, and authentication signals overlap.', href: '/apps',
  });

  if ((data.auth.sshAcceptCount ?? 0) > 0 || (data.auth.sudoCount ?? 0) > 0) items.push({
    id: 'access:review', title: 'Accepted access or privilege activity recorded', category: 'Host access', tone: 'info', state: 'Verify expected activity', confidence: 'confirmed',
    confidenceCopy: 'Accepted SSH and sudo events are observed, but the collector cannot classify operator intent.', summary: `${data.auth.sshAcceptCount ?? 0} accepted SSH and ${data.auth.sudoCount ?? 0} sudo events in the collector window.`, priority: 52, time: evidence.auth[0]?.ts,
    parsed: [['Accepted SSH', String(data.auth.sshAcceptCount ?? 0)], ['Sudo events', String(data.auth.sudoCount ?? 0)], ['Classification', 'Intent unknown']],
    raw: evidence.auth.filter((event) => event.type === 'ssh-accept' || event.type === 'sudo').slice(0, 20).map((event) => redact(`${event.ts} ${event.host} ${event.type} ${event.user} ${event.detail}`)), context: [['Source', 'Auth journal/log'], ['Expected activity', 'Requires operator context'], ['Compromise claim', 'Not made']], action: 'Verify the activity against expected operator or automation work.', href: '/actions',
  });

  return items.sort((left, right) => right.priority - left.priority).slice(0, 8);
}

function fallbackItem(data: SecurityData): EvidenceItem {
  return {
    id: 'posture:clear', title: 'No ranked review signal', category: 'Posture', tone: data.source === 'empty-fallback' ? 'unknown' : 'nominal', state: data.source === 'empty-fallback' ? 'Telemetry unavailable' : 'No action queued', confidence: data.source === 'empty-fallback' ? 'unobserved' : 'confirmed',
    confidenceCopy: data.source === 'empty-fallback' ? 'The collector has no usable data.' : 'Loaded collectors produced no item meeting the review queue rules.', summary: data.source === 'empty-fallback' ? 'Restore collection before assessing posture.' : 'This does not assert that unmonitored activity is safe.', priority: 0, time: data.checkedAt,
    parsed: [['Collector source', data.source || 'Unknown'], ['Has threats', String(data.hasThreats)], ['Stale', String(Boolean(data.stale))]], raw: [], context: [['Scope', 'Current bounded collector window'], ['Unknowns', 'Remain unknown'], ['Action', 'Continue routine observation']], action: 'No immediate containment action is recommended.', href: '/security',
  };
}

function buildKillChain(data: SecurityData, evidence: TargetedEvidence): KillStage[] {
  const make = (id: string, label: string, status: Confidence, state: string, copy: string, item: EvidenceItem): KillStage => ({ id, label, status, state, copy, item });
  const edgeObserved = (data.firewall?.blockCount ?? 0) > 0 || data.nginx.errorCount > 0;
  const authObserved = data.auth.failCount > 0;
  const acceptedObserved = (data.auth.sshAcceptCount ?? 0) > 0;
  const privilegeObserved = (data.auth.sudoCount ?? 0) > 0;
  const hostObserved = (data.kernel?.issueCount ?? 0) > 0 || (data.system?.issueCount ?? 0) > 0;

  const item = (id: string, title: string, confidence: Confidence, summary: string, raw: string[], parsed: Array<[string, string]>, context: Array<[string, string]>): EvidenceItem => ({
    id, title, category: 'Attack progression', tone: confidence === 'unobserved' ? 'unknown' : confidence === 'inferred' ? 'attention' : 'info', state: confidence === 'confirmed' ? 'Evidence observed' : confidence === 'inferred' ? 'Relationship inferred' : 'No supporting feed', confidence,
    confidenceCopy: confidence === 'confirmed' ? 'The stage has direct collector evidence, not proof of malicious progression.' : confidence === 'inferred' ? 'Multiple event classes exist, but no identity-safe join confirms they belong to one path.' : 'The current collector cannot assess this stage.', summary, priority: 0,
    parsed, raw: raw.slice(0, 20).map(redact), context, action: confidence === 'inferred' ? 'Correlate timestamps, hosts, and sources before escalating.' : confidence === 'unobserved' ? 'Do not infer safety from missing telemetry.' : 'Inspect the bounded evidence in context.', href: '/security',
  });

  const edgeItem = item('chain:edge', 'Reconnaissance and edge pressure', edgeObserved ? 'confirmed' : 'unobserved', edgeObserved ? 'Firewall or web-edge records exist in the current collector window.' : 'No edge event is present in the bounded sample.', [...(data.firewall?.recent ?? []), ...data.nginx.recentErrors], [['Firewall blocks', String(data.firewall?.blockCount ?? 0)], ['Web errors', String(data.nginx.errorCount)]], [['Collectors', 'Firewall and nginx'], ['Claim', 'Observed events only']]);
  const authItem = item('chain:auth', 'Authentication attempts', authObserved ? 'confirmed' : 'unobserved', authObserved ? 'Authentication failures are directly observed.' : 'No authentication failure is present in the bounded sample.', data.auth.recent, [['Failures', String(data.auth.failCount)], ['Top user', data.auth.topUsers?.[0]?.key || 'Not reported']], [['Collector', 'Auth log/journal'], ['Successful access', 'Not implied']]);
  const accessConfidence: Confidence = acceptedObserved && authObserved ? 'inferred' : acceptedObserved ? 'confirmed' : 'unobserved';
  const accessItem = item('chain:access', 'Initial access', accessConfidence, acceptedObserved ? 'Accepted SSH exists; its relationship to failures is not confirmed.' : 'No accepted-access evidence is present.', data.auth.recentAccepts ?? [], [['Accepted SSH', String(data.auth.sshAcceptCount ?? 0)], ['Failures', String(data.auth.failCount)]], [['Identity join', 'Unavailable'], ['Correlation', accessConfidence === 'inferred' ? 'Possible, unconfirmed' : 'None']]);
  const privilegeConfidence: Confidence = privilegeObserved && acceptedObserved ? 'inferred' : privilegeObserved ? 'confirmed' : 'unobserved';
  const privilegeItem = item('chain:privilege', 'Privilege activity', privilegeConfidence, privilegeObserved ? 'Sudo activity is observed; malicious intent is not classified.' : 'No privilege event is present.', data.auth.recentSudo ?? [], [['Sudo events', String(data.auth.sudoCount ?? 0)], ['Accepted SSH', String(data.auth.sshAcceptCount ?? 0)]], [['Intent', 'Unknown'], ['Progression join', privilegeConfidence === 'inferred' ? 'Possible, unconfirmed' : 'None']]);
  const hostItem = item('chain:host', 'Execution and persistence', hostObserved ? 'confirmed' : 'unobserved', hostObserved ? 'Kernel or system events exist; they are not attributed to access activity.' : 'No dedicated execution or persistence signal is observed.', [...(data.kernel?.recent ?? []), ...(data.system?.recent ?? [])], [['Kernel issues', String(data.kernel?.issueCount ?? 0)], ['System issues', String(data.system?.issueCount ?? 0)]], [['Attribution', 'Not established'], ['Dedicated EDR', 'Not reported']]);
  const exfilItem = item('chain:exfil', 'Exfiltration', 'unobserved', 'Mission Control has no dedicated egress or exfiltration collector.', [], [['Detection feed', 'Not available'], ['Conclusion', 'Unobserved']], [['Claim', 'Not assessed'], ['Future input', 'Bounded egress telemetry']]);

  return [
    make('edge', 'Edge pressure', edgeObserved ? 'confirmed' : 'unobserved', edgeObserved ? 'Observed' : 'No signal', edgeItem.summary, edgeItem),
    make('auth', 'Credential attempt', authObserved ? 'confirmed' : 'unobserved', authObserved ? 'Observed' : 'No signal', authItem.summary, authItem),
    make('access', 'Initial access', accessConfidence, accessConfidence === 'inferred' ? 'Inferred only' : acceptedObserved ? 'Observed activity' : 'Unobserved', accessItem.summary, accessItem),
    make('privilege', 'Privilege', privilegeConfidence, privilegeConfidence === 'inferred' ? 'Inferred only' : privilegeObserved ? 'Observed activity' : 'Unobserved', privilegeItem.summary, privilegeItem),
    make('host', 'Execution / persistence', hostObserved ? 'confirmed' : 'unobserved', hostObserved ? 'Observed signal' : 'Unobserved', hostItem.summary, hostItem),
    make('exfil', 'Exfiltration', 'unobserved', 'Unobserved', exfilItem.summary, exfilItem),
  ];
}

async function fetchJson(path: string) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function EvidenceInspector({ item, tab, setTab, onClose, returnFocus, open }: { item: EvidenceItem; tab: EvidenceTab; setTab: (tab: EvidenceTab) => void; onClose: () => void; returnFocus: React.RefObject<HTMLElement | null>; open: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const isDrawer = window.matchMedia('(max-width: 980px)').matches;
    if (!isDrawer || !open) return;
    closeRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !inspectorRef.current) return;
      const controls = Array.from(inspectorRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', trapFocus);
    return () => window.removeEventListener('keydown', trapFocus);
  }, [item.id, open]);

  function close() {
    onClose();
    window.setTimeout(() => returnFocus.current?.focus(), 0);
  }

  const rows = tab === 'parsed' ? item.parsed : item.context;
  return <aside ref={inspectorRef} className={styles.inspector} data-open={open} aria-label="Security evidence inspector" aria-live="polite">
    <div className={styles.inspectorTop}><div><p className={styles.eyebrow}>{item.category}</p><h2>{item.title}</h2></div><button ref={closeRef} type="button" onClick={close} aria-label="Close evidence inspector">×</button></div>
    <div className={styles.inspectorState}><ToneBadge tone={item.tone} label={item.state} /><ConfidenceBadge value={item.confidence} />{item.time ? <time>{relativeTime(item.time)}</time> : null}</div>
    <p className={styles.inspectorSummary}>{item.summary}</p>
    <div className={styles.confidenceNote}><strong>{item.confidence === 'confirmed' ? 'Evidence status' : 'Confidence boundary'}</strong><p>{item.confidenceCopy}</p></div>
    <div className={styles.tabs} role="tablist" aria-label="Evidence views">
      {(['parsed', 'raw', 'context'] as EvidenceTab[]).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === 'context' ? 'Host Context' : value[0].toUpperCase() + value.slice(1)}</button>)}
    </div>
    <div className={styles.evidencePane} role="tabpanel">
      {tab === 'raw' ? (item.raw.length ? <pre>{item.raw.map((line, index) => <code key={`${line}:${index}`}>{line}</code>)}</pre> : <p className={styles.missingEvidence}>No bounded raw evidence is available for this item.</p>) : <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </div>
    <div className={styles.recommendation}><span>Recommended action</span><p>{item.action}</p></div>
    <Link className={styles.inspectorLink} href={item.href}>Open related surface →</Link>
  </aside>;
}

export default function SecurityPage() {
  const [data, setData] = useState<SecurityData>(EMPTY_SECURITY);
  const [evidence, setEvidence] = useState<TargetedEvidence>(EMPTY_EVIDENCE);
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const [tab, setTab] = useState<EvidenceTab>('parsed');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    const requests = [
      ['summary', '/api/security'], ['alerts', '/api/security/alerts'], ['auth', '/api/security/auth-log'],
      ['firewall', '/api/security/firewall'], ['web', '/api/security/nginx-logs'], ['ssh', '/api/security/ssh-attacks'],
    ] as const;
    const results = await Promise.allSettled(requests.map(([, path]) => fetchJson(path)));
    const failures: string[] = [];
    const nextEvidence: Partial<TargetedEvidence> = {};
    results.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === 'rejected') { failures.push(`${key}: ${result.reason instanceof Error ? result.reason.message : 'request failed'}`); return; }
      if (key === 'summary') setData(result.value);
      if (key === 'alerts') nextEvidence.alerts = result.value.alerts ?? [];
      if (key === 'auth') nextEvidence.auth = result.value.recent ?? [];
      if (key === 'firewall') nextEvidence.firewall = result.value.recent ?? [];
      if (key === 'web') nextEvidence.web = result.value.recent ?? [];
      if (key === 'ssh') nextEvidence.ssh = result.value.recent ?? [];
    });
    setEvidence((current) => ({ ...current, ...nextEvidence }));
    setErrors(failures);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); const timer = window.setInterval(() => load(true), 45_000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape' && selected) { setSelected(null); window.setTimeout(() => returnFocus.current?.focus(), 0); } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const threats = useMemo(() => buildThreats(data, evidence), [data, evidence]);
  const killChain = useMemo(() => buildKillChain(data, evidence), [data, evidence]);
  const coverageTotal = data.registeredHosts?.length || data.hosts?.length || 0;
  const reportingHosts = (data.hosts ?? []).filter((host) => host.reporting).length;
  const criticalCount = threats.filter((item) => item.tone === 'incident').length;
  const attentionCount = threats.filter((item) => item.tone === 'attention').length;
  const sourceUnavailable = data.source === 'empty-fallback' || !data.checkedAt;
  const posture: Tone = sourceUnavailable ? 'unknown' : criticalCount ? 'incident' : attentionCount || data.stale ? 'attention' : 'nominal';
  const postureTitle = posture === 'incident' ? 'Containment review required' : posture === 'attention' ? 'Security needs review' : posture === 'nominal' ? 'Controls are holding' : 'Security posture unknown';
  const postureCopy = posture === 'incident' ? `${criticalCount} evidence-backed high-priority signal${criticalCount === 1 ? '' : 's'} require operator review.` : posture === 'attention' ? `${attentionCount} review signal${attentionCount === 1 ? '' : 's'} or coverage condition needs attention.` : posture === 'nominal' ? 'Loaded collectors show no ranked incident or attention condition. Unobserved stages remain unknown.' : 'The active collector cannot support a security assessment.';
  const currentSelection = selected ?? threats[0] ?? fallbackItem(data);

  function inspect(item: EvidenceItem, event: React.MouseEvent<HTMLElement>) {
    returnFocus.current = event.currentTarget;
    setSelected(item);
    setTab('parsed');
  }

  async function runIntent(action: 'capture_diagnostics' | 'open_incident') {
    setActionBusy(true); setActionMessage('Recording audited intent…');
    try {
      const response = await fetch('/api/runbook-actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, source: 'security_threat_surface' }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Action failed');
      setActionMessage(result.next || 'Intent recorded.');
    } catch (error) { setActionMessage(error instanceof Error ? error.message : 'Action failed'); }
    finally { setActionBusy(false); }
  }

  return <AppShell>
    <a className={styles.skipLink} href="#security-workspace">Skip to security workspace</a>
    <div className={styles.security} data-posture={posture}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Adaptive Operations Prism</p><h1>Security Threat Surface</h1><p>Evidence first. Relationships only where the current collectors support them.</p></div>
        <div className={styles.freshness} data-stale={Boolean(data.stale)}><span>{loading ? 'Loading security telemetry…' : data.checkedAt ? `${data.stale ? 'Stale' : 'Collected'} ${relativeTime(data.checkedAt)} · ${data.source || 'unknown source'}` : 'No successful collection'}</span><button type="button" onClick={() => load(true)} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
      </header>

      {errors.length ? <div className={styles.errorBanner} role="status"><strong>Partial evidence</strong><span>{errors.length} targeted collector{errors.length === 1 ? '' : 's'} failed. Aggregate and last successful values remain visible.</span><details><summary>Details</summary><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></details></div> : null}

      <section className={styles.postureHero} aria-labelledby="security-posture-title">
        <div className={styles.postureMain}><ToneBadge tone={posture} /><p className={styles.eyebrow}>Overall security posture</p><h2 id="security-posture-title">{postureTitle}</h2><p>{postureCopy}</p><div className={styles.heroActions}><button type="button" disabled={actionBusy} onClick={() => runIntent('capture_diagnostics')}>Capture diagnostics</button><button type="button" disabled={actionBusy} onClick={() => runIntent('open_incident')}>Open incident intent</button><a href="/api/incident/bundle?minutes=30">Download evidence bundle</a></div>{actionMessage ? <p className={styles.actionMessage} role="status">{actionMessage}</p> : null}</div>
        <dl className={styles.postureFacts}><div><dt>Review queue</dt><dd>{threats.length}</dd><span>{criticalCount} incident · {attentionCount} attention</span></div><div><dt>Host coverage</dt><dd>{reportingHosts}/{coverageTotal || '—'}</dd><span>registered channels reporting</span></div><div><dt>Active bans</dt><dd>{data.fail2ban.banned}</dd><span>{data.fail2ban.available ? 'Fail2ban available' : 'control unavailable or unreported'}</span></div><div><dt>Firewall blocks</dt><dd>{data.firewall?.blockCount ?? 0}</dd><span>{data.firewall?.sampleCount ?? 0} sampled records</span></div></dl>
      </section>

      <div className={styles.workspace} id="security-workspace">
        <div className={styles.mainColumn}>
          <section className={`${styles.panel} ${styles.threatPanel}`} aria-labelledby="threat-title"><SectionHeading eyebrow="Triage" title="Active threats and review signals" copy="Ranked by impact, collector confidence, coverage risk, and operator actionability." action={<Link href="/incidents">Incident console →</Link>} />
            {threats.length ? <ol className={styles.threatList}>{threats.map((item, index) => <li key={item.id}><button type="button" data-selected={currentSelection.id === item.id} onClick={(event) => inspect(item, event)}><span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span><span className={styles.threatBody}><span><ToneBadge tone={item.tone} label={item.state} /><ConfidenceBadge value={item.confidence} />{item.time ? <time>{relativeTime(item.time)}</time> : null}</span><strong>{item.title}</strong><small>{item.summary}</small></span><span aria-hidden="true">→</span></button></li>)}</ol> : <div className={styles.emptyState}><ToneBadge tone={posture === 'nominal' ? 'nominal' : 'unknown'} label={posture === 'nominal' ? 'No ranked signal' : 'Assessment unavailable'} /><strong>{posture === 'nominal' ? 'No action item meets the queue rules' : 'Collector coverage is insufficient'}</strong><p>{posture === 'nominal' ? 'Unobserved activity remains unknown and is not presented as safe.' : 'Restore collection before interpreting zero counts.'}</p></div>}
          </section>

          <section className={`${styles.panel} ${styles.topology}`} aria-labelledby="topology-title"><SectionHeading eyebrow="Supported relationships" title="Host and exposure topology" copy="External signals flow to registered host channels and their actual reporting sources; no application dependency is inferred." action={<Link href="/estate">Estate →</Link>} />
            <div className={styles.topologyGrid}><div className={styles.topologyColumn}><h3>Observed edge</h3><button type="button" onClick={(event) => inspect(threats.find((item) => item.id === 'edge:firewall') ?? buildKillChain(data, evidence)[0].item, event)}><span>FW</span><strong>Firewall</strong><small>{data.firewall?.blockCount ?? 0} blocks</small></button><button type="button" onClick={(event) => inspect(threats.find((item) => item.id === 'web:errors') ?? buildKillChain(data, evidence)[0].item, event)}><span>WEB</span><strong>Nginx edge</strong><small>{data.nginx.errorCount + (data.nginx.errorLogCount ?? 0)} errors</small></button><button type="button" onClick={(event) => inspect(threats.find((item) => item.id === 'auth:failures') ?? buildKillChain(data, evidence)[1].item, event)}><span>SSH</span><strong>Authentication</strong><small>{data.auth.failCount} failures</small></button></div><div className={styles.topologyArrow} aria-hidden="true">→</div><div className={styles.topologyColumn}><h3>Registered hosts</h3>{(data.registeredHosts ?? []).length ? (data.registeredHosts ?? []).map((host) => <button type="button" key={host.id} data-reporting={host.reporting} onClick={(event) => inspect({ id: `host:${host.id}`, title: host.label, category: 'Host coverage', tone: host.reporting ? 'nominal' : 'attention', state: host.reporting ? 'Reporting' : 'Coverage gap', confidence: 'confirmed', confidenceCopy: 'This state comes from the registered security channel coverage.', summary: host.reporting ? 'The registered host security channel is reporting.' : 'The registered host security channel is not reporting.', priority: 0, parsed: [['Host', host.label], ['Reporting', host.reporting ? 'Yes' : 'No'], ['Channel', host.securityChannel]], raw: [], context: [['Supported relationship', 'Host to declared security channel'], ['Attack evidence', host.reporting ? 'Not implied' : 'Unavailable from this gap']], action: host.reporting ? 'Continue routine collection.' : 'Restore the registered channel before assessing this host.', href: '/estate' }, event)}><span>{host.label.split(/\s+/).map((part) => part[0]).join('').slice(0, 3)}</span><strong>{host.label}</strong><small>{host.reporting ? 'Reporting' : 'Not reporting'}</small></button>) : <p className={styles.noNodes}>No registered host coverage returned.</p>}</div><div className={styles.topologyArrow} aria-hidden="true">→</div><div className={styles.topologyColumn}><h3>Declared sources</h3>{(data.hosts ?? []).length ? (data.hosts ?? []).map((host) => <div className={styles.sourceGroup} key={host.id}><strong>{host.label}</strong><span>{Object.entries(host.sources).filter(([, available]) => available).map(([source]) => source).join(' · ') || 'No sources available'}</span></div>) : <p className={styles.noNodes}>No host source metadata returned.</p>}</div></div>
          </section>

          <section className={`${styles.panel} ${styles.killChain}`} aria-labelledby="killchain-title"><SectionHeading eyebrow="Evidence boundaries" title="Attack progression" copy="Observed events are not automatically treated as one attacker path. Inferred joins and unobserved stages stay explicit." />
            <ol>{killChain.map((stage, index) => <li key={stage.id}><button type="button" data-confidence={stage.status} onClick={(event) => inspect(stage.item, event)}><span className={styles.stageNumber}>{index + 1}</span><ConfidenceBadge value={stage.status} /><strong>{stage.label}</strong><small>{stage.state}</small><p>{stage.copy}</p></button></li>)}</ol>
          </section>

          <section className={`${styles.panel} ${styles.containment}`} aria-labelledby="containment-title"><SectionHeading eyebrow="Controls" title="Containment and next actions" copy="Current controls are evidence, not attribution. Changes remain deliberate and audited." />
            <div className={styles.containmentGrid}><article data-state={data.fail2ban.available ? 'active' : 'unknown'}><span>01</span><div><strong>Fail2ban</strong><p>{data.fail2ban.available ? `${data.fail2ban.banned} active bans; ${data.fail2ban.totalFailed} failures recorded.` : 'Control state is unavailable or not reported.'}</p></div></article><article data-state={(data.firewall?.blockCount ?? 0) > 0 ? 'active' : 'nominal'}><span>02</span><div><strong>Firewall policy</strong><p>{(data.firewall?.blockCount ?? 0) > 0 ? `${data.firewall?.blockCount} deny events show the control is active.` : 'No deny event appears in the current bounded sample.'}</p></div></article><article data-state={reportingHosts === coverageTotal && coverageTotal > 0 ? 'nominal' : 'unknown'}><span>03</span><div><strong>Collection coverage</strong><p>{reportingHosts}/{coverageTotal || '—'} registered host channels are reporting.</p></div></article></div>
            <div className={styles.nextAction}><div><p className={styles.eyebrow}>Recommended next action</p><strong>{currentSelection.action}</strong></div><button type="button" disabled={actionBusy} onClick={() => runIntent(criticalCount ? 'open_incident' : 'capture_diagnostics')}>{criticalCount ? 'Record incident intent' : 'Capture diagnostics intent'}</button></div>
          </section>
        </div>
        <EvidenceInspector item={currentSelection} tab={tab} setTab={setTab} onClose={() => setSelected(null)} returnFocus={returnFocus} open={selected !== null} />
      </div>
    </div>
  </AppShell>;
}
