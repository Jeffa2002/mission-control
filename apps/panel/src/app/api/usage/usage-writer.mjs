import { chmod, rename, writeFile } from 'node:fs/promises';
import { loadUsage } from './usage-model.ts';
import { billingForRange, fetchAnthropicBilling, fetchOpenAiBilling } from './billing-model.ts';

const output = process.env.USAGE_TELEMETRY_OUTPUT || '/runtime/token-usage.json';
const temporary = `${output}.tmp`;
let running = false;
let billing = null;
let billingFetchedAt = 0;
let anthropicBilling = null;
let anthropicBillingFetchedAt = 0;

async function loadBilling() {
  const apiKey = process.env.OPENAI_ADMIN_KEY;
  if (!apiKey) return null;
  if (billing && Date.now() - billingFetchedAt < 300_000) return billing;
  billing = await fetchOpenAiBilling(apiKey, Number(process.env.OPENAI_BILLING_START_TIME || 1780272000));
  billingFetchedAt = Date.now();
  return billing;
}

async function loadAnthropicBilling() {
  const apiKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!apiKey) return null;
  if (anthropicBilling && Date.now() - anthropicBillingFetchedAt < 300_000) return anthropicBilling;
  anthropicBilling = await fetchAnthropicBilling(apiKey, Number(process.env.ANTHROPIC_BILLING_START_TIME || 1780272000));
  anthropicBillingFetchedAt = Date.now();
  return anthropicBilling;
}

async function collect() {
  if (running) return;
  running = true;
  try {
    const ranges = {};
    for (const range of ['1h', '24h', '7d', '30d', '90d', 'all']) ranges[range] = await loadUsage(range);
    try {
      const currentBilling = await loadBilling();
      if (currentBilling) for (const range of Object.keys(ranges)) if (!range.endsWith('h')) ranges[range].billing = billingForRange(currentBilling, range);
    } catch (error) {
      console.error('billing collector failed:', error instanceof Error ? error.message : String(error));
    }
    try {
      const currentBilling = await loadAnthropicBilling();
      if (currentBilling) for (const range of Object.keys(ranges)) if (!range.endsWith('h')) ranges[range].anthropicBilling = billingForRange(currentBilling, range);
    } catch (error) {
      console.error('Anthropic billing collector failed:', error instanceof Error ? error.message : String(error));
    }
    await writeFile(temporary, JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), ranges }));
    await chmod(temporary, 0o644);
    await rename(temporary, output);
  } catch (error) {
    console.error('usage collector failed:', error instanceof Error ? error.message : String(error));
  } finally { running = false; }
}

await collect();
setInterval(collect, 15_000);
