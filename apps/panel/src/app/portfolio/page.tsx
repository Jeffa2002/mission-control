'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/ops-ui';
import styles from './portfolio.module.css';

type Tone = 'nominal' | 'attention' | 'incident' | 'unknown';
type Risk = 'critical' | 'high' | 'medium' | 'standard';
type Visibility = 'public' | 'private' | 'local-only';
type Filter = 'all' | 'attention' | 'incident' | 'unknown' | 'monitored';
type SortMode = 'status' | 'risk' | 'uptime' | 'name' | 'deploy';

type PortfolioProduct = {
  id: string;
  name: string;
  aliases: string[];
  repo: string | null;
  visibility: Visibility;
  language: string;
  defaultBranch: string;
  risk: Risk;
  riskReason: string | null;
  tone: Tone;
  toneReasons: string[];
  signalsDisagree: boolean;
  coverage: {
    endpoint: boolean;
    uptime: boolean;
    deploys: boolean;
    missing: string[];
    partial: string[];
  };
  endpoints: Array<{
    appId: string;
    name: string;
    url: string;
    status: 'up' | 'degraded' | 'down' | 'unknown';
    latencyMs: number | null;
    tls: { valid: boolean; daysRemaining: number } | null;
    checkedAt: string | null;
  }>;
  uptime: {
    target: string;
    uptime24h: number | null;
    p95Ms: number | null;
    probesOk: number;
    probesTotal: number;
    latestHttpCode: string | null;
    consecutiveFailures: number;
    asOf: string | null;
  } | null;
  deploy: {
    status: 'success' | 'failure' | 'running';
    app: string;
    branch: string;
    commit: string;
    commitMsg: string;
    triggeredBy: string;
    startedAt: string;
    durationS: number | null;
    count24h: number;
    failed24h: number;
  } | null;
};
type DeployStatus = NonNullable<PortfolioProduct['deploy']>['status'];

type PortfolioPayload = {
  generatedAt: string;
  sources: Record<string, { ok: boolean; error?: string }> & { warnings?: string[] };
  summary: {
    total: number;
    nominal: number;
    attention: number;
    incident: number;
    unknown: number;
    monitored: number;
    deploys24h: number;
    deploysFailed24h: number;
    tlsExpiring14d: number;
  };
  products: PortfolioProduct[];
};

const TONE_ORDER: Record<Tone, number> = { incident: 3, attention: 2, nominal: 1, unknown: 0 };
const RISK_ORDER: Record<Risk, number> = { critical: 3, high: 2, medium: 1, standard: 0 };

