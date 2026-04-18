/**
 * GET /api/shazza
 *
 * Live health check for Shazza (Intel NUC u9-285H) via SSH over Tailscale.
 * Returns service status, uptime, GPU info, llama-server status, disk/memory.
 */
import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SSH_ARGS = [
  '-i', '/root/.ssh/prod_deploy_v3',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=6',
  '-o', 'BatchMode=yes',
  'jeffa@100.113.217.81',
];

async function sshRun(cmd: string): Promise<string> {
  const { stdout } = await execFileAsync('ssh', [...SSH_ARGS, cmd], { timeout: 10_000 });
  return stdout.trim();
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();

  try {
    // Run multiple checks in parallel
    const [
      uptimeRaw,
      llamaStatus,
      memRaw,
      diskRaw,
      gpuRaw,
      tempRaw,
    ] = await Promise.allSettled([
      sshRun('uptime -p && uptime -s'),
      sshRun('systemctl is-active llama-server.service 2>/dev/null && systemctl show llama-server.service --property=ActiveEnterTimestamp 2>/dev/null || echo inactive'),
      sshRun("free -m | awk '/^Mem:/{print $2,$3,$4}'"),
      sshRun("df -h / | awk 'NR==2{print $2,$3,$4,$5}'"),
      sshRun("cat /proc/driver/i915/clients/total_vram_used 2>/dev/null || sycl-ls 2>/dev/null | grep -c level_zero || echo 'unavailable'"),
      sshRun("cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | awk '{print $1/1000}' | sort -rn | head -1 || echo 'N/A'"),
    ]);

    const uptime = uptimeRaw.status === 'fulfilled' ? uptimeRaw.value : null;
    const llama = llamaStatus.status === 'fulfilled' ? llamaStatus.value : null;
    const mem = memRaw.status === 'fulfilled' ? memRaw.value : null;
    const disk = diskRaw.status === 'fulfilled' ? diskRaw.value : null;
    const gpu = gpuRaw.status === 'fulfilled' ? gpuRaw.value : null;
    const temp = tempRaw.status === 'fulfilled' ? tempRaw.value : null;

    // Parse memory
    let memStats: { totalMb: number; usedMb: number; freeMb: number; pct: number } | null = null;
    if (mem) {
      const [total, used, free] = mem.split(' ').map(Number);
      if (!isNaN(total) && total > 0) {
        memStats = { totalMb: total, usedMb: used, freeMb: free, pct: Math.round((used / total) * 100) };
      }
    }

    // Parse disk
    let diskStats: { total: string; used: string; free: string; pct: string } | null = null;
    if (disk) {
      const [total, used, free, pct] = disk.split(' ');
      diskStats = { total, used, free, pct };
    }

    // Parse uptime
    const uptimeLines = uptime?.split('\n') || [];
    const uptimePretty = uptimeLines[0] || null;
    const uptimeSince = uptimeLines[1] || null;

    // Llama server status
    const llamaActive = llama?.startsWith('active') ?? false;
    const llamaSince = llama?.includes('ActiveEnterTimestamp=')
      ? llama.split('ActiveEnterTimestamp=')[1]?.split('\n')[0]?.trim()
      : null;

    const reachable = true;

    return NextResponse.json({
      ok: true,
      reachable,
      host: 'shazza',
      label: 'Shazza (Intel NUC u9-285H)',
      tailscaleIp: '100.113.217.81',
      uptime: { pretty: uptimePretty, since: uptimeSince },
      services: {
        llamaServer: {
          active: llamaActive,
          since: llamaSince,
          label: 'llama-server (SYCL)',
        },
      },
      memory: memStats,
      disk: diskStats,
      gpu: {
        raw: gpu,
        label: 'Intel Arc (ARL) — 23GB VRAM',
      },
      temperature: temp ? { celsius: parseFloat(temp), raw: temp } : null,
      checkedAt,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      host: 'shazza',
      label: 'Shazza (Intel NUC u9-285H)',
      tailscaleIp: '100.113.217.81',
      error: String(err?.message || err),
      checkedAt,
    });
  }
}
