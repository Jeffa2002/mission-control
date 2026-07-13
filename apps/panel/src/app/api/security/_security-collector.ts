import { execFileSync } from 'node:child_process';
import { escapeShell, readFirstExisting, safeExec } from './_security-logs';
import { SYSTEM_REGISTRY } from '../_system-health';

type SecurityHostKind = 'local' | 'ssh';

export type SecurityHostConfig = {
  id: string;
  label: string;
  kind: SecurityHostKind;
  host?: string;
  port?: string;
  user?: string;
  key?: string;
};

export type HostSecurityStatus = {
  id: string;
  label: string;
  reporting: boolean;
  checkedAt: string;
  sources: {
    auth: boolean;
    nginx: boolean;
    nginxError: boolean;
    firewall: boolean;
    fail2ban: boolean;
    kernel: boolean;
    system: boolean;
  };
  error?: string;
};

type AuthEvent = {
  ts: string;
  host: string;
  type: 'auth-fail' | 'ssh-accept' | 'sudo' | 'su';
  user: string;
  detail: string;
};

type WebEvent = {
  ts: string;
  host: string;
  ip: string;
  method: string;
  path: string;
  status: number;
};

type HostSignalEvent = {
  ts: string;
  host: string;
  severity: 'warning' | 'error' | 'critical';
  category: 'kernel' | 'system' | 'nginx-error';
  detail: string;
};

type FirewallEvent = {
  ts: string;
  host: string;
  src: string;
  dst: string;
  dpt: string;
  proto: string;
};

type FirewallRollup = {
  key: string;
  count: number;
};

type FirewallHostRollup = FirewallRollup & {
  label: string;
  sampled: boolean;
};

type Fail2BanState = {
  available: boolean;
  banned: number;
  totalFailed: number;
  bannedIPs: string[];
};

const FIREWALL_SAMPLE_LIMIT = 500;
const EVIDENCE_LIMIT = 25;
const SIGNAL_SAMPLE_LIMIT = 500;

const LOCAL_HOST: SecurityHostConfig = {
  id: process.env.SECURITY_LOCAL_HOST_ID || 'prod',
  label: process.env.SECURITY_LOCAL_HOST_LABEL || 'Prod / per-web',
  kind: 'local',
};

const SECURITY_FLEET_REGISTRY = [
  { id: 'prod', label: 'Prod / per-web' },
  { id: 'bazza', label: 'Bazza' },
  { id: 'crm8', label: 'CRM8' },
  { id: 'sec1', label: 'Sec1' },
  { id: 'secspy-lab01', label: 'SecSpy Lab 01' },
  { id: 'backup-melb', label: 'Backup Melbourne' },
  { id: 'shazza', label: 'Shazza' },
  { id: 'ubuntu-geekom', label: 'Ubuntu Geekom' },
];

function parseConfiguredHosts(): SecurityHostConfig[] {
  const raw = process.env.SECURITY_REMOTE_HOSTS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((host) => ({
        id: String(host.id || host.host || '').trim(),
        label: String(host.label || host.id || host.host || '').trim(),
        kind: 'ssh' as const,
        host: String(host.host || '').trim(),
        port: String(host.port || '22'),
        user: String(host.user || 'root'),
        key: host.key ? String(host.key) : undefined,
      }))
      .filter((host) => host.id && host.host);
  } catch {
    return [];
  }
}

export function getSecurityHosts(): SecurityHostConfig[] {
  const configured = parseConfiguredHosts();
  const byId = new Map<string, SecurityHostConfig>();
  for (const host of [LOCAL_HOST, ...configured]) {
    byId.set(host.id, host);
  }
  return [...byId.values()];
}

export function getRegisteredHostCoverage(configuredHosts = getSecurityHosts()) {
  const configuredIds = new Set(configuredHosts.map((host) => host.id));
  const registered = new Map<string, { id: string; label: string }>();
  for (const system of SYSTEM_REGISTRY) registered.set(system.id, { id: system.id, label: system.label });
  for (const system of SECURITY_FLEET_REGISTRY) registered.set(system.id, system);

  return [...registered.values()].map((system) => ({
    id: system.id,
    label: system.label,
    reporting: configuredIds.has(system.id),
    securityChannel: configuredIds.has(system.id) ? 'configured' : 'not-configured',
  }));
}

