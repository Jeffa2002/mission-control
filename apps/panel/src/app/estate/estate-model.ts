export type EstateStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export type EstateSmoke = {
  name: string;
  url: string;
  status: EstateStatus;
  httpStatus: number | null;
  latencyMs: number;
  warning?: string;
};

export type EstateRepo = {
  name: string;
  fullName: string;
  owner: string;
  productionBranch: string;
  status: EstateStatus;
  github?: {
    latestRun?: {
      name: string;
      branch: string;
      status: EstateStatus;
      conclusion?: string;
      startedAt?: string;
      title: string;
      url?: string;
    } | null;
    dependabot: {
      status: EstateStatus;
      open: number;
      counts: Record<string, number>;
      worstSeverity?: string | null;
    };
    warning?: string;
  };
  smokes: EstateSmoke[];
};

export type EstateData = {
  ok: boolean;
  summary: {
    status: EstateStatus;
    repos: number;
    critical: number;
    warning: number;
    dependabotOpen: number;
    smokeCritical: number;
    checkedAt: string;
  };
  repos: EstateRepo[];
  runners: { status: EstateStatus; note: string; controls: string[] };
  residuals: string[];
};

export type CoverageClass = {
  id: 'configured-smokes' | 'github-signals' | 'runtime-routing' | 'package-graph' | 'provider-graph';
  label: string;
  status: 'current' | 'partial' | 'missing' | 'unsupported';
  detail: string;
};

export type RepoNode = {
  kind: 'repo';
  id: string;
  fullName: string;
  name: string;
  owner: string;
  productionBranch: string;
  status: EstateStatus;
  githubWarning?: string;
  smokeIds: string[];
  sourceRecords: number;
};

export type SmokeNode = {
  kind: 'smoke';
  id: string;
  normalizedUrl: string;
  name: string;
  status: EstateStatus;
  httpStatus: number | null;
  latencyMs: number;
  warning?: string;
  repoIds: string[];
};

export type AssociationEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: 'confirmed';
  evidence: 'configured-smoke';
  label: 'Configured smoke association';
};

export type TopologyModel = {
  checkedAt: string;
  repos: RepoNode[];
  smokes: SmokeNode[];
  edges: AssociationEdge[];
  coverage: CoverageClass[];
  warnings: string[];
};

function statusRank(status: EstateStatus) {
  return { critical: 4, warning: 3, unknown: 2, healthy: 1 }[status];
}

function worstStatus(statuses: EstateStatus[]) {
  return statuses.sort((left, right) => statusRank(right) - statusRank(left))[0] ?? 'unknown';
}

export function canonicalRepoId(fullName: string) {
  return `repo:${fullName.trim().toLowerCase()}`;
}

export function normalizeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function canonicalSmokeId(url: string) {
  return `smoke:${encodeURIComponent(normalizeEvidenceUrl(url))}`;
}

