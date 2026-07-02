import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';

type EstateStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

type EstateRepo = {
  name: string;
  fullName: string;
  productionBranch: string;
  smokeUrl?: string;
  owner: string;
};

const REPOS: EstateRepo[] = [
  { name: 'Mission Control', fullName: 'Jeffa2002/mission-control', productionBranch: 'master', smokeUrl: 'https://mission.effectx.com.au/', owner: 'Ops' },
  { name: 'CRM8', fullName: 'Jeffa2002/crm8', productionBranch: 'main', smokeUrl: 'https://crm8.effectx.com.au/api/health', owner: 'CRM' },
  { name: 'QueueM8', fullName: 'Jeffa2002/queuem8', productionBranch: 'main', smokeUrl: 'https://queuem8.effectx.com.au/', owner: 'QueueM8' },
  { name: 'QueueM8 App', fullName: 'Jeffa2002/queuem8', productionBranch: 'main', smokeUrl: 'https://app.queuem8.effectx.com.au/', owner: 'QueueM8' },
  { name: 'TimePulse', fullName: 'Jeffa2002/timepulse', productionBranch: 'main', smokeUrl: 'https://timepulse.effectx.com.au/login', owner: 'TimePulse' },
  { name: 'Projenta', fullName: 'Jeffa2002/projenta', productionBranch: 'main', smokeUrl: 'https://projenta.io/', owner: 'Projenta' },
  { name: 'Projenta App', fullName: 'Jeffa2002/projenta', productionBranch: 'main', smokeUrl: 'https://app.projenta.io/', owner: 'Projenta' },
  { name: 'VenConX', fullName: 'Jeffa2002/venconx', productionBranch: 'main', smokeUrl: 'https://venconx.effectx.com.au/', owner: 'VenConX' },
  { name: 'Helix', fullName: 'Jeffa2002/helix', productionBranch: 'main', smokeUrl: 'https://helix.effectx.com.au/', owner: 'Helix' },
  { name: 'NurtureRecord', fullName: 'Jeffa2002/nurturerecord', productionBranch: 'main', smokeUrl: 'https://nurturerecord.effectx.com.au/', owner: 'NurtureRecord' },
  { name: 'Crossbench', fullName: 'Jeffa2002/crossbench', productionBranch: 'main', smokeUrl: 'https://crossbench.io/', owner: 'Crossbench' },
];

const UNIQUE_REPOS = Array.from(new Map(REPOS.map((repo) => [repo.fullName, repo])).values());

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mission-control-estate',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function githubJson(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`GitHub ${path} returned ${res.status}`);
  return res.json();
}

function mapRunStatus(run: any): EstateStatus {
  if (!run) return 'unknown';
  if (run.status !== 'completed') return 'warning';
  if (run.conclusion === 'success') return 'healthy';
  return 'critical';
}

function isPrimaryRun(run: any, repo: EstateRepo) {
  const name = String(run?.name || run?.workflow_name || '');
  const event = String(run?.event || '');
  const branch = String(run?.head_branch || '');
  if (event === 'dynamic' || name.toLowerCase().includes('dependabot')) return false;
  if (branch && branch !== repo.productionBranch) return false;
  return /deploy|validate|production|ci|build/i.test(name);
}

function severityRank(severity: string) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity] ?? 0;
}

function worstStatus(statuses: EstateStatus[]): EstateStatus {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('unknown')) return 'unknown';
  return 'healthy';
}