function rel(iso?: string | null, clock = Date.now()) {
  if (!iso) return 'unknown';
  const ms = clock - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtMs(value: number | null) {
  return value == null ? 'latency unknown' : `${Math.round(value)}ms`;
}

function fmtUptime(value: number | null) {
  return value == null ? 'uptime unknown' : `uptime ${value.toFixed(1)}%`;
}

function deployGlyph(status: DeployStatus) {
  if (status === 'failure') return '✗';
  if (status === 'running') return '↻';
  return '✓';
}

function deployLabel(status: DeployStatus) {
  if (status === 'failure') return 'failed';
  if (status === 'running') return 'deploying';
  return 'deployed';
}

function sourceUnavailable(product: PortfolioProduct, source: string) {
  return product.coverage.partial.includes(source);
}

function endpointLine(product: PortfolioProduct) {
  if (!product.endpoints.length) {
    return sourceUnavailable(product, 'endpoint') ? '-- source unavailable' : '-- no endpoint mapped';
  }
  const priority = { down: 3, degraded: 2, unknown: 1, up: 0 };
  const worst = [...product.endpoints].sort((a, b) => priority[b.status] - priority[a.status])[0];
  const tls = worst.tls ? (worst.tls.valid ? `TLS ${worst.tls.daysRemaining}d` : 'TLS invalid') : 'TLS unknown';
  const endpointText = product.endpoints.length > 1
    ? `${product.endpoints.length} endpoints, worst: ${worst.name} ${worst.status}`
    : `${worst.status} · ${fmtMs(worst.latencyMs)}`;
  const uptime = product.uptime
    ? `${fmtUptime(product.uptime.uptime24h)} · p95 ${fmtMs(product.uptime.p95Ms)}`
    : sourceUnavailable(product, 'uptime')
      ? 'uptime source unavailable'
      : 'no probe target';
  return `${endpointText} · ${tls} · ${uptime}`;
}

function deployLine(product: PortfolioProduct) {
  if (!product.deploy) {
    return sourceUnavailable(product, 'deploys') ? 'source unavailable' : 'no deploys (30d)';
  }
  return `${deployLabel(product.deploy.status)} ${rel(product.deploy.startedAt)} · ${product.deploy.branch || 'branch unknown'} · ${product.deploy.triggeredBy}`;
}

function filterLabel(filter: Filter) {
  if (filter === 'attention') return 'needs attention';
  if (filter === 'incident') return 'incidents';
  if (filter === 'unknown') return 'no telemetry';
  if (filter === 'monitored') return 'monitored products';
  return 'all products';
}

function ToneBadge({ tone, label }: { tone: Tone; label?: string }) {
  return <span className={styles.badge} data-tone={tone}>{label ?? (tone === 'unknown' ? 'No telemetry' : tone)}</span>;
}

function RiskPill({ risk, muted = false }: { risk: Risk; muted?: boolean }) {
  return <span className={styles.riskPill} data-risk={risk} data-muted={muted}>{risk} risk</span>;
}

function ProductCard({ product, selected, onSelect }: { product: PortfolioProduct; selected: boolean; onSelect: (event: React.MouseEvent<HTMLElement>) => void }) {
  const coverage = [
    ['endpoint', product.coverage.endpoint],
    ['uptime', product.coverage.uptime],
    ['deploys', product.coverage.deploys],
  ] as const;
  return (
    <button type="button" className={styles.card} data-selected={selected} onClick={onSelect} aria-label={`Inspect ${product.name}`}>
      <span className={styles.cardTop}>
        <ToneBadge tone={product.tone} />
        <h3>{product.name}</h3>
        <RiskPill risk={product.risk} muted={product.tone === 'incident'} />
      </span>
      <span className={styles.signalLine} data-empty={!product.endpoints.length && !product.uptime}>{endpointLine(product)}</span>
      <span className={styles.deployLine} data-status={product.deploy?.status ?? 'none'} data-empty={!product.deploy}>
        {product.deploy ? <b>{deployGlyph(product.deploy.status)}</b> : <b>--</b>} {deployLine(product)}
      </span>
      <span className={styles.coverageLine}>
        <span>signals:</span>
        {coverage.map(([key, present]) => <span key={key} data-present={present}>{present ? '✓' : '✗'} {key}</span>)}
        {product.coverage.partial.length ? <span className={styles.flag}>partial</span> : null}
        {product.signalsDisagree ? <span className={styles.flag}>signals disagree</span> : null}
        {product.tone === 'unknown' ? <span className={styles.flag} data-tone="unknown">no live telemetry</span> : null}
      </span>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className={styles.skeletonCard} key={index}>
          <span /><span /><span />
        </div>
      ))}
    </div>
  );
}

function FactList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function MissingBlock({ title, reason }: { title: string; reason: string }) {
  return <section className={styles.signalGroup} data-missing="true"><h3>{title}</h3><p>{reason}</p></section>;
}

