import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

export type RecentItem = Record<string, unknown>;

const LOG_ROOTS = ['/host-logs', '/var/log'];

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

export function runRemote(cmd: string): string {
  try {
    return execSync(
      `ssh -i /root/.ssh/prod_deploy_v3 -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@203.57.50.240 bash -lc ${escapeShell(cmd)}`,
      { timeout: 10000, encoding: 'utf8' }
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
