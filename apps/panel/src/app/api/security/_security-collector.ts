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
    firewall: boolean;
    fail2ban: boolean;
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

type FirewallEvent = {
  ts: string;
  host: string;
  src: string;
  dst: string;
  dpt: string;
  proto: string;
};

type Fail2BanState = {
  available: boolean;
  banned: number;
  totalFailed: number;
  bannedIPs: string[];
};

const LOCAL_HOST: SecurityHostConfig = {
  id: process.env.SECURITY_LOCAL_HOST_ID || 'prod',
  label: process.env.SECURITY_LOCAL_HOST_LABEL || 'Prod / per-web',
  kind: 'local',
};

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
  return SYSTEM_REGISTRY.map((system) => ({
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

function parseFail2Ban(raw: string): Fail2BanState {
  const available = /Status for the jail|Currently banned|Total failed/i.test(raw);
  const banned = Number(raw.match(/Currently banned:\s*(\d+)/i)?.[1] || 0);
  const totalFailed = Number(raw.match(/Total failed:\s*(\d+)/i)?.[1] || 0);
  const bannedIPs = (raw.match(/Banned IP list:\s*(.*)/i)?.[1] || '')
    .split(/\s+/)
    .map((ip) => ip.trim())
    .filter(Boolean);
  return { available, banned, totalFailed, bannedIPs };
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

async function readLocalFirewall() {
  const file = await readFirstExisting(['/host-logs/kern.log', '/host-logs/syslog', '/var/log/kern.log', '/var/log/syslog']);
  if (file) return file.split('\n').filter((line) => line.includes('UFW BLOCK')).slice(-500).join('\n');
  return safeExec('journalctl -k --since "24 hours ago" --no-pager 2>/dev/null | grep "UFW BLOCK" | tail -500 || true');
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
  const firewallRaw = host.kind === 'local'
    ? await readLocalFirewall()
    : runHostCommand(host, 'journalctl -k --since "24 hours ago" --no-pager 2>/dev/null | grep "UFW BLOCK" | tail -500 || true');
  const fail2banRaw = runHostCommand(host, 'fail2ban-client status sshd 2>/dev/null || fail2ban-client status ssh 2>/dev/null || true');

  const auth = authRaw.split('\n').map((line) => parseAuthLine(line, host.id)).filter((event): event is AuthEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const nginx = nginxRaw.split('\n').map((line) => parseNginxLine(line, host.id)).filter((event): event is WebEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const firewall = firewallRaw.split('\n').map((line) => parseFirewallLine(line, host.id)).filter((event): event is FirewallEvent => Boolean(event)).filter((event) => +new Date(event.ts) >= cutoff);
  const fail2ban = parseFail2Ban(fail2banRaw);
  const hostFailed = commandFailed(authRaw) && commandFailed(firewallRaw) && commandFailed(fail2banRaw);
  const error = hostFailed
    ? [authRaw, nginxRaw, firewallRaw, fail2banRaw].join('\n').split('\n').find((line) => /__SECURITY_COMMAND_ERROR__/.test(line))?.replace('__SECURITY_COMMAND_ERROR__', '').trim()
    : undefined;
  const authAvailable = authRaw.trim().length > 0 && !commandFailed(authRaw);
  const nginxAvailable = nginxRaw.trim().length > 0 && !commandFailed(nginxRaw);
  const firewallAvailable = (firewallRaw.trim().length > 0 || firewall.length > 0) && !commandFailed(firewallRaw);
  const fail2banAvailable = fail2ban.available && !commandFailed(fail2banRaw);

  const status: HostSecurityStatus = {
    id: host.id,
    label: host.label,
    reporting: authAvailable || nginxAvailable || firewallAvailable || fail2banAvailable,
    checkedAt,
    sources: {
      auth: authAvailable,
      nginx: nginxAvailable,
      firewall: firewallAvailable,
      fail2ban: fail2banAvailable,
    },
    error,
  };

  return { host: status, auth, nginx, firewall, fail2ban };
}

export async function collectSecurityData() {
  const checkedAt = new Date().toISOString();
  const hosts = getSecurityHosts();
  const results = await Promise.all(hosts.map(collectHost));
  const authEvents = results.flatMap((result) => result.auth).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const webEvents = results.flatMap((result) => result.nginx).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const firewallEvents = results.flatMap((result) => result.firewall).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const fail2banStates = results.map((result) => result.fail2ban);
  const fail2ban: Fail2BanState = {
    available: fail2banStates.some((state) => state.available),
    banned: fail2banStates.reduce((sum, state) => sum + state.banned, 0),
    totalFailed: fail2banStates.reduce((sum, state) => sum + state.totalFailed, 0),
    bannedIPs: [...new Set(fail2banStates.flatMap((state) => state.bannedIPs))],
  };
  const nginxErrors = webEvents.filter((event) => event.status >= 400);
  const authFailures = authEvents.filter((event) => event.type === 'auth-fail');
  const hostStatus = results.map((result) => result.host);

  return {
    ok: true,
    checkedAt,
    source: 'live-host-collector',
    hasThreats: fail2ban.banned > 0 || authFailures.length > 0 || nginxErrors.length > 0 || firewallEvents.length > 0 || hostStatus.some((host) => !host.reporting),
    stale: false,
    hosts: hostStatus,
    registeredHosts: getRegisteredHostCoverage(hosts),
    fail2ban,
    nginx: {
      errorCount: nginxErrors.length,
      recentErrors: nginxErrors.slice(0, 25).map((event) => `${event.host} ${event.status} ${event.method} ${event.path} from ${event.ip}`),
    },
    auth: {
      failCount: authFailures.length,
      sshAcceptCount: authEvents.filter((event) => event.type === 'ssh-accept').length,
      sudoCount: authEvents.filter((event) => event.type === 'sudo').length,
      recent: authFailures.slice(0, 25).map((event) => `${event.host} ${event.user}: ${event.detail}`),
    },
    firewall: {
      blockCount: firewallEvents.length,
      recent: firewallEvents.slice(0, 25).map((event) => `${event.host} ${event.proto} ${event.src} -> ${event.dst}:${event.dpt}`),
    },
  };
}
