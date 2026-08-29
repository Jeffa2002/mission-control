/**
 * @typedef {object} Project
 * @property {string} id
 * @property {string} name
 * @property {string=} repo
 * @property {string} defaultBranch
 * @property {string} language
 * @property {'public' | 'private' | 'local-only'} visibility
 * @property {string[]} localAliases
 * @property {'critical' | 'high' | 'medium' | 'standard'} risk
 * @property {string=} riskReason
 */

/** @type {Project[]} */
export const PROJECTS = [
  ['fetchride-android', 'FetchRide Android', 'Jeffa2002/FetchRide-android', 'master', 'Kotlin', 'private', [], 'standard'],
  ['fetchride', 'FetchRide', 'Jeffa2002/Fetchride', 'master', 'PHP', 'private', [], 'standard'],
  ['abea-ndh', 'ABEA NDH', 'Jeffa2002/abea-ndh', 'main', 'TypeScript', 'public', [], 'standard'],
  ['counseldesk', 'CounselDesk', 'Jeffa2002/counseldesk', 'main', 'JavaScript', 'private', [], 'high'],
  ['crm8', 'CRM8', 'Jeffa2002/crm8', 'main', 'TypeScript', 'private', [], 'high'],
  ['crossbench', 'Crossbench', 'Jeffa2002/crossbench', 'main', 'TypeScript', 'public', [], 'critical', 'Public product with parliamentary monitoring and daily check workflows; outages or stale data are high visibility.'],
  ['effectx-site', 'EffectX Site', 'Jeffa2002/effectx-site', 'master', 'TypeScript', 'public', [], 'standard'],
  ['equim8-site', 'Equim8 Site', 'Jeffa2002/equim8-site', 'main', 'TypeScript', 'private', [], 'standard'],
  ['fuel-price-monitor', 'Fuel Price Monitor', 'Jeffa2002/fuel-price-monitor', 'master', 'JavaScript', 'private', [], 'standard'],
  ['hearth', 'Hearth', undefined, 'main', 'TypeScript', 'local-only', [], 'standard'],
  ['jeffa-net', 'Jeffa.net', 'Jeffa2002/jeffa-net', 'master', 'JavaScript', 'private', [], 'standard'],
  ['keynest', 'Keynest', 'Jeffa2002/keynest', 'main', 'TypeScript', 'private', [], 'standard'],
  ['mission-control', 'Mission Control', 'Jeffa2002/mission-control', 'master', 'TypeScript', 'public', [], 'high'],
  ['nurturerecord', 'NurtureRecord', 'Jeffa2002/nurturerecord', 'main', 'TypeScript', 'private', [], 'critical', 'Private care-record system; availability and data handling issues have higher user and trust impact.'],
  ['ordantra', 'Ordantra', 'Jeffa2002/ordantra', 'main', 'TypeScript', 'private', ['helix'], 'medium'],
  ['orgcharts', 'OrgCharts', 'Jeffa2002/orgcharts', 'main', 'TypeScript', 'private', [], 'standard'],
  ['projenta', 'Projenta', 'Jeffa2002/projenta', 'dev', 'TypeScript', 'private', [], 'medium'],
  ['queuem8', 'QueueM8', 'Jeffa2002/queuem8', 'dev', 'TypeScript', 'private', [], 'medium'],
  ['shazza-bot', 'Shazza Bot', 'Jeffa2002/shazza-bot', 'main', 'Python', 'private', [], 'high'],
  ['spacecadet-cloud', 'SpaceCadet Cloud', 'Jeffa2002/spacecadet-cloud', 'master', 'HTML', 'private', [], 'standard'],
  ['timepulse', 'TimePulse', 'Jeffa2002/timepulse', 'main', 'TypeScript', 'private', [], 'critical', 'Operational time-tracking product with production uptime probes; downtime directly affects customer workflows.'],
  ['transparent-cause-draw', 'Transparent Cause Draw', 'Jeffa2002/transparent-cause-draw', 'main', 'HTML', 'private', [], 'standard'],
  ['upside', 'Upside', 'Jeffa2002/upside', 'main', 'TypeScript', 'private', [], 'high'],
  ['venconx', 'VenConX', 'Jeffa2002/venconx', 'main', 'TypeScript', 'private', [], 'high'],
  ['yielddock', 'YieldDock', 'Jeffa2002/yielddock', 'main', 'TypeScript', 'private', ['property-hub'], 'standard'],
].map(([id, name, repo, defaultBranch, language, visibility, localAliases, risk, riskReason]) => ({
  id, name, repo, defaultBranch, language, visibility, localAliases, risk, riskReason,
}));

/** @param {string} value */
export function canonicalProjectId(value) {
  const normalized = value.trim().toLowerCase();
  return PROJECTS.find((project) => project.id === normalized || project.localAliases.includes(normalized))?.id ?? null;
}

/** @param {string} value */
export function findProject(value) {
  const id = canonicalProjectId(value);
  return id ? PROJECTS.find((project) => project.id === id) ?? null : null;
}
