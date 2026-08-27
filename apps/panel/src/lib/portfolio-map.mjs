/**
 * Explicit product ↔ telemetry-signal mapping for the /portfolio rollup.
 *
 * effectx app ids, fleet probe targets, and deploy app names do not always
 * equal registry project ids, so the mapping is explicit and auditable.
 * Seeded from the registry via canonicalProjectId() (handles aliases such as
 * helix → ordantra and property-hub → yielddock) with manual overrides for
 * multi-endpoint products and renamed targets.
 *
 * Discovery sources (read-only, not imported):
 * - effectx app ids:  src/app/api/effectx/route.ts (APPS)
 * - fleet targets:    ops/fleet-monitoring/targets.conf (probed on per-web)
 *                     + timepulse probe set targets (prod_health, prod_login,
 *                     staging_health) surfaced via /api/fleet-health
 * - deploy app names: /api/deploys aggregates GitHub Actions runs of the
 *                     Jeffa2002/mission-control repo (app = workflow name)
 *                     plus deploy-log webhook entries; no other product repo
 *                     currently posts deploy webhooks, so only mission-control
 *                     has deployApps until that changes.
 *
 * Anything observed upstream but not mapped here surfaces in
 * sources.warnings[] via unmappedWarnings() — coverage gaps are never silent.
 */

import { PROJECTS, canonicalProjectId } from './project-registry.mjs';

/**
 * @typedef {{ endpointAppIds: string[], fleetTargets: string[], deployApps: string[] }} ProductSignals
 */

/** @type {Record<string, ProductSignals>} */
const SIGNALS = {
  venconx: {
    endpointAppIds: ['venconx'],
    fleetTargets: ['venconx'],
    deployApps: [],
  },
  queuem8: {
    endpointAppIds: ['queuem8-app', 'queuem8-web'],
    fleetTargets: ['queuem8', 'queuem8-app'],
    deployApps: [],
  },
  projenta: {
    endpointAppIds: ['projenta-app', 'projenta-web'],
    // projenta-www probes www.projenta.io, the same surface as projenta.
    fleetTargets: ['projenta', 'projenta-www', 'projenta-app'],
    deployApps: [],
  },
  ordantra: {
    endpointAppIds: ['ordantra-app', 'ordantra-web'],
    // Includes legacy and support surfaces plus helix (registry alias).
    fleetTargets: [
      'ordantra',
      'ordantra-app',
      'ordantra-support',
      'ordantra-legacy',
      'ordantra-app-legacy',
      'helix-legacy',
      'helix-app-legacy',
    ],
    deployApps: [],
  },
  timepulse: {
    endpointAppIds: ['timepulse'],
    // Fleet target plus the product's own uptime probe set (timepulse-uptime.timer).
    fleetTargets: ['timepulse', 'prod_health', 'prod_login', 'staging_health'],
    deployApps: [],
  },
  crossbench: {
    endpointAppIds: ['crossbench'],
    fleetTargets: ['crossbench'],
    deployApps: [],
  },
  'abea-ndh': {
    endpointAppIds: ['abea-ndh'],
    fleetTargets: ['abea'], // probe target renamed on the fleet monitor
    deployApps: [],
  },
  counseldesk: {
    endpointAppIds: [], // no effectx endpoint registered; probe-only product
    fleetTargets: ['counseldesk'],
    deployApps: [],
  },
  crm8: {
    endpointAppIds: ['crm8'],
    fleetTargets: ['crm8'],
    deployApps: [],
  },
  'effectx-site': {
    endpointAppIds: ['effectx-site'],
    fleetTargets: ['effectx-site'],
    deployApps: [],
  },
  'equim8-site': {
    endpointAppIds: ['equim8-site'],
    fleetTargets: ['equim8'], // probe target omits the -site suffix
    deployApps: [],
  },
  'fuel-price-monitor': {
    // The effectx endpoint 'fuel' and fleet target 'fuel' are deliberately NOT
    // attributed here: "Fuel tool surface" is not verifiably the Fuel Price
    // Monitor product. Both surface as unmapped warnings instead of a guess.
    endpointAppIds: [],
    fleetTargets: [],
    deployApps: [],
  },
  hearth: {
    // Local-only product, but the fleet monitor does probe hearth.effectx.com.au;
    // the signal is surfaced honestly when probe data exists.
    endpointAppIds: [],
    fleetTargets: ['hearth'],
    deployApps: [],
  },
  'jeffa-net': {
    endpointAppIds: [],
    fleetTargets: ['jeffa-net'],
    deployApps: [],
  },
  keynest: {
    endpointAppIds: [],
    fleetTargets: ['keynest'],
    deployApps: [],
  },
  'mission-control': {
    endpointAppIds: ['mission-control'],
    fleetTargets: ['mission-control'],
    // /api/deploys app names for this repo are GitHub workflow names.
    // 'Validate Panel' is CI validation, not a deploy, and stays unmatched.
    deployApps: ['mission-control', 'deploy mission control'],
  },
  nurturerecord: {
    endpointAppIds: ['nurturerecord'],
    fleetTargets: ['nurturerecord'],
    deployApps: [],
  },
  orgcharts: {
    endpointAppIds: ['orgcharts'],
    fleetTargets: ['orgcharts'],
    deployApps: [],
  },
  'spacecadet-cloud': {
    endpointAppIds: [],
    fleetTargets: ['spacecadet'], // probe target omits the -cloud suffix
    deployApps: [],
  },
  yielddock: {
    endpointAppIds: ['yielddock'],
    fleetTargets: ['yielddock'],
    deployApps: [],
  },
  // Zero-signal registry products (render as unknown / "No live telemetry"):
  // fetchride, fetchride-android, shazza-bot, transparent-cause-draw, upside.
};

