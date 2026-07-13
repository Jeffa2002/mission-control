'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, StatusBadge } from '../../components/ops-ui';
import {
  associationReach,
  buildEstateTopology,
  type EstateData,
  type EstateRepo,
  type EstateStatus,
  type RepoNode,
  type SmokeNode,
  type TopologyModel,
} from './estate-model';
import styles from './estate.module.css';

type ViewMode = 'topology' | 'cockpit';
type InspectorTab = 'evidence' | 'reach' | 'coverage';
type SelectedNode = RepoNode | SmokeNode;

function statusMeta(status: EstateStatus): { label: string; badge: 'healthy' | 'warning' | 'critical' | 'neutral' } {
  if (status === 'healthy') return { label: 'Healthy', badge: 'healthy' };
  if (status === 'warning') return { label: 'Watch', badge: 'warning' };
  if (status === 'critical') return { label: 'Critical', badge: 'critical' };
  return { label: 'Unknown', badge: 'neutral' };
}

function timeAgo(iso?: string) {
  if (!iso) return 'unknown';
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return 'unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function ToneBadge({ tone, label }: { tone: string; label: string }) {
  return <span className={styles.badge} data-tone={tone}><span aria-hidden="true" />{label}</span>;
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className={styles.sectionHeading}><p>{eyebrow}</p><h2>{title}</h2><span>{copy}</span></div>;
}

function TopologyCanvas({ model, selectedId, onSelect }: { model: TopologyModel; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <section className={styles.panel} aria-labelledby="topology-heading">
      <div className={styles.panelHeader}>
        <SectionHeading eyebrow="Bounded evidence map" title="Dependency topology" copy="Only repository → configured smoke associations are drawn. Layout proximity has no semantic meaning." />
        <div className={styles.legend} aria-label="Relationship legend">
          <ToneBadge tone="confirmed" label="Confirmed configuration" />
          <ToneBadge tone="unsupported" label="Not captured" />
        </div>
      </div>
      <div className={styles.topology} id="topology-heading">
        {model.repos.map((repo) => {
          const endpoints = repo.smokeIds.map((id) => model.smokes.find((smoke) => smoke.id === id)).filter(Boolean) as SmokeNode[];
          return (
            <article className={styles.topologyRow} key={repo.id}>
              <button className={styles.node} data-kind="repo" data-selected={selectedId === repo.id} data-status={repo.status} type="button" onClick={() => onSelect(repo.id)}>
                <span className={styles.nodeType}>Repository</span>
                <strong>{repo.name}</strong>
                <small>{repo.fullName}</small>
                <ToneBadge tone={repo.status} label={statusMeta(repo.status).label} />
              </button>
              <div className={styles.edge} aria-label={`${endpoints.length} confirmed configured smoke association${endpoints.length === 1 ? '' : 's'}`}>
                <span aria-hidden="true" />
                <b>{endpoints.length} configured</b>
              </div>
              <div className={styles.endpointStack}>
                {endpoints.length ? endpoints.map((smoke) => (
                  <button className={styles.node} data-kind="smoke" data-selected={selectedId === smoke.id} data-status={smoke.status} type="button" key={smoke.id} onClick={() => onSelect(smoke.id)}>
                    <span className={styles.nodeType}>Smoke endpoint</span>
                    <strong>{smoke.name}</strong>
                    <small>{smoke.normalizedUrl}</small>
                    <ToneBadge tone={smoke.warning ? 'partial' : smoke.status} label={smoke.warning ? 'Partial evidence' : statusMeta(smoke.status).label} />
                  </button>
                )) : <div className={styles.missingEndpoint}><ToneBadge tone="missing" label="Missing" /><span>No configured smoke association in this response.</span></div>}
              </div>
            </article>
          );
        })}
      </div>
      <div className={styles.unknownZone}>
        {model.coverage.filter((item) => item.status === 'unsupported').map((item) => <div key={item.id}><ToneBadge tone="unsupported" label="Not captured" /><strong>{item.label}</strong><span>{item.detail}</span></div>)}
      </div>
      <p className={styles.caption}><strong>Text equivalent:</strong> {model.edges.length} confirmed configuration association{model.edges.length === 1 ? '' : 's'} connect {model.repos.length} canonical repos to {model.smokes.length} canonical smoke endpoints. Runtime, package, provider, customer, and causal reach remain unknown.</p>
    </section>
  );
}