async function collectRepo(repo: EstateRepo) {
  const [runsResult, alertsResult] = await Promise.allSettled([
    githubJson(`/repos/${repo.fullName}/actions/runs?per_page=5`),
    githubJson(`/repos/${repo.fullName}/dependabot/alerts?state=open&per_page=100`),
  ]);

  const runs = runsResult.status === 'fulfilled' && Array.isArray(runsResult.value.workflow_runs)
    ? runsResult.value.workflow_runs
    : [];
  const alerts = alertsResult.status === 'fulfilled' && Array.isArray(alertsResult.value)
    ? alertsResult.value
    : [];
  const latestRun = runs.find((run: any) => isPrimaryRun(run, repo)) ?? runs.find((run: any) => String(run?.event || '') !== 'dynamic') ?? runs[0];
  const alertCounts = alerts.reduce((counts: Record<string, number>, alert: any) => {
    const severity = alert?.security_advisory?.severity ?? 'unknown';
    counts[severity] = (counts[severity] ?? 0) + 1;
    return counts;
  }, {});
  const worstAlert = alerts
    .map((alert: any) => alert?.security_advisory?.severity ?? 'unknown')
    .sort((a: string, b: string) => severityRank(b) - severityRank(a))[0] ?? null;

  return {
    fullName: repo.fullName,
    productionBranch: repo.productionBranch,
    latestRun: latestRun
      ? {
          name: latestRun.name || latestRun.workflow_name || 'GitHub Actions',
          branch: latestRun.head_branch,
          status: mapRunStatus(latestRun),
          conclusion: latestRun.conclusion,
          startedAt: latestRun.run_started_at || latestRun.created_at,
          title: latestRun.display_title || latestRun.head_commit?.message || '',
          url: latestRun.html_url,
        }
      : null,
    dependabot: {
      status: alerts.some((alert: any) => ['critical', 'high'].includes(alert?.security_advisory?.severity)) ? 'critical' : alerts.length > 0 ? 'warning' : 'healthy',
      open: alerts.length,
      counts: alertCounts,
      worstSeverity: worstAlert,
    },
    warning: runsResult.status === 'rejected' ? String(runsResult.reason?.message || runsResult.reason) : alertsResult.status === 'rejected' ? String(alertsResult.reason?.message || alertsResult.reason) : undefined,
  };
}

async function smoke(repo: EstateRepo) {
  if (!repo.smokeUrl) return null;
  const started = Date.now();
  try {
    const res = await fetch(repo.smokeUrl, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(7_000),
    });
    return {
      name: repo.name,
      url: repo.smokeUrl,
      status: (res.status >= 200 && res.status < 400 ? 'healthy' : res.status >= 400 && res.status < 500 ? 'warning' : 'critical') as EstateStatus,
      httpStatus: res.status,
      latencyMs: Date.now() - started,
    };
  } catch (err: any) {
    return {
      name: repo.name,
      url: repo.smokeUrl,
      status: 'critical' as EstateStatus,
      httpStatus: null,
      latencyMs: Date.now() - started,
      warning: String(err?.message || err),
    };
  }
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const [repoResults, smokeResults] = await Promise.all([
    Promise.all(UNIQUE_REPOS.map(collectRepo)),
    Promise.all(REPOS.map(smoke)),
  ]);

  const repos = UNIQUE_REPOS.map((repo) => {
    const github = repoResults.find((result) => result.fullName === repo.fullName);
    const relatedSmoke = smokeResults.filter((result) => result && REPOS.find((r) => r.name === result.name)?.fullName === repo.fullName);
    const smokeStatus = worstStatus(relatedSmoke.map((result: any) => result.status));
    const dependabotStatus = (github?.dependabot.status ?? 'unknown') as EstateStatus;
    const status = worstStatus([
      github?.latestRun?.status ?? 'unknown',
      dependabotStatus,
      smokeStatus,
    ]);
    return {
      ...repo,
      status,
      github,
      smokes: relatedSmoke,
    };
  });

  const summary = {
    status: worstStatus(repos.map((repo) => repo.status)),
    repos: repos.length,
    critical: repos.filter((repo) => repo.status === 'critical').length,
    warning: repos.filter((repo) => repo.status === 'warning').length,
    dependabotOpen: repos.reduce((sum, repo) => sum + Number(repo.github?.dependabot.open ?? 0), 0),
    smokeCritical: smokeResults.filter((result: any) => result?.status === 'critical').length,
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json({
    ok: true,
    summary,
    repos,
    smokes: smokeResults.filter(Boolean),
    runners: {
      status: 'warning',
      note: 'Prod self-hosted runners have systemd sandboxing; non-root migration remains a controlled maintenance task.',
      controls: ['NoNewPrivileges', 'PrivateTmp', 'LockPersonality', 'RestrictSUIDSGID'],
    },
    residuals: [
      'External provider credential rotation still needs portal access.',
      'Private GitHub secret scanning is unavailable on the current plan.',
      'CRM8 moderate dependency advisories need deliberate framework-library upgrades.',
    ],
  });
}