function Inspector({ product, open, onClose, returnFocus }: {
  product: PortfolioProduct | null;
  open: boolean;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !window.matchMedia('(max-width:1040px)').matches) return;
    closeRef.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panelRef.current) return;
      const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select:not([disabled])'));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, [open, product]);

  const close = () => {
    onClose();
    setTimeout(() => returnFocus.current?.focus(), 0);
  };

  if (!product) {
    return (
      <aside className={styles.inspector} data-open="false" aria-label="Portfolio inspector">
        <div className={styles.inspectorHead}>
          <div><p className={styles.eyebrow}>Context</p><h2>Select a product</h2></div>
        </div>
        <p className={styles.verdictNote}>Choose a product card to inspect endpoint, uptime, deployment, and coverage evidence.</p>
      </aside>
    );
  }

  return (
    <aside ref={panelRef} className={styles.inspector} data-open={open} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label={`${product.name} portfolio inspector`}>
      <div className={styles.inspectorHead}>
        <div>
          <p className={styles.eyebrow}>Product</p>
          <h2>{product.name}</h2>
          {product.aliases.length ? <p className={styles.aliases}>also: {product.aliases.join(', ')}</p> : null}
        </div>
        <button ref={closeRef} type="button" onClick={close} aria-label="Close portfolio inspector">×</button>
      </div>

      <div className={styles.pillRow}>
        <span className={styles.riskPill}>{product.visibility}</span>
        <span className={styles.riskPill}>{product.language}</span>
        <RiskPill risk={product.risk} muted={product.tone === 'incident'} />
      </div>
      <p className={styles.repoLine}>
        {product.repo ? <Link href={`https://github.com/${product.repo}`}>{product.repo}</Link> : <small>No repository registered</small>}
        <small> · {product.defaultBranch}</small>
      </p>

      <section className={styles.signalGroup}>
        <h3>Verdict</h3>
        <ToneBadge tone={product.tone} />
        <ul className={styles.reasons}>{product.toneReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {product.signalsDisagree ? <p className={styles.verdictNote}>Signals disagree; pessimistic reading shown.</p> : null}
      </section>

      <section className={styles.signalGroup}>
        <h3>Risk Tier</h3>
        <RiskPill risk={product.risk} />
        <p className={styles.verdictNote}>
          {product.riskReason ?? 'Static registry risk tier. It does not mean the product is currently in incident.'}
        </p>
      </section>

      <section className={styles.signalGroup} data-missing={!product.endpoints.length}>
        <h3>Endpoint</h3>
        {product.endpoints.length ? product.endpoints.map((endpoint) => (
          <div className={styles.targetRow} key={endpoint.appId}>
            <header><strong>{endpoint.name}</strong><ToneBadge tone={endpoint.status === 'down' ? 'incident' : endpoint.status === 'degraded' ? 'attention' : endpoint.status === 'up' ? 'nominal' : 'unknown'} label={endpoint.status} /></header>
            <FactList rows={[
              ['Latency', fmtMs(endpoint.latencyMs)],
              ['TLS', endpoint.tls ? (endpoint.tls.valid ? `${endpoint.tls.daysRemaining} days remaining` : 'invalid') : 'not reported'],
              ['Checked', endpoint.checkedAt ? rel(endpoint.checkedAt) : 'not reported'],
            ]} />
            <small>{endpoint.url}</small>
          </div>
        )) : <p>{sourceUnavailable(product, 'endpoint') ? 'Endpoint source unavailable' : 'No endpoint mapped'}</p>}
      </section>

      {product.uptime ? (
        <section className={styles.signalGroup}>
          <h3>Uptime</h3>
          <div className={styles.targetRow}>
            <header><strong>{product.uptime.target}</strong><small>{product.uptime.asOf ? rel(product.uptime.asOf) : 'as-of unknown'}</small></header>
            <FactList rows={[
              ['24h uptime', product.uptime.uptime24h == null ? 'not reported' : `${product.uptime.uptime24h.toFixed(1)}%`],
              ['p95', fmtMs(product.uptime.p95Ms)],
              ['Probes', `${product.uptime.probesOk}/${product.uptime.probesTotal}`],
              ['Latest HTTP', product.uptime.latestHttpCode ?? 'not reported'],
              ['Failures', String(product.uptime.consecutiveFailures)],
            ]} />
          </div>
        </section>
      ) : <MissingBlock title="Uptime" reason={sourceUnavailable(product, 'uptime') ? 'Fleet uptime source unavailable' : product.visibility === 'local-only' ? 'No probe target registered for local-only product' : 'No probe target registered'} />}

      {product.deploy ? (
        <section className={styles.signalGroup}>
          <h3>Deploys</h3>
          <div className={styles.targetRow}>
            <header><strong>{deployLabel(product.deploy.status)}</strong><ToneBadge tone={product.deploy.status === 'failure' ? 'attention' : 'nominal'} label={product.deploy.status} /></header>
            <FactList rows={[
              ['App', product.deploy.app],
              ['Branch', product.deploy.branch || 'unknown'],
              ['Commit', product.deploy.commit || 'unknown'],
              ['Triggered by', product.deploy.triggeredBy],
              ['Started', rel(product.deploy.startedAt)],
              ['Duration', product.deploy.durationS == null ? 'not reported' : `${product.deploy.durationS}s`],
              ['24h count', `${product.deploy.count24h} total, ${product.deploy.failed24h} failed`],
            ]} />
          </div>
          <Link className={styles.inspectorLink} href="/deploys">All deploys</Link>
        </section>
      ) : <MissingBlock title="Deploys" reason={sourceUnavailable(product, 'deploys') ? 'Deploy source unavailable' : 'No deploys in the last 30 days'} />}

      <section className={styles.signalGroup}>
        <h3>Coverage</h3>
        <ul className={styles.checklist}>
          {(['endpoint', 'uptime', 'deploys'] as const).map((key) => (
            <li key={key}><span data-ok={product.coverage[key]}>{product.coverage[key] ? '✓' : '✗'}</span>{key}<small>{product.coverage.partial.includes(key) ? 'source unavailable' : product.coverage.missing.includes(key) ? 'not registered' : 'present'}</small></li>
          ))}
        </ul>
      </section>

      <nav className={styles.actions} aria-label="Portfolio actions">
        {product.endpoints[0] ? <Link href={product.endpoints[0].url}>Open app</Link> : null}
        <Link href="/apps">App Health</Link>
        <Link href="/fleet-health">Fleet Health</Link>
        <Link href="/deploys">Deploys</Link>
      </nav>
    </aside>
  );
}

