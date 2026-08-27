/**
 * Pure tone-derivation model for the /api/portfolio endpoint.
 *
 * Implements the §2 tables of docs/portfolio-design.md: three signals
 * (endpoint, fleet uptime, last deploy), pessimism wins, sources that
 * disagree by ≥2 severity steps flag signalsDisagree, and products with zero
 * signals are unknown — never implied green. The UI never re-derives tone.
 */

export type PortfolioTone = 'nominal' | 'attention' | 'incident' | 'unknown';
type ContributedTone = 'nominal' | 'attention' | 'incident';

const SEVERITY: Record<ContributedTone, number> = {
  nominal: 0,
  attention: 1,
  incident: 2,
};

export type EndpointSignal = {
  appId: string;
  name?: string;
  status: 'up' | 'degraded' | 'down' | 'unknown';
  ssl?: { valid: boolean; daysRemaining: number } | null;
};

export type UptimeTargetSignal = {
  target: string;
  consecutive_failures?: number;
  uptime_24h?: number | null;
  p95_24h?: number | null;
  probes_24h?: number;
};

export type LatestDeploy = {
  status: 'success' | 'failure' | 'running';
  startedAt?: string;
};

export type PortfolioToneInput = {
  endpoints?: EndpointSignal[];
  uptimeTargets?: UptimeTargetSignal[];
  latestDeploy?: LatestDeploy | null;
};