function runHostCommand(host: SecurityHostConfig, command: string): string {
  if (host.kind === 'local') return safeExec(command);
  if (!host.host) return '';

  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=5',
    '-p', host.port || '22',
  ];
  if (host.key) args.push('-i', host.key);
  args.push(`${host.user || 'root'}@${host.host}`, `bash -lc ${escapeShell(command)}`);

  try {
    return execFileSync('ssh', args, { encoding: 'utf8', timeout: 12_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const stdout = err.stdout?.toString() || '';
    if (stdout.trim()) return stdout;
    const detail = [err.stdout?.toString() || '', err.stderr?.toString() || '', err.message || ''].filter(Boolean).join('\n');
    return `__SECURITY_COMMAND_ERROR__ ${detail}`;
  }
}

function tsFromSyslog(prefix: string): string {
  const year = new Date().getFullYear();
  const parsed = new Date(`${prefix} ${year}`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseAuthLine(line: string, host: string): AuthEvent | null {
  const tsMatch = line.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s[\d:]{8})/);
  if (!tsMatch) return null;
  const ts = tsFromSyslog(tsMatch[1]);
  if (line.includes('sshd') && (line.includes('Failed password') || line.includes('Invalid user') || line.includes('authentication failure'))) {
    const user = line.match(/(?:for invalid user|for|user=|user\s+)(\S+)/)?.[1] ?? 'unknown';
    return { ts, host, type: 'auth-fail', user, detail: line };
  }
  if (line.includes('sshd') && line.includes('Accepted ')) {
    const user = line.match(/for\s+(\S+)/)?.[1] ?? 'unknown';
    const from = line.match(/from\s+([0-9a-fA-F:.]+)/)?.[1] ?? 'unknown';
    return { ts, host, type: 'ssh-accept', user, detail: from };
  }
  if (line.includes('sudo:')) {
    const user = line.match(/\s(\w+)\s*:\s*TTY=/)?.[1] ?? 'unknown';
    const detail = line.match(/COMMAND=(.*)$/)?.[1] ?? line;
    return { ts, host, type: 'sudo', user, detail };
  }
  if (line.includes('su:')) {
    const user = line.match(/for\s+(\S+)/)?.[1] ?? 'unknown';
    return { ts, host, type: 'su', user, detail: line };
  }
  return null;
}

function parseNginxLine(line: string, host: string): WebEvent | null {
  const m = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]+" (\d{3})/);
  if (!m) return null;
  const [, ip, rawTs, method, path, status] = m;
  const parsed = new Date(rawTs.replace(/:/, ' '));
  return {
    ts: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
    host,
    ip,
    method,
    path,
    status: Number(status),
  };
}

function parseNginxErrorLine(line: string, host: string): HostSignalEvent | null {
  const m = line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+\d+#\d+:\s+(.*)$/);
  if (!m) return null;
  const [, rawTs, level, detail] = m;
  const parsed = new Date(rawTs.replace(/\//g, '-'));
  const severity = /crit|alert|emerg/i.test(level) ? 'critical' : /error/i.test(level) ? 'error' : 'warning';
  return {
    ts: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
    host,
    category: 'nginx-error',
    severity,
    detail,
  };
}

function parseFirewallLine(line: string, host: string): FirewallEvent | null {
  if (!line.includes('UFW BLOCK')) return null;
  const tsMatch = line.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s[\d:]{8})/);
  return {
    ts: tsMatch ? tsFromSyslog(tsMatch[1]) : new Date().toISOString(),
    host,
    src: line.match(/SRC=([0-9a-fA-F:.]+)/)?.[1] ?? 'unknown',
    dst: line.match(/DST=([0-9a-fA-F:.]+)/)?.[1] ?? 'unknown',
    dpt: line.match(/DPT=(\d+)/)?.[1] ?? 'unknown',
    proto: line.match(/PROTO=([A-Za-z0-9]+)/)?.[1] ?? 'unknown',
  };
}