export default function PortfolioPage() {
  const [payload, setPayload] = useState<PortfolioPayload | null>(null);
  const [lastGood, setLastGood] = useState<PortfolioPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [risk, setRisk] = useState<Risk | 'all'>('all');
  const [visibility, setVisibility] = useState<Visibility | 'all'>('all');
  const [sort, setSort] = useState<SortMode>('status');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const returnFocus = useRef<HTMLElement | null>(null);
  const lastGoodRef = useRef<PortfolioPayload | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    try {
      const response = await fetch('/api/portfolio', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      const next = await response.json() as PortfolioPayload;
      setPayload(next);
      lastGoodRef.current = next;
      setLastGood(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPayload((current) => current ?? lastGoodRef.current);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
        setTimeout(() => returnFocus.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const partialSources = Object.entries(payload?.sources ?? {})
    .filter(([key, source]) => key !== 'warnings' && source && typeof source === 'object' && 'ok' in source && source.ok === false)
    .map(([key]) => key);
  const warnings = payload?.sources.warnings ?? [];
  const products = payload?.products ?? [];
  const selected = products.find((product) => product.id === selectedId) ?? null;

  const visible = useMemo(() => products
    .filter((product) => filter === 'all' || (filter === 'monitored' ? product.tone !== 'unknown' : product.tone === filter))
    .filter((product) => risk === 'all' || product.risk === risk)
    .filter((product) => visibility === 'all' || product.visibility === visibility)
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'risk') return RISK_ORDER[b.risk] - RISK_ORDER[a.risk] || TONE_ORDER[b.tone] - TONE_ORDER[a.tone] || a.name.localeCompare(b.name);
      if (sort === 'uptime') {
        const au = a.uptime?.uptime24h ?? Infinity;
        const bu = b.uptime?.uptime24h ?? Infinity;
        return au - bu || a.name.localeCompare(b.name);
      }
      if (sort === 'deploy') {
        const ad = a.deploy ? Date.parse(a.deploy.startedAt) : 0;
        const bd = b.deploy ? Date.parse(b.deploy.startedAt) : 0;
        return bd - ad || a.name.localeCompare(b.name);
      }
      return TONE_ORDER[b.tone] - TONE_ORDER[a.tone] || RISK_ORDER[b.risk] - RISK_ORDER[a.risk] || a.name.localeCompare(b.name);
    }), [products, filter, risk, visibility, sort]);

  const selectProduct = (product: PortfolioProduct, event: React.MouseEvent<HTMLElement>) => {
    returnFocus.current = event.currentTarget;
    setSelectedId(product.id);
    if (window.matchMedia('(max-width:1040px)').matches) setDrawerOpen(true);
  };
  const clearFilters = () => { setFilter('all'); setRisk('all'); setVisibility('all'); setSort('status'); };
  const summary = payload?.summary;
  const showingRetained = Boolean(error && payload);

  return (
    <AppShell>
      <div className={`${styles.portfolio} ${showingRetained ? styles.dimmed : ''}`}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Product Rollup</p><h1>Portfolio</h1><p>Live status, 24h uptime, and deploy activity across the product estate.</p></div>
          <div className={styles.freshness}><span>{loading ? 'Loading product telemetry...' : payload ? `Updated ${rel(payload.generatedAt, now)}` : 'No telemetry loaded'}</span><button type="button" onClick={() => load(true)} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh'}</button></div>
        </header>

        {error ? (
          <section className={styles.errorPanel} role="status">
            <h2>Portfolio unavailable</h2>
            <p>{error}</p>
            {lastGood ? <span className={styles.retainedNote}>Retained last good data from {new Date(lastGood.generatedAt).toLocaleTimeString()}</span> : null}
            <button type="button" onClick={() => load(true)} disabled={refreshing}>Retry</button>
          </section>
        ) : null}

        {partialSources.length ? <div className={styles.banner} role="status"><strong>Partial data</strong><span>{partialSources.join(', ')} unavailable; tones may understate issues.</span></div> : null}
        {warnings.length ? <div className={styles.banner} role="status"><strong>Mapping warnings</strong><span>{warnings.slice(0, 3).join('; ')}{warnings.length > 3 ? `; +${warnings.length - 3} more` : ''}</span></div> : null}

        <section className={styles.posture} aria-live="polite" aria-label="Portfolio posture">
          {([
            ['nominal', 'Nominal', summary?.nominal],
            ['attention', 'Needs attention', summary?.attention],
            ['incident', 'Incident', summary?.incident],
            ['unknown', 'No telemetry', summary?.unknown],
            ['monitored', 'Monitored', summary ? `${summary.monitored}/${summary.total}` : undefined],
          ] as const).map(([kind, label, value]) => (
            <button type="button" key={kind} data-kind={kind} aria-pressed={filter === kind || (kind === 'monitored' && filter === 'monitored')} onClick={() => setFilter(kind === 'monitored' ? 'monitored' : kind as Filter)}>
              <strong>{loading ? '-' : value ?? '-'}</strong><span>{label}</span>
            </button>
          ))}
        </section>

        <section className={styles.toolbar} aria-label="Portfolio filters">
          <div className={styles.segmented}>
            {([
              ['all', 'All'],
              ['attention', 'Needs attention'],
              ['incident', 'Incidents'],
              ['unknown', 'No telemetry'],
            ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
          <select value={risk} onChange={(event) => setRisk(event.target.value as Risk | 'all')} aria-label="Filter risk">
            <option value="all">All risk</option><option value="critical">critical</option><option value="high">high</option><option value="medium">medium</option><option value="standard">standard</option>
          </select>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility | 'all')} aria-label="Filter visibility">
            <option value="all">All visibility</option><option value="public">public</option><option value="private">private</option><option value="local-only">local-only</option>
          </select>
          <select className={styles.sortSelect} value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Sort products">
            <option value="status">Status</option><option value="risk">Risk</option><option value="uptime">Uptime 24h</option><option value="name">Name</option><option value="deploy">Last deploy</option>
          </select>
        </section>

        {loading ? <SkeletonGrid /> : (
          <div className={styles.workspace}>
            <main className={styles.grid}>
              {visible.length ? visible.map((product) => <ProductCard key={product.id} product={product} selected={selectedId === product.id} onSelect={(event) => selectProduct(product, event)} />) : (
                <section className={styles.emptyFilter}>
                  <strong>No products match</strong>
                  <p>Filter: {filterLabel(filter)} · risk {risk} · visibility {visibility}</p>
                  <button type="button" onClick={clearFilters}>Clear filters</button>
                </section>
              )}
            </main>
            {drawerOpen ? <button className={styles.backdrop} type="button" onClick={() => setDrawerOpen(false)} aria-label="Close portfolio inspector" /> : null}
            <Inspector product={selected} open={drawerOpen} onClose={() => setDrawerOpen(false)} returnFocus={returnFocus} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