const EMPTY = Object.freeze({ endpointAppIds: [], fleetTargets: [], deployApps: [] });

/** Every registry product gets an entry (empty when unmapped). */
export const PORTFOLIO_MAP = Object.freeze(
  Object.fromEntries(PROJECTS.map((project) => [project.id, SIGNALS[project.id] ?? EMPTY])),
);

const endpointIndex = new Map();
const fleetIndex = new Map();
const deployIndex = new Map();
for (const [productId, signals] of Object.entries(PORTFOLIO_MAP)) {
  for (const id of signals.endpointAppIds) endpointIndex.set(id, productId);
  for (const target of signals.fleetTargets) fleetIndex.set(target, productId);
  for (const app of signals.deployApps) deployIndex.set(app.toLowerCase(), productId);
}

/**
 * Resolve an effectx app id to a product id. Falls back to the registry
 * canonical lookup so future endpoints named after a product id/alias map
 * automatically.
 * @param {string} appId
 * @returns {string | null}
 */
export function endpointAppToProduct(appId) {
  return endpointIndex.get(appId) ?? canonicalProjectId(appId);
}

/**
 * Resolve a fleet probe target to a product id.
 * @param {string} target
 * @returns {string | null}
 */
export function fleetTargetToProduct(target) {
  return fleetIndex.get(target) ?? canonicalProjectId(target);
}

/**
 * Resolve a deploy feed app name to a product id (case-insensitive).
 * @param {string} app
 * @returns {string | null}
 */
export function deployAppToProduct(app) {
  if (typeof app !== 'string' || !app.trim()) return null;
  return deployIndex.get(app.trim().toLowerCase()) ?? canonicalProjectId(app);
}

/**
 * Audit warnings for upstream signals that map to no product.
 * @param {{ effectxAppIds?: string[], fleetTargets?: string[] }} observed
 * @returns {string[]}
 */
export function unmappedWarnings(observed) {
  const warnings = [];
  for (const id of observed.effectxAppIds ?? []) {
    if (!endpointAppToProduct(id)) warnings.push(`effectx endpoint '${id}' is not mapped to any product`);
  }
  for (const target of observed.fleetTargets ?? []) {
    if (!fleetTargetToProduct(target)) warnings.push(`fleet target '${target}' is not mapped to any product`);
  }
  return warnings.sort();
}