function parseHostSignalLine(line: string, host: string, category: HostSignalEvent['category']): HostSignalEvent | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes('UFW BLOCK')) return null;

  if (trimmed.startsWith('__FAILED_UNIT__ ')) {
    return {
      ts: new Date().toISOString(),
      host,
      category: 'system',
      severity: 'error',
      detail: trimmed.replace('__FAILED_UNIT__ ', '').trim(),
    };
  }

  const syslogTs = trimmed.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s[\d:]{8})/);
  const isoTs = trimmed.match(/^(\d{4}-\d{2}-\d{2}T[\d:.+-]+)/);
  const ts = syslogTs ? tsFromSyslog(syslogTs[1]) : isoTs ? new Date(isoTs[1]).toISOString() : new Date().toISOString();
  const severity = /panic|critical|crit|alert|emerg|segfault|oom|out of memory|BUG:/i.test(trimmed)
    ? 'critical'
    : /error|failed|failure|denied|unreachable/i.test(trimmed)
      ? 'error'
      : 'warning';
  return { ts, host, category, severity, detail: trimmed };
}

function parseFail2Ban(raw: string): Fail2BanState {
  const available = /Status for the jail|Currently banned|Total failed/i.test(raw);
  if (available) {
    const banned = Number(raw.match(/Currently banned:\s*(\d+)/i)?.[1] || 0);
    const totalFailed = Number(raw.match(/Total failed:\s*(\d+)/i)?.[1] || 0);
    const bannedIPs = (raw.match(/Banned IP list:\s*(.*)/i)?.[1] || '')
      .split(/\s+/)
      .map((ip) => ip.trim())
      .filter(Boolean);
    return { available, banned, totalFailed, bannedIPs };
  }

  const active = new Set<string>();
  let totalFailed = 0;
  for (const line of raw.split('\n')) {
    const ban = line.match(/\[(?:sshd|ssh)\].*\bBan\s+([0-9a-fA-F:.]+)/);
    const unban = line.match(/\[(?:sshd|ssh)\].*\bUnban\s+([0-9a-fA-F:.]+)/);
    if (/fail2ban\.filter.*Found\s+([0-9a-fA-F:.]+)/i.test(line)) totalFailed += 1;
    if (ban) active.add(ban[1]);
    if (unban) active.delete(unban[1]);
  }
  const bannedIPs = [...active];
  return {
    available: raw.includes('fail2ban') || bannedIPs.length > 0 || totalFailed > 0,
    banned: bannedIPs.length,
    totalFailed,
    bannedIPs,
  };
}

async function readLocalFail2Ban() {
  const client = safeExec('fail2ban-client status sshd 2>/dev/null || fail2ban-client status ssh 2>/dev/null || true');
  if (/Status for the jail|Currently banned|Total failed/i.test(client)) return client;

  const log = await readFirstExisting(['/host-logs/fail2ban.log', '/var/log/fail2ban.log']);
  return log
    .split('\n')
    .filter((line) => line.includes('fail2ban') && /\[(?:sshd|ssh)\]/.test(line))
    .slice(-SIGNAL_SAMPLE_LIMIT)
    .join('\n');
}

function commandFailed(raw: string) {
  return raw.includes('__SECURITY_COMMAND_ERROR__');
}

async function readLocalAuth() {
  const file = await readFirstExisting(['/host-logs/auth.log', '/var/log/auth.log']);
  return file || safeExec('journalctl -u ssh -u sshd --since "24 hours ago" --no-pager 2>/dev/null');
}

async function readLocalNginx() {
  return await readFirstExisting(['/host-logs/nginx/access.log', '/var/log/nginx/access.log']);
}

async function readLocalNginxError() {
  return await readFirstExisting(['/host-logs/nginx/error.log', '/var/log/nginx/error.log']);
}

async function readLocalFirewall() {
  const file = await readFirstExisting(['/host-logs/kern.log', '/host-logs/syslog', '/var/log/kern.log', '/var/log/syslog']);
  if (file) return file.split('\n').filter((line) => line.includes('UFW BLOCK')).join('\n');
  return safeExec(`tmp=$(mktemp); journalctl -k --since "24 hours ago" --no-pager 2>/dev/null | grep "UFW BLOCK" > "$tmp" || true; printf "__FIREWALL_TOTAL__ %s\\n" "$(wc -l < "$tmp" | tr -d " ")"; tail -n ${FIREWALL_SAMPLE_LIMIT} "$tmp"; rm -f "$tmp"`);
}

async function readLocalKernelIssues() {
  const file = await readFirstExisting(['/host-logs/kern.log', '/host-logs/syslog', '/var/log/kern.log', '/var/log/syslog']);
  if (file) {
    return file
      .split('\n')
      .filter((line) => !line.includes('UFW BLOCK') && /(error|fail|warn|critical|segfault|oom|out of memory|blocked|denied|panic|BUG:|Call Trace)/i.test(line))
      .slice(-SIGNAL_SAMPLE_LIMIT)
      .join('\n');
  }
  return safeExec(`journalctl -k -p warning..alert --since "24 hours ago" --no-pager 2>/dev/null | tail -n ${SIGNAL_SAMPLE_LIMIT}`);
}

