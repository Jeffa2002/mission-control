import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { PROJECTS } from '../../../lib/project-registry.mjs';
import {
  PORTFOLIO_MAP,
  deployAppToProduct,
  endpointAppToProduct,
  fleetTargetToProduct,
  unmappedWarnings,
} from '../../../lib/portfolio-map.mjs';
import {
  derivePortfolioTone,
  summarizePortfolio,
  uptimeTargetTone,
} from './portfolio-model';

/**
 * GET /api/portfolio
 *
 * Aggregates registry + effectx + fleet-health + deploys into one rollup
 * with server-side tone derivation (§2 of docs/portfolio-design.md), so the
 * panel and any future surface share one truth.
 *
 * Runs inside the standalone Next server, so upstream calls go back to the
 * local listener with the caller's session cookie forwarded for auth
 * (same pattern as /api/overview). Each source has an independent timeout;
 * a failed source degrades to sources[x].ok=false + coverage.partial and
 * never produces a 500 unless every source fails.
 */

const BASE = process.env.PANEL_INTERNAL_BASE ?? 'http://127.0.0.1:3020';
const SOURCE_TIMEOUT_MS = 4_000;
const DEPLOY_WINDOW_MS = 30 * 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

type SourceResult = { ok: boolean; error?: string; value?: any };

async function fetchSource(path: string, headers: Record<string, string>): Promise<SourceResult> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `${path} returned ${res.status}` };
    return { ok: true, value: await res.json() };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function groupByProduct<T>(items: T[], resolve: (item: T) => string | null): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const productId = resolve(item);
    if (!productId) continue;
    const list = grouped.get(productId) ?? [];
    list.push(item);
    grouped.set(productId, list);
  }
  return grouped;
}

