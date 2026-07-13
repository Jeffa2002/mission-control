import { sh } from './_util';

export type SystemProbeKind = 'http-json' | 'command';
export type SystemProbeName = 'local' | 'tailnet' | 'public';

export type SystemDefinition = {
  id: string;
  label: string;
  host: string;
  role: string;
  probe: SystemProbeName;
  kind: SystemProbeKind;
  timeoutMs: number;
  url?: string;
  command?: {
    bin: string;
    args: string[];
  };
  envUrl?: string;
  okField?: string;
  metadata?: Record<string, string>;
};

export type SystemHealthResult = {
  id: string;
  label: string;
  host: string;
  role: string;
  probe: SystemProbeName;
  reachable: boolean;
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  data?: any;
  error?: string;
  metadata?: Record<string, string>;
};

export const SYSTEM_REGISTRY: SystemDefinition[] = [
  {
    id: 'bazza',
    label: 'Bazza',
    host: 'bazza.taile9fed9.ts.net',
    role: 'OpenClaw host',
    probe: 'local',
    kind: 'command',
    timeoutMs: 8_000,
    command: { bin: 'docker', args: ['info', '--format', '{{json .}}'] },
    metadata: { tailscaleIp: '100.125.171.52' },
  },
  {
    id: 'crm8',
    label: 'CRM8',
    host: '100.112.179.70',
    role: 'CRM application host',
    probe: 'tailnet',
    kind: 'http-json',
    timeoutMs: 8_000,
    envUrl: 'CRM8_HEALTH_URL',
    url: 'http://100.112.179.70:8080/api/health',
    okField: 'ok',
    metadata: { publicHost: 'crm8.effectx.com.au', tailscaleIp: '100.112.179.70' },
  },
  {
    id: 'secspy-lab01',
    label: 'SecSpy Lab 01',
    host: 'secspy-lab01.taile9fed9.ts.net',
    role: 'Isolated security assessment lab',
    probe: 'tailnet',
    kind: 'command',
    timeoutMs: 8_000,
    command: { bin: 'ping', args: ['-c', '1', '-W', '2', '100.87.75.20'] },
    metadata: { tailscaleIp: '100.87.75.20', hypervisor: 'pve', vmId: '106' },
  },
  {
    id: 'shazza',
    label: 'Shazza (Intel NUC u9-285H)',
    host: 'shazza.taile9fed9.ts.net',
    role: 'AI workstation',
    probe: 'tailnet',
    kind: 'http-json',
    timeoutMs: 8_000,
    envUrl: 'SHAZZA_HEALTH_URL',
    url: 'https://shazza.taile9fed9.ts.net/health',
    metadata: { tailscaleIp: '100.113.217.81' },
  },
];

export function getSystemDefinition(id: string) {
  return SYSTEM_REGISTRY.find((system) => system.id === id);
}

function isOkPayload(data: any, okField?: string) {
  if (!okField) return true;
  return Boolean(data?.[okField]);
}

function sanitizeSystemPayload(system: SystemDefinition, data: any) {
  if (system.id !== 'shazza' || !data?.services?.llamaServer) return data;

  const services = { ...data.services };
  delete services.llamaServer;
  return {
    ...data,
    services,
  };
}

export async function probeSystemHealth(system: SystemDefinition): Promise<SystemHealthResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    if (system.kind === 'http-json') {
      const url = system.envUrl ? process.env[system.envUrl] || system.url : system.url;
      if (!url) throw new Error('missing health URL');

      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(system.timeoutMs),
      });

      if (!res.ok) {
        const isAuthError = res.status === 401 || res.status === 403;
        throw new Error(isAuthError ? `Auth error (${res.status})` : `Health check failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      const ok = isOkPayload(data, system.okField);
      const sanitizedData = sanitizeSystemPayload(system, data);
      return {
        ...system,
        reachable: true,
        ok,
        checkedAt,
        latencyMs: Date.now() - startedAt,
        data: sanitizedData,
        error: ok ? undefined : `${system.okField || 'health'} did not report ok`,
      };
    }

    if (!system.command) throw new Error('missing command probe');
    const raw = await sh(system.command.bin, system.command.args, { timeoutMs: system.timeoutMs });
    let data: any = { output: raw };
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {}

    return {
      ...system,
      reachable: true,
      ok: true,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      data,
    };
  } catch (err: any) {
    return {
      ...system,
      reachable: false,
      ok: false,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      error: String(err?.message || err),
    };
  }
}

export async function probeAllSystems() {
  return Promise.all(SYSTEM_REGISTRY.map((system) => probeSystemHealth(system)));
}