async function readLocalSystemIssues() {
  const file = await readFirstExisting(['/host-logs/syslog', '/var/log/syslog']);
  const syslog = file
    ? file
        .split('\n')
        .filter((line) => /(systemd|kernel|docker|containerd|nginx|fail2ban|cron|sudo).*?(error|fail|warn|critical|denied|timeout|unreachable)/i.test(line))
        .slice(-SIGNAL_SAMPLE_LIMIT)
        .join('\n')
    : safeExec(`journalctl -p warning..alert --since "24 hours ago" --no-pager 2>/dev/null | tail -n ${SIGNAL_SAMPLE_LIMIT}`);
  const failedUnits = safeExec("systemctl --failed --no-legend --plain 2>/dev/null | sed 's/^/__FAILED_UNIT__ /' || true");
  return [syslog, failedUnits].filter(Boolean).join('\n');
}

function splitFirewallRaw(raw: string) {
  const lines = raw.split('\n');
  const marker = lines.find((line) => line.startsWith('__FIREWALL_TOTAL__ '));
  const total = marker ? Number(marker.replace('__FIREWALL_TOTAL__ ', '').trim()) : undefined;
  const eventLines = lines.filter((line) => line.includes('UFW BLOCK'));
  return { total: Number.isFinite(total) ? total : undefined, eventLines };
}

