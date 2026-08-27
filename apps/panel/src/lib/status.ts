/**
 * Single source of truth for status → severity colour mapping.
 *
 * Every status colour in the panel should resolve to one of the global
 * `--sev-*` design tokens defined in `src/app/globals.css`. Pages with their
 * own status vocabularies (office roster, security baseline, health cards)
 * are mapped onto the same palette here so severity semantics stay unified:
 *
 * - amber (--sev-warning) is reserved for warning/degraded/idle states
 * - red (--sev-critical) is reserved for the highest severity
 *
 * Dependency-free: safe to import from client and server components.
 */

export type Status =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'info'
  | 'neutral'
  // Page-specific vocabularies, mapped onto the severity palette.
  | 'working' // office roster: agent actively working → healthy
  | 'idle' // office roster: recent heartbeat, no active task → warning
  | 'offline' // office roster: no recent heartbeat → neutral
  | 'normal' // security baseline: nominal → healthy
  | 'watch' // security baseline: needs attention → warning
  | 'alert' // security baseline: active alert → critical
  | 'stale' // security baseline / health card: no fresh telemetry → neutral
  | 'degraded'; // health card: degraded → warning

const STATUS_TOKENS: Record<Status, string> = {
  healthy: 'var(--sev-healthy)',
  working: 'var(--sev-healthy)',
  normal: 'var(--sev-healthy)',
  warning: 'var(--sev-warning)',
  idle: 'var(--sev-warning)',
  watch: 'var(--sev-warning)',
  degraded: 'var(--sev-warning)',
  critical: 'var(--sev-critical)',
  alert: 'var(--sev-critical)',
  info: 'var(--sev-info)',
  neutral: 'var(--sev-neutral)',
  offline: 'var(--sev-neutral)',
  stale: 'var(--sev-neutral)',
};

/** Returns the CSS custom property (`var(--sev-*)`) for a status. */
export function statusColor(status: Status): string {
  return STATUS_TOKENS[status];
}
