import { chmod, rename, writeFile } from 'node:fs/promises';
import { loadUsage } from './usage-model.ts';

const output = process.env.USAGE_TELEMETRY_OUTPUT || '/runtime/token-usage.json';
const temporary = `${output}.tmp`;
let running = false;

async function collect() {
  if (running) return;
  running = true;
  try {
    const ranges = {};
    for (const range of ['7d', '30d', '90d', 'all']) ranges[range] = await loadUsage(range);
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), ranges }));
    await chmod(temporary, 0o644);
    await rename(temporary, output);
  } catch (error) {
    console.error('usage collector failed:', error instanceof Error ? error.message : String(error));
  } finally { running = false; }
}

await collect();
setInterval(collect, 15_000);