function topRollups(events: FirewallEvent[], keyFor: (event: FirewallEvent) => string, limit = 8): FirewallRollup[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = keyFor(event);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function topValues<T>(events: T[], keyFor: (event: T) => string, limit = 8): FirewallRollup[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = keyFor(event) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function countByHost<T extends { host: string }>(events: T[], hosts: HostSecurityStatus[]): FirewallHostRollup[] {
  const labels = new Map(hosts.map((host) => [host.id, host.label]));
  return topValues(events, (event) => event.host, hosts.length)
    .map((item) => ({
      ...item,
      label: labels.get(item.key) || item.key,
      sampled: false,
    }));
}

function formatSignal(event: HostSignalEvent) {
  return `${event.host} ${event.severity} ${event.category}: ${event.detail}`;
}

async function collectHost(host: SecurityHostConfig) {
  const checkedAt = new Date().toISOString();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const authRaw = host.kind === 'local'
    ? await readLocalAuth()
    : runHostCommand(host, 'journalctl -u ssh -u sshd --since "24 hours ago" --no-pager 2>/dev/null || tail -n 2000 /var/log/auth.log 2>/dev/null');
  const nginxRaw = host.kind === 'local'
    ? await readLocalNginx()
    : runHostCommand(host, 'tail -n 1000 /var/log/nginx/access.log /var/log/nginx/*access.log 2>/dev/null');
  const nginxErrorRaw = host.kind === 'local'
    ? await readLocalNginxError()
    : runHostCommand(host, `tail -n ${SIGNAL_SAMPLE_LIMIT} /var/log/nginx/error.log /var/log/nginx/*error.log 2>/dev/null`);
  const firewallRaw = host.kind === 'local'
    ? await readLocalFirewall()
    : runHostCommand(host, `tmp=$(mktemp); journalctl -k --since "24 hours ago" --no-pager 2>/dev/null | grep "UFW BLOCK" > "$tmp" || true; printf "__FIREWALL_TOTAL__ %s\\n" "$(wc -l < "$tmp" | tr -d " ")"; tail -n ${FIREWALL_SAMPLE_LIMIT} "$tmp"; rm -f "$tmp"`);
  const fail2banRaw = host.kind === 'local'
    ? await readLocalFail2Ban()
    : runHostCommand(host, 'fail2ban-client status sshd 2>/dev/null || fail2ban-client status ssh 2>/dev/null || true');
  const kernelRaw = host.kind === 'local'
    ? await readLocalKernelIssues()
    : runHostCommand(host, `journalctl -k -p warning..alert --since "24 hours ago" --no-pager 2>/dev/null | tail -n ${SIGNAL_SAMPLE_LIMIT}`);
  const systemRaw = host.kind === 'local'
    ? await readLocalSystemIssues()
    : runHostCommand(host, `journalctl -p warning..alert --since "24 hours ago" --no-pager 2>/dev/null | tail -n ${SIGNAL_SAMPLE_LIMIT}; systemctl --failed --no-legend --plain 2>/dev/null | sed 's/^/__FAILED_UNIT__ /' || true`);

  const auth = authRaw.split('\n').map((line) => parseAuthLine(line, host.id)).filter((event): event is AuthEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const nginx = nginxRaw.split('\n').map((line) => parseNginxLine(line, host.id)).filter((event): event is WebEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const nginxError = nginxErrorRaw.split('\n').map((line) => parseNginxErrorLine(line, host.id)).filter((event): event is HostSignalEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const firewallSplit = splitFirewallRaw(firewallRaw);
  const firewall = firewallSplit.eventLines.map((line) => parseFirewallLine(line, host.id)).filter((event): event is FirewallEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const fail2ban = parseFail2Ban(fail2banRaw);
  const kernel = kernelRaw.split('\n').map((line) => parseHostSignalLine(line, host.id, 'kernel')).filter((event): event is HostSignalEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const system = systemRaw.split('\n').map((line) => parseHostSignalLine(line, host.id, 'system')).filter((event): event is HostSignalEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const hostFailed = commandFailed(authRaw) && commandFailed(firewallRaw) && commandFailed(fail2banRaw) && commandFailed(kernelRaw) && commandFailed(systemRaw);
  const error = hostFailed
    ? [authRaw, nginxRaw, nginxErrorRaw, firewallRaw, fail2banRaw, kernelRaw, systemRaw].join('\n').split('\n').find((line) => /__SECURITY_COMMAND_ERROR__/.test(line))?.replace('__SECURITY_COMMAND_ERROR__', '').trim()
    : undefined;
  const authAvailable = authRaw.trim().length > 0 && !commandFailed(authRaw);
  const nginxAvailable = nginxRaw.trim().length > 0 && !commandFailed(nginxRaw);
  const nginxErrorAvailable = nginxErrorRaw.trim().length > 0 && !commandFailed(nginxErrorRaw);
  const firewallAvailable = (firewallRaw.trim().length > 0 || firewall.length > 0) && !commandFailed(firewallRaw);
  const fail2banAvailable = fail2ban.available && !commandFailed(fail2banRaw);
  const kernelAvailable = kernelRaw.trim().length > 0 && !commandFailed(kernelRaw);
  const systemAvailable = systemRaw.trim().length > 0 && !commandFailed(systemRaw);

  const status: HostSecurityStatus = {
    id: host.id,
    label: host.label,
    reporting: authAvailable || nginxAvailable || firewallAvailable || fail2banAvailable,
    checkedAt,
    sources: {
      auth: authAvailable,
      nginx: nginxAvailable,
      nginxError: nginxErrorAvailable,
      firewall: firewallAvailable,
      fail2ban: fail2banAvailable,
      kernel: kernelAvailable,
      system: systemAvailable,
    },
    error,
  };

  const firewallTotal = firewallSplit.total ?? firewall.length;
  return { host: status, auth, nginx, nginxError, firewall, firewallTotal, firewallSampled: firewallTotal > firewall.length, fail2ban, kernel, system };
}

export async function collectSecurityData() {
  const checkedAt = new Date().toISOString();
  const hosts = getSecurityHosts();
  const results = await Promise.all(hosts.map(collectHost));
  const authEvents = results.flatMap((result) => result.auth).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const webEvents = results.flatMap((result) => result.nginx).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const nginxErrorEvents = results.flatMap((result) => result.nginxError).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const firewallEvents = results.flatMap((result) => result.firewall).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const kernelEvents = results.flatMap((result) => result.kernel).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const systemEvents = results.flatMap((result) => result.system).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const firewallTotal = results.reduce((sum, result) => sum + result.firewallTotal, 0);
  const firewallByHost: FirewallHostRollup[] = results
    .map((result) => ({
      key: result.host.id,
      label: result.host.label,
      count: result.firewallTotal,
      sampled: result.firewallSampled,
    }))
    .filter((host) => host.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const fail2banStates = results.map((result) => result.fail2ban);
  const fail2ban: Fail2BanState = {
    available: fail2banStates.some((state) => state.available),
    banned: fail2banStates.reduce((sum, state) => sum + state.banned, 0),
    totalFailed: fail2banStates.reduce((sum, state) => sum + state.totalFailed, 0),
    bannedIPs: [...new Set(fail2banStates.flatMap((state) => state.bannedIPs))],
  };
  const nginxErrors = webEvents.filter((event) => event.status >= 400);
  const authFailures = authEvents.filter((event) => event.type === 'auth-fail');
  const sshAccepts = authEvents.filter((event) => event.type === 'ssh-accept');
  const sudoEvents = authEvents.filter((event) => event.type === 'sudo');
  const hostSignals = [...nginxErrorEvents, ...kernelEvents, ...systemEvents].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const hostStatus = results.map((result) => result.host);

  return {
    ok: true,
    checkedAt,
    source: 'live-host-collector',
    hasThreats: fail2ban.banned > 0 || authFailures.length > 0 || nginxErrors.length > 0 || nginxErrorEvents.length > 0 || kernelEvents.length > 0 || systemEvents.length > 0 || firewallEvents.length > 0 || hostStatus.some((host) => !host.reporting),
    stale: false,
    hosts: hostStatus,
    registeredHosts: getRegisteredHostCoverage(hosts),
    fail2ban,
    nginx: {
      errorCount: nginxErrors.length,
      errorLogCount: nginxErrorEvents.length,
      recentErrors: nginxErrors.slice(0, EVIDENCE_LIMIT).map((event) => `${event.host} ${event.status} ${event.method} ${event.path} from ${event.ip}`),
      recentErrorLogs: nginxErrorEvents.slice(0, EVIDENCE_LIMIT).map(formatSignal),
      byHost: countByHost(nginxErrors, hostStatus),
      topSources: topValues(nginxErrors, (event) => event.ip),
      topPaths: topValues(nginxErrors, (event) => event.path),
      topStatuses: topValues(nginxErrors, (event) => String(event.status)),
    },
    auth: {
      failCount: authFailures.length,
      sshAcceptCount: sshAccepts.length,
      sudoCount: sudoEvents.length,
      recent: authFailures.slice(0, EVIDENCE_LIMIT).map((event) => `${event.host} ${event.user}: ${event.detail}`),
      recentAccepts: sshAccepts.slice(0, EVIDENCE_LIMIT).map((event) => `${event.host} ${event.user} from ${event.detail}`),
      recentSudo: sudoEvents.slice(0, EVIDENCE_LIMIT).map((event) => `${event.host} ${event.user}: ${event.detail}`),
      byHost: countByHost(authFailures, hostStatus),
      topUsers: topValues(authFailures, (event) => event.user),
    },
    firewall: {
      blockCount: firewallTotal,
      sampleCount: firewallEvents.length,
      sampleLimitPerHost: FIREWALL_SAMPLE_LIMIT,
      byHost: firewallByHost,
      topSources: topRollups(firewallEvents, (event) => event.src),
      topPorts: topRollups(firewallEvents, (event) => `${event.proto}/${event.dpt}`),
      recent: firewallEvents.slice(0, EVIDENCE_LIMIT).map((event) => `${event.host} ${event.proto} ${event.src} -> ${event.dst}:${event.dpt}`),
    },
    kernel: {
      issueCount: kernelEvents.length,
      criticalCount: kernelEvents.filter((event) => event.severity === 'critical').length,
      byHost: countByHost(kernelEvents, hostStatus),
      recent: kernelEvents.slice(0, EVIDENCE_LIMIT).map(formatSignal),
    },
    system: {
      issueCount: systemEvents.length,
      criticalCount: systemEvents.filter((event) => event.severity === 'critical').length,
      byHost: countByHost(systemEvents, hostStatus),
      recent: systemEvents.slice(0, EVIDENCE_LIMIT).map(formatSignal),
    },
    timeline: {
      recent: [...authFailures.map((event) => ({ ts: event.ts, line: `${event.host} auth-fail ${event.user}` })),
        ...nginxErrors.map((event) => ({ ts: event.ts, line: `${event.host} web-${event.status} ${event.path}` })),
        ...firewallEvents.map((event) => ({ ts: event.ts, line: `${event.host} firewall ${event.proto}/${event.dpt} from ${event.src}` })),
        ...hostSignals.map((event) => ({ ts: event.ts, line: formatSignal(event) }))]
        .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
        .slice(0, EVIDENCE_LIMIT)
        .map((event) => event.line),
    },
  };
}