const TONE_SEVERITY: Record<string, number> = { nominal: 0, attention: 1, incident: 2 };

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const cookie = req.headers.get('cookie') ?? '';
  const headers = cookie ? { cookie } : {};

  const [effectx, fleet, deploys] = await Promise.all([
    fetchSource('/api/effectx', headers),
    fetchSource('/api/fleet-health', headers),
    fetchSource('/api/deploys', headers),
  ]);

  const sources: Record<string, unknown> = {
    effectx: effectx.ok ? { ok: true } : { ok: false, error: effectx.error },
    fleet: fleet.ok ? { ok: true } : { ok: false, error: fleet.error },
    deploys: deploys.ok ? { ok: true } : { ok: false, error: deploys.error },
  };

  if (!effectx.ok && !fleet.ok && !deploys.ok) {
    return NextResponse.json(
      { error: 'All portfolio sources failed', sources },
      { status: 500 },
    );
  }

  const apps: any[] = effectx.ok ? (effectx.value?.apps ?? []) : [];
  const fleetTargets: any[] = fleet.ok
    ? [...(fleet.value?.fleet?.targets ?? []), ...(fleet.value?.timepulse?.targets ?? [])]
    : [];
  const fleetAsOf: string | null = fleet.ok ? (fleet.value?.generated_at ?? null) : null;
  const allDeploys: any[] = deploys.ok ? (deploys.value?.deploys ?? []) : [];

  sources.warnings = unmappedWarnings({
    effectxAppIds: apps.map((app) => app.id),
    fleetTargets: fleetTargets.map((target) => target.target),
  });

  const endpointsByProduct = groupByProduct(apps, (app) => endpointAppToProduct(app.id));
  const targetsByProduct = groupByProduct(fleetTargets, (target) =>
    fleetTargetToProduct(target.target),
  );
  const deploysByProduct = groupByProduct(allDeploys, (deploy) =>
    deployAppToProduct(deploy.app),
  );

  const now = Date.now();
  const windowStart = now - DEPLOY_WINDOW_MS;
  const dayStart = now - DAY_MS;

  const products = PROJECTS.map((project: any) => {
    const mapping = PORTFOLIO_MAP[project.id] ?? { endpointAppIds: [], fleetTargets: [], deployApps: [] };

    const endpoints = effectx.ok
      ? (endpointsByProduct.get(project.id) ?? []).map((app: any) => ({
          appId: app.id,
          name: app.name,
          url: app.url,
          status: app.status,
          latencyMs: typeof app.latencyMs === 'number' ? app.latencyMs : null,
          tls: app.ssl
            ? { valid: Boolean(app.ssl.valid), daysRemaining: app.ssl.daysRemaining }
            : null,
          checkedAt: app.checkedAt ?? null,
        }))
      : [];

    const targets = fleet.ok ? (targetsByProduct.get(project.id) ?? []) : [];

    const productDeploys = (deploys.ok ? (deploysByProduct.get(project.id) ?? []) : [])
      .filter((deploy: any) => Number.isFinite(Date.parse(deploy.startedAt)))
      .filter((deploy: any) => Date.parse(deploy.startedAt) >= windowStart)
      .sort((a: any, b: any) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const latestDeploy = productDeploys[0] ?? null;

    const derivation = derivePortfolioTone({ endpoints, uptimeTargets: targets, latestDeploy }, now);

    const coverage = {
      endpoint: effectx.ok && endpoints.length > 0,
      uptime: fleet.ok && targets.length > 0,
      deploys: deploys.ok && latestDeploy !== null,
    };
    const missing: string[] = [];
    const partial: string[] = [];
    if (!coverage.endpoint) (!effectx.ok && mapping.endpointAppIds.length ? partial : missing).push('endpoint');
    if (!coverage.uptime) (!fleet.ok && mapping.fleetTargets.length ? partial : missing).push('uptime');
    if (!coverage.deploys) (!deploys.ok && mapping.deployApps.length ? partial : missing).push('deploys');

    // Headline uptime = worst mapped target; raw detail for all targets rides
    // alongside so the inspector can show per-target evidence.
    const ranked = targets
      .map((target: any) => ({ target, tone: uptimeTargetTone(target).tone }))
      .sort((a: any, b: any) => {
        const sevA = a.tone === null ? -1 : TONE_SEVERITY[a.tone];
        const sevB = b.tone === null ? -1 : TONE_SEVERITY[b.tone];
        if (sevA !== sevB) return sevB - sevA;
        const upA = a.target.uptime_24h ?? Infinity;
        const upB = b.target.uptime_24h ?? Infinity;
        if (upA !== upB) return upA - upB;
        return (b.target.consecutive_failures ?? 0) - (a.target.consecutive_failures ?? 0);
      });
    const shapeTarget = (target: any, tone: string | null) => ({
      target: target.target,
      uptime24h: target.uptime_24h ?? null,
      p95Ms: typeof target.p95_24h === 'number' ? target.p95_24h : null,
      probesOk: target.ok_24h ?? 0,
      probesTotal: target.probes_24h ?? 0,
      latestHttpCode: target.http_code ?? null,
      consecutiveFailures: target.consecutive_failures ?? 0,
      tone,
      asOf: fleetAsOf ?? target.ts ?? null,
    });
    const uptime = ranked.length ? shapeTarget(ranked[0].target, ranked[0].tone) : null;

    const deploy = latestDeploy
      ? {
          status: latestDeploy.status,
          app: latestDeploy.app,
          branch: latestDeploy.branch,
          commit: String(latestDeploy.commit ?? '').slice(0, 8),
          commitMsg: latestDeploy.commitMsg ?? '',
          triggeredBy: latestDeploy.triggeredBy ?? 'unknown',
          startedAt: latestDeploy.startedAt,
          durationS: typeof latestDeploy.durationS === 'number' ? latestDeploy.durationS : null,
          count24h: productDeploys.filter((d: any) => Date.parse(d.startedAt) >= dayStart).length,
          failed24h: productDeploys.filter(
            (d: any) => d.status === 'failure' && Date.parse(d.startedAt) >= dayStart,
          ).length,
        }
      : null;

    return {
      id: project.id,
      name: project.name,
      aliases: project.localAliases ?? [],
      repo: project.repo ?? null,
      visibility: project.visibility,
      language: project.language,
      defaultBranch: project.defaultBranch,
      risk: project.risk,
      tone: derivation.tone,
      toneReasons: derivation.toneReasons,
      signalsDisagree: derivation.signalsDisagree,
      coverage: { ...coverage, missing, partial },
      endpoints,
      uptime,
      deploy,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sources,
    summary: summarizePortfolio(products),
    products,
  });
}