function Inspector({ model, selectedId, tab, onTab }: { model: TopologyModel; selectedId: string | null; tab: InspectorTab; onTab: (tab: InspectorTab) => void }) {
  const selected = [...model.repos, ...model.smokes].find((node) => node.id === selectedId) as SelectedNode | undefined;
  if (!selected) return <aside className={styles.inspector}><SectionHeading eyebrow="Evidence inspector" title="Select a node" copy="Choose a repository or endpoint to inspect source facts and bounded association reach." /></aside>;
  const reach = associationReach(model, selected.id);
  const facts = selected.kind === 'repo'
    ? [['Canonical ID', selected.id], ['Full name', selected.fullName], ['Owner', selected.owner], ['Production branch', selected.productionBranch], ['Source records merged', String(selected.sourceRecords)], ['GitHub warning', selected.githubWarning || 'None reported']]
    : [['Canonical ID', selected.id], ['Normalized URL', selected.normalizedUrl], ['HTTP result', selected.httpStatus === null ? 'Unavailable' : String(selected.httpStatus)], ['Latency', `${selected.latencyMs}ms`], ['Smoke warning', selected.warning || 'None reported'], ['Associated repos', String(selected.repoIds.length)]];
  return (
    <aside className={styles.inspector} aria-label="Topology evidence inspector">
      <p className={styles.eyebrow}>{selected.kind === 'repo' ? 'Repository evidence' : 'Configured endpoint evidence'}</p>
      <h2>{selected.kind === 'repo' ? selected.name : selected.normalizedUrl}</h2>
      <div className={styles.inspectorBadges}><ToneBadge tone="confirmed" label="Configured association" /><ToneBadge tone={selected.status} label={statusMeta(selected.status).label} /></div>
      <p className={styles.inspectorCopy}>Observed in the estate response snapshot checked {timeAgo(model.checkedAt)}. No per-edge observation time is available.</p>
      <div className={styles.tabs} role="tablist" aria-label="Inspector views">
        {(['evidence', 'reach', 'coverage'] as InspectorTab[]).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => onTab(value)}>{value}</button>)}
      </div>
      <div className={styles.tabPanel} role="tabpanel">
        {tab === 'evidence' && <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {tab === 'reach' && <div className={styles.reach}>
          <strong>{reach.confirmedIds.length} confirmed one-hop association{reach.confirmedIds.length === 1 ? '' : 's'}</strong>
          <p>This is bounded association reach, not affected services, runtime routing, deploy ownership, or customer impact.</p>
          <ul>{reach.confirmedIds.map((id) => <li key={id}>{model.repos.find((item) => item.id === id)?.name || model.smokes.find((item) => item.id === id)?.normalizedUrl || id}</li>)}</ul>
          <ToneBadge tone="unknown" label="Traversal stopped" />
          <p>Traversal stops at {reach.stoppedAt.length} unsupported source classes. Inferred relationship count: {reach.inferredIds.length}.</p>
        </div>}
        {tab === 'coverage' && <div className={styles.coverageList}>{model.coverage.map((item) => <article key={item.id}><ToneBadge tone={item.status} label={item.status} /><strong>{item.label}</strong><p>{item.detail}</p></article>)}</div>}
      </div>
    </aside>
  );
}

function Cockpit({ data }: { data: EstateData }) {
  const queues = data.repos.flatMap((repo) => {
    const items = [];
    if (repo.status === 'critical') items.push({ repo: repo.name, label: 'Critical estate signal', detail: 'One or more workflow, advisory, or configured smoke signals need review.' });
    if ((repo.github?.dependabot.open ?? 0) > 0) items.push({ repo: repo.name, label: 'Dependabot backlog', detail: `${repo.github?.dependabot.open} open alert${repo.github?.dependabot.open === 1 ? '' : 's'}.` });
    if (repo.github?.warning) items.push({ repo: repo.name, label: 'GitHub source warning', detail: repo.github.warning });
    repo.smokes.filter((smoke) => smoke.warning).forEach((smoke) => items.push({ repo: repo.name, label: 'Smoke source warning', detail: smoke.warning! }));
    return items;
  }).slice(0, 8);
  return <div className={styles.cockpit}>
    <section className={styles.panel}>
      <SectionHeading eyebrow="Existing operational view" title="Estate Cockpit" copy="Workflow, advisory, runner, and configured smoke signals remain available as a list view." />
      <div className={styles.cockpitGrid}>
        <article><strong>Runner posture</strong><StatusBadge label="Sandboxed root" status="warning" /><p>{data.runners.note}</p></article>
        <article><strong>Active controls</strong><div className={styles.controls}>{data.runners.controls.map((control) => <span key={control}>{control}</span>)}</div></article>
        <article><strong>Work queue</strong>{queues.length ? queues.map((item, index) => <div className={styles.queueItem} key={`${item.repo}-${item.label}-${index}`}><b>{item.repo} · {item.label}</b><span>{item.detail}</span></div>) : <p>No warning or critical signals in loaded sources. Missing sources are not represented as nominal.</p>}</article>
      </div>
    </section>
    <section className={`${styles.panel} ${styles.tablePanel}`} aria-labelledby="estate-table-title">
      <SectionHeading eyebrow="Canonical repository list" title="Repository evidence" copy="Rows are keyed by fullName; workflow links and all configured smokes are preserved." />
      <div className={styles.table} role="table" aria-label="Estate repository evidence">
        <div className={styles.tableHead} role="row"><span>App</span><span>Latest run</span><span>Advisories</span><span>Configured smokes</span><span>State</span></div>
        {data.repos.map((repo: EstateRepo) => {
          const latestRun = repo.github?.latestRun;
          return <div className={styles.tableRow} role="row" key={repo.fullName}>
            <div><strong>{repo.name}</strong><small>{repo.fullName}</small></div>
            <div>{latestRun?.url ? <a href={latestRun.url} target="_blank" rel="noreferrer">{latestRun.name}</a> : <span>{latestRun?.name ?? 'No run loaded'}</span>}<small>{latestRun?.title || repo.productionBranch}</small>{repo.github?.warning && <em>{repo.github.warning}</em>}</div>
            <div><strong>{repo.github?.dependabot.open ?? 'Unknown'} open</strong><small>{repo.github?.dependabot.worstSeverity ?? 'No severity reported'}</small></div>
            <div>{repo.smokes.length ? repo.smokes.map((smoke) => <span className={styles.smokeLine} key={smoke.url}><b>{smoke.httpStatus ?? 'Unavailable'}</b> {smoke.url}{smoke.warning && <em>{smoke.warning}</em>}</span>) : <span>Not configured</span>}</div>
            <div><ToneBadge tone={repo.status} label={statusMeta(repo.status).label} /></div>
          </div>;
        })}
      </div>
    </section>
    <section className={styles.panel}><SectionHeading eyebrow="Human context" title="Residuals" copy="Residual prose is retained as context and never converted into graph edges." /><div className={styles.residuals}>{data.residuals.map((item) => <p key={item}>{item}</p>)}</div></section>
  </div>;
}