export function buildEstateTopology(data: EstateData): TopologyModel {
  const repoGroups = new Map<string, EstateRepo[]>();
  data.repos.forEach((repo) => {
    const key = repo.fullName.trim().toLowerCase();
    repoGroups.set(key, [...(repoGroups.get(key) ?? []), repo]);
  });

  const smokeMap = new Map<string, SmokeNode>();
  const edges = new Map<string, AssociationEdge>();
  const repos: RepoNode[] = [];

  [...repoGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([, records]) => {
    const primary = records[0];
    const repoId = canonicalRepoId(primary.fullName);
    const smokeIds = new Set<string>();
    records.forEach((record) => record.smokes.forEach((smoke) => {
      const normalizedUrl = normalizeEvidenceUrl(smoke.url);
      const smokeId = canonicalSmokeId(normalizedUrl);
      smokeIds.add(smokeId);
      const existing = smokeMap.get(smokeId);
      const incomingIsWorse = existing ? statusRank(smoke.status) > statusRank(existing.status) : false;
      smokeMap.set(smokeId, existing ? {
        ...existing,
        status: worstStatus([existing.status, smoke.status]),
        name: incomingIsWorse ? smoke.name : existing.name,
        httpStatus: incomingIsWorse ? smoke.httpStatus : existing.httpStatus,
        latencyMs: incomingIsWorse ? smoke.latencyMs : existing.latencyMs,
        warning: existing.warning || smoke.warning,
        repoIds: [...new Set([...existing.repoIds, repoId])].sort(),
      } : {
        kind: 'smoke',
        id: smokeId,
        normalizedUrl,
        name: smoke.name,
        status: smoke.status,
        httpStatus: smoke.httpStatus,
        latencyMs: smoke.latencyMs,
        warning: smoke.warning,
        repoIds: [repoId],
      });
      const edgeId = `association:${repoId}->${smokeId}`;
      edges.set(edgeId, { id: edgeId, sourceId: repoId, targetId: smokeId, relationship: 'confirmed', evidence: 'configured-smoke', label: 'Configured smoke association' });
    }));
    repos.push({
      kind: 'repo',
      id: repoId,
      fullName: primary.fullName,
      name: primary.name,
      owner: primary.owner,
      productionBranch: primary.productionBranch,
      status: worstStatus(records.map((record) => record.status)),
      githubWarning: records.map((record) => record.github?.warning).find(Boolean),
      smokeIds: [...smokeIds].sort(),
      sourceRecords: records.length,
    });
  });

  const smokes = [...smokeMap.values()].sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl));
  const githubWarnings = data.repos.flatMap((repo) => repo.github?.warning ? [`${repo.fullName}: ${repo.github.warning}`] : []);
  const smokeWarnings = data.repos.flatMap((repo) => repo.smokes.flatMap((smoke) => smoke.warning ? [`${repo.fullName} · ${normalizeEvidenceUrl(smoke.url)}: ${smoke.warning}`] : []));
  const configuredStatus = smokes.length === 0 ? 'missing' : smokeWarnings.length > 0 ? 'partial' : 'current';
  const githubStatus = data.repos.every((repo) => repo.github) ? githubWarnings.length ? 'partial' : 'current' : 'missing';

  return {
    checkedAt: data.summary.checkedAt,
    repos,
    smokes,
    edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
    warnings: [...githubWarnings, ...smokeWarnings],
    coverage: [
      { id: 'configured-smokes', label: 'Configured smoke associations', status: configuredStatus, detail: smokes.length ? `${smokes.length} configured endpoint record${smokes.length === 1 ? '' : 's'} observed in this response snapshot.` : 'No configured smoke records were present. This is missing coverage, not zero dependency reach.' },
      { id: 'github-signals', label: 'GitHub workflow and advisory signals', status: githubStatus, detail: githubStatus === 'current' ? 'Repository-level GitHub signals loaded at response level.' : githubStatus === 'partial' ? 'At least one repository returned a GitHub warning; missing values are not healthy zeroes.' : 'GitHub repository signals were not available.' },
      { id: 'runtime-routing', label: 'Runtime service and host graph', status: 'unsupported', detail: 'Not captured: no service inventory, trace spans, host binding, or request-path evidence.' },
      { id: 'package-graph', label: 'Package dependency graph', status: 'unsupported', detail: 'Not captured: aggregate Dependabot counts do not identify package consumers or dependency edges.' },
      { id: 'provider-graph', label: 'External provider graph', status: 'unsupported', detail: 'Not captured: no provider inventory with explicit consumer relationships exists.' },
    ],
  };
}

export function associationReach(model: TopologyModel, nodeId: string) {
  const confirmedIds = new Set<string>();
  const repo = model.repos.find((item) => item.id === nodeId);
  const smoke = model.smokes.find((item) => item.id === nodeId);
  if (repo) repo.smokeIds.forEach((id) => confirmedIds.add(id));
  if (smoke) smoke.repoIds.forEach((id) => confirmedIds.add(id));
  return {
    confirmedIds: [...confirmedIds].sort(),
    inferredIds: [] as string[],
    stoppedAt: model.coverage.filter((item) => item.status === 'unsupported' || item.status === 'missing').map((item) => item.id),
  };
}
