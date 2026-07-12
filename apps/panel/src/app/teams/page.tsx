'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/ops-ui';
import { buildTeamDirectory, type CanonicalAgentIdentity, type CanonicalAvailability, type RawAgentStatus, type TeamDirectoryProjection } from '../office/roster';
import styles from './teams.module.css';

function relativeTime(value?: string | null) {
  if (!value) return 'No valid signal';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AvailabilityBadge({ availability }: { availability: CanonicalAvailability }) {
  return <span className={styles.badge} data-availability={availability.toLowerCase()}><span aria-hidden="true" />{availability}</span>;
}

function PersonLink({ identity, children }: { identity: CanonicalAgentIdentity; children: React.ReactNode }) {
  return <Link href={`/agents/${encodeURIComponent(identity.canonicalId)}`}>{children}</Link>;
}

export default function TeamsPage() {
  const [directory, setDirectory] = useState<TeamDirectoryProjection>(() => buildTeamDirectory([], null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setDirectory(buildTeamDirectory((data.agents ?? []) as RawAgentStatus[], data.ts));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load collector snapshot.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const working = directory.active.filter((identity) => identity.availability === 'Working').length;
  const available = directory.active.filter((identity) => identity.availability === 'Available').length;
  const freshnessLabel = loading ? 'Loading collector…' : error ? 'Collector request failed' : directory.health.state === 'fresh' ? `Fresh · ${relativeTime(directory.health.snapshotAt)}` : `${directory.health.state} · ${directory.health.detail}`;

  return <AppShell>
    <div className={styles.directory}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Canonical people and roles</p><h1>Team Directory</h1><p>Stable role ownership with current availability overlaid from the shared roster model.</p></div>
        <div className={styles.freshness} data-state={error ? 'error' : directory.health.state}><span>{freshnessLabel}</span><button type="button" onClick={load}>Refresh</button></div>
      </header>

      {error ? <div className={styles.error} role="status"><strong>Collector unavailable.</strong> The configured role directory remains visible; availability reflects the last successful snapshot, if any.</div> : null}

      <section className={styles.summary} aria-label="Team availability summary">
        <div><span>Active roles</span><strong>{directory.active.filter((identity) => directory.roles.some((role) => role.canonicalId === identity.canonicalId)).length}</strong><small>{working} working · {available} available</small></div>
        <div><span>Configured roles</span><strong>{directory.roles.length}</strong><small>Always visible</small></div>
        <div><span>Needs assignment</span><strong>{directory.unassignedActive.length}</strong><small>Active canonical identities</small></div>
      </section>

      <section className={styles.panel} aria-labelledby="active-now-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Availability</p><h2 id="active-now-title">Active now</h2><p>Working first, then available; only fresh canonical signals within 20 minutes.</p></div><Link href="/office">Open Digital Office →</Link></div>
        {loading ? <p className={styles.empty}>Loading current availability…</p> : directory.active.length ? <ul className={styles.activeList}>{directory.active.map((identity) => <li key={identity.canonicalId}><PersonLink identity={identity}><span className={styles.avatar}>{identity.emoji}</span><span><strong>{identity.label}</strong><small>{identity.currentTask || `Last signal ${relativeTime(identity.lastSeen)}`}</small></span><AvailabilityBadge availability={identity.availability} /></PersonLink></li>)}</ul> : <p className={styles.empty}>{directory.health.state === 'fresh' ? 'No canonical identity is active in the current 20-minute window.' : 'Availability is unconfirmed until a fresh collector snapshot arrives.'}</p>}
      </section>

      <section className={styles.panel} aria-labelledby="role-directory-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Ownership</p><h2 id="role-directory-title">Role directory</h2><p>Configured roles stay visible through inactive, stale, empty, and error states.</p></div></div>
        <div className={styles.roleGrid}>{directory.roles.map((entry) => {
          const identity = entry.identity;
          const content = <><div className={styles.roleTop}><span className={styles.avatar}>{identity?.emoji || entry.emoji}</span><AvailabilityBadge availability={entry.availability} /></div><h3>{entry.role}</h3><strong>{entry.name}</strong><p>{identity?.currentTask || identity?.inactiveReason || (entry.availability === 'Unconfirmed' ? 'Availability is unconfirmed.' : 'No current task reported.')}</p><small>{identity?.lastSeen ? `Last seen ${relativeTime(identity.lastSeen)}` : `Canonical ID: ${entry.canonicalId}`}</small></>;
          return identity ? <PersonLink key={entry.canonicalId} identity={identity}><article>{content}</article></PersonLink> : <article key={entry.canonicalId}>{content}</article>;
        })}</div>
      </section>

      <details className={styles.details}>
        <summary>Needs role assignment <span>{directory.unassignedActive.length}</span></summary>
        {directory.unassignedActive.length ? <ul>{directory.unassignedActive.map((identity) => <li key={identity.canonicalId}><PersonLink identity={identity}><strong>{identity.label}</strong><span>{identity.canonicalId}</span><AvailabilityBadge availability={identity.availability} /></PersonLink></li>)}</ul> : <p>No active unassigned canonical identities.</p>}
      </details>

      <details className={styles.details}>
        <summary>History / aliases <span>{directory.aliasHistory.length}</span></summary>
        {directory.aliasHistory.length ? <ul>{directory.aliasHistory.map((item) => <li key={`${item.canonicalId}:${item.sourceId}`}><div><strong>{item.sourceId} → {item.canonicalId}</strong><span>{item.reason}</span></div><small>Kept: {item.keptSourceId}</small></li>)}</ul> : <p>No suppressed aliases in the current snapshot.</p>}
      </details>
    </div>
  </AppShell>;
}