export default function EstatePage() {
  const [data, setData] = useState<EstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('topology');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>('evidence');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/estate', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || `Estate API returned ${response.status}`);
      setData(json);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const model = useMemo(() => data ? buildEstateTopology(data) : null, [data]);
  useEffect(() => {
    if (model && (!selectedId || ![...model.repos, ...model.smokes].some((item) => item.id === selectedId))) setSelectedId(model.repos[0]?.id ?? model.smokes[0]?.id ?? null);
  }, [model, selectedId]);
  const reviewCount = model?.repos.filter((repo) => repo.status === 'critical' || repo.status === 'warning').length ?? 0;
  const unknownCount = model?.coverage.filter((item) => item.status === 'unsupported' || item.status === 'missing').length ?? 0;

  return <AppShell><div className={styles.estate}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Adaptive Operations Prism</p><h1>Estate Dependency Topology</h1><p>Configured monitoring associations with bounded reach and explicit evidence gaps.</p></div>
      <div className={styles.headerActions}><span>{data ? `Snapshot ${timeAgo(data.summary.checkedAt)}` : loading ? 'Loading snapshot…' : 'No snapshot loaded'}</span><button type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    </header>
    {error && <div className={styles.error} role="status"><strong>Estate refresh failed.</strong> {error}{data ? ' Showing the last successful response.' : ''}</div>}
    {model && data ? <>
      <section className={styles.posture}>
        <article><ToneBadge tone={data.summary.status} label={statusMeta(data.summary.status).label} /><h2>Evidence posture</h2><p>{model.warnings.length ? `${model.warnings.length} source warning${model.warnings.length === 1 ? '' : 's'} preserved. Missing evidence is not converted to healthy.` : 'Loaded source records contain no warning strings; unsupported graph classes remain explicit.'}</p></article>
        <article><strong>{model.repos.length}</strong><span>Canonical repos</span><small>deduplicated by fullName</small></article>
        <article><strong>{model.edges.length}</strong><span>Confirmed associations</span><small>configured smoke only</small></article>
        <article><strong>{reviewCount}</strong><span>Repos needing review</span><small>warning or critical</small></article>
        <article><strong>{unknownCount}</strong><span>Unknown source classes</span><small>missing or unsupported</small></article>
      </section>
      <div className={styles.toolbar} role="group" aria-label="Estate view">
        <button type="button" aria-pressed={mode === 'topology'} onClick={() => setMode('topology')}>Topology</button>
        <button type="button" aria-pressed={mode === 'cockpit'} onClick={() => setMode('cockpit')}>Cockpit list</button>
        <span>No coverage percentage: no honest full-graph denominator exists.</span>
      </div>
      {mode === 'topology' ? <div className={styles.workspace}><TopologyCanvas model={model} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setTab('evidence'); }} /><Inspector model={model} selectedId={selectedId} tab={tab} onTab={setTab} /></div> : <Cockpit data={data} />}
      <section className={styles.coverageStrip} aria-label="Estate source coverage">{model.coverage.map((item) => <article key={item.id}><ToneBadge tone={item.status} label={item.status} /><strong>{item.label}</strong><p>{item.detail}</p></article>)}</section>
    </> : loading ? <div className={styles.loading}>Loading estate evidence…</div> : <div className={styles.loading}>No estate response is available. Unknown state is not nominal.</div>}
  </div></AppShell>;
}
