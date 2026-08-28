import { access, readFile } from 'node:fs/promises';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';

export type RecentItem = Record<string, unknown>;

const LOG_ROOTS = ['/host-logs', '/var/log'];
const PROD_SSH_HOST = process.env.PROD_SSH_HOST || '100.95.166.47';
const PROD_SSH_PORT = process.env.PROD_SSH_PORT || '2222';
const PROD_SSH_KEY = process.env.PROD_SSH_KEY || '/root/.ssh/prod_deploy_v3';
const execFileAsync = promisify(execFile);

export async function readFirstExisting(paths: string[]): Promise<string> {
  for (const p of paths) {
    try {
      return await readFile(p, 'utf-8');
    } catch {
      // continue
    }
  }
  return '';
}

export async function tailFirstExisting(paths: string[], lines = 2000): Promise<string> {
  for (const p of paths) {
    try {
      await access(p);
      const { stdout } = await execFileAsync('tail', ['-n', String(lines), p], {
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 1024 * 1024,
      });
      return stdout || '';
    } catch {
      // continue
    }
  }
  return '';
}

export async function readGlobbed(patterns: string[]): Promise<string> {
  for (const pattern of patterns) {
    try {
      const out = execSync(`sh -lc 'ls -1 ${escapeShell(pattern)} 2>/dev/null | head -20'`, { encoding: 'utf-8' });
      const files = out.split('\n').map((s) => s.trim()).filter(Boolean);
      for (const file of files) {
        try {
          return await readFile(file, 'utf-8');
        } catch {
          // continue
        }
      }
    } catch {
      // continue
    }
  }
  return '';
}

export function escapeShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function safeExec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}

export async function safeExecAsync(command: string, timeoutMs = 3000): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-lc', command], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return stdout || stderr || '';
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return `${err.stdout?.toString() || ''}${err.stderr?.toString() || ''}`;
  }
}

export async function runRemoteAsync(cmd: string, timeoutMs = 3000): Promise<string> {
  try {
    const { stdout } = await execFileAsync('ssh', [
      '-i', PROD_SSH_KEY,
      '-p', PROD_SSH_PORT,
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=2',
      `root@${PROD_SSH_HOST}`,
      'bash', '-lc', cmd,
    ], {
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    return stdout || '';
  } catch {
    return '';
  }
}

export function runRemote(cmd: string, timeoutMs = 3000): string {
  try {
    return execSync(
      `ssh -i ${escapeShell(PROD_SSH_KEY)} -p ${escapeShell(PROD_SSH_PORT)} -o BatchMode=yes -o ConnectTimeout=5 root@${escapeShell(PROD_SSH_HOST)} bash -lc ${escapeShell(cmd)}`,
      { timeout: timeoutMs, encoding: 'utf8' }
    );
  } catch {
    return '';
  }
}

export function jsonLinesTail(text: string, limit: number): string[] {
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(-limit);
}

export { LOG_ROOTS };