export type PortfolioToneResult = {
  tone: PortfolioTone;
  toneReasons: string[];
  signalsDisagree: boolean;
  /** Per-source tone; null when the source contributes no signal (gap). */
  signals: {
    endpoint: ContributedTone | null;
    uptime: ContributedTone | null;
    deploy: ContributedTone | null;
  };
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function relativeFrom(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const milliseconds = now - new Date(iso).getTime();
  if (!Number.isFinite(milliseconds)) return '';
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Signal A — endpoint (effectx). `status: unknown` contributes nothing and is
 * recorded as a gap (it is not evidence of health).
 */
export function endpointTone(endpoint: EndpointSignal): {
  tone: ContributedTone | null;
  reasons: string[];
} {
  if (endpoint.status === 'unknown') return { tone: null, reasons: [] };
  const label = endpoint.name || endpoint.appId;
  let tone: ContributedTone = 'nominal';
  const reasons: string[] = [];

  if (endpoint.status === 'down') {
    tone = 'incident';
    reasons.push(`Endpoint ${label} is down`);
  } else if (endpoint.status === 'degraded') {
    tone = 'attention';
    reasons.push(`Endpoint ${label} is degraded`);
  }

  if (endpoint.ssl && endpoint.ssl.valid === false) {
    tone = 'incident';
    reasons.push(`Endpoint ${label} TLS certificate invalid`);
  } else if (endpoint.ssl && endpoint.ssl.valid && endpoint.ssl.daysRemaining < 14) {
    if (SEVERITY[tone] < SEVERITY.attention) tone = 'attention';
    reasons.push(`Endpoint ${label} TLS expires in ${endpoint.ssl.daysRemaining}d`);
  }

  return { tone, reasons };
}

/**
 * Signal B — fleet uptime, one probe target. Fresh failures (≥3 consecutive)
 * outrank the trailing 24h window; zero probes in the window is a gap, not
 * nominal.
 */
export function uptimeTargetTone(target: UptimeTargetSignal): {
  tone: ContributedTone | null;
  reasons: string[];
} {
  const failures = target.consecutive_failures ?? 0;
  if (failures >= 3) {
    return {
      tone: 'incident',
      reasons: [`${target.target} failing ${failures} consecutive probes`],
    };
  }
  const uptime = target.uptime_24h;
  const probes = target.probes_24h ?? 0;
  if (uptime == null || probes === 0) return { tone: null, reasons: [] };
  if (uptime < 95) {
    return { tone: 'incident', reasons: [`${target.target} 24h uptime ${round1(uptime)}%`] };
  }
  if (uptime < 99.5) {
    return { tone: 'attention', reasons: [`${target.target} 24h uptime ${round1(uptime)}%`] };
  }
  if ((target.p95_24h ?? 0) > 2000) {
    return {
      tone: 'attention',
      reasons: [`${target.target} p95 latency ${Math.round(target.p95_24h ?? 0)}ms`],
    };
  }
  return { tone: 'nominal', reasons: [] };
}

/**
 * Signal C — last deploy. A failed latest deploy is a risk condition
 * (attention), not an outage. Running/success contribute no tone but still
 * count as a live signal. No deploy in window → gap (null).
 */
export function deployTone(latest: LatestDeploy | null | undefined, now = Date.now()): {
  tone: ContributedTone | null;
  reasons: string[];
} {
  if (!latest) return { tone: null, reasons: [] };
  if (latest.status === 'failure') {
    const when = relativeFrom(latest.startedAt, now);
    return {
      tone: 'attention',
      reasons: [when ? `Latest deploy failed ${when}` : 'Latest deploy failed'],
    };
  }
  return { tone: 'nominal', reasons: [] };
}

function worstGroup<T>(signals: Array<{ tone: ContributedTone | null; reasons: string[] }>): {
  tone: ContributedTone | null;
  reasons: string[];
} {
  const present = signals.filter((signal) => signal.tone !== null);
  if (!present.length) return { tone: null, reasons: [] };
  const severity = Math.max(...present.map((signal) => SEVERITY[signal.tone as ContributedTone]));
  const reasons = present
    .filter((signal) => SEVERITY[signal.tone as ContributedTone] === severity)
    .flatMap((signal) => signal.reasons)
    .slice(0, 4);
  const tone = (Object.keys(SEVERITY) as ContributedTone[]).find(
    (key) => SEVERITY[key] === severity,
  ) as ContributedTone;
  return { tone, reasons };
}

/**
 * Derive the product tone from its present signals. Missing signals are
 * skipped, never treated as nominal; zero signals → unknown.
 */
export function derivePortfolioTone(input: PortfolioToneInput, now = Date.now()): PortfolioToneResult {
  const endpoint = worstGroup((input.endpoints ?? []).map(endpointTone));
  const uptime = worstGroup((input.uptimeTargets ?? []).map(uptimeTargetTone));
  const deploy = deployTone(input.latestDeploy ?? null, now);

  const present = [endpoint, uptime, deploy].filter((signal) => signal.tone !== null);
  if (!present.length) {
    return {
      tone: 'unknown',
      toneReasons: ['No live telemetry'],
      signalsDisagree: false,
      signals: { endpoint: null, uptime: null, deploy: null },
    };
  }

  const severities = present.map((signal) => SEVERITY[signal.tone as ContributedTone]);
  const max = Math.max(...severities);
  const min = Math.min(...severities);
  const tone = (Object.keys(SEVERITY) as ContributedTone[]).find(
    (key) => SEVERITY[key] === max,
  ) as ContributedTone;

  const toneReasons = present
    .filter((signal) => SEVERITY[signal.tone as ContributedTone] === max)
    .flatMap((signal) => signal.reasons)
    .slice(0, 6);

  return {
    tone,
    toneReasons: toneReasons.length ? toneReasons : [`${tone} (no detail reported)`],
    signalsDisagree: max - min >= 2,
    signals: {
      endpoint: endpoint.tone,
      uptime: uptime.tone,
      deploy: deploy.tone,
    },
  };
}

export type PortfolioSummaryProduct = {
  tone: PortfolioTone;
  endpoints: Array<{ tls?: { valid: boolean; daysRemaining: number } | null }>;
  deploy: { count24h: number; failed24h: number } | null;
};

export type PortfolioSummary = {
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

/** Aggregate the assembled product list into the summary block (§6). */
export function summarizePortfolio(products: PortfolioSummaryProduct[]): PortfolioSummary {
  const count = (tone: PortfolioTone) => products.filter((p) => p.tone === tone).length;
  return {
    total: products.length,
    nominal: count('nominal'),
    attention: count('attention'),
    incident: count('incident'),
    unknown: count('unknown'),
    monitored: products.filter((p) => p.tone !== 'unknown').length,
    deploys24h: products.reduce((sum, p) => sum + (p.deploy?.count24h ?? 0), 0),
    deploysFailed24h: products.reduce((sum, p) => sum + (p.deploy?.failed24h ?? 0), 0),
    tlsExpiring14d: products.reduce(
      (sum, p) =>
        sum +
        p.endpoints.filter((ep) => ep.tls && ep.tls.valid && ep.tls.daysRemaining < 14).length,
      0,
    ),
  };
}
