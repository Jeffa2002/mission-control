export type BillingDay = { id: string; actualCost: number };
export type BillingLineItem = { id: string; actualCost: number };
export type BillingSnapshot = {
  ok: true;
  generatedAt: string;
  currency: 'USD';
  timezone: 'UTC';
  days: BillingDay[];
  lineItems: BillingLineItem[];
};

type CostResult = { amount?: { value?: string; currency?: string }; line_item?: string | null };
type CostBucket = { start_time?: number; results?: CostResult[] };
type CostPage = { data?: CostBucket[]; has_more?: boolean; next_page?: string | null };

export function summarizeCostPages(pages: CostPage[], generatedAt = new Date().toISOString()): BillingSnapshot {
  const days = new Map<string, number>();
  const lineItems = new Map<string, number>();
  for (const page of pages) for (const bucket of page.data ?? []) {
    const id = new Date(Number(bucket.start_time) * 1000).toISOString().slice(0, 10);
    let dayCost = 0;
    for (const result of bucket.results ?? []) {
      const value = Number(result.amount?.value ?? 0);
      if (!Number.isFinite(value)) continue;
      dayCost += value;
      const lineItem = result.line_item || 'Other';
      lineItems.set(lineItem, (lineItems.get(lineItem) ?? 0) + value);
    }
    days.set(id, (days.get(id) ?? 0) + dayCost);
  }
  return {
    ok: true, generatedAt, currency: 'USD', timezone: 'UTC',
    days: [...days].map(([id, actualCost]) => ({ id, actualCost })).sort((a, b) => a.id.localeCompare(b.id)),
    lineItems: [...lineItems].map(([id, actualCost]) => ({ id, actualCost })).sort((a, b) => b.actualCost - a.actualCost),
  };
}

export async function fetchOpenAiBilling(apiKey: string, startTime: number, endTime = Math.floor(Date.now() / 1000)): Promise<BillingSnapshot> {
  const pages: CostPage[] = [];
  // The Costs API continuation token is brittle when grouped queries span more than
  // one page. Fixed 31-day windows are deterministic and avoid token replay entirely.
  for (let windowStart = startTime; windowStart < endTime; windowStart += 31 * 86_400) {
    const windowEnd = Math.min(endTime, windowStart + 31 * 86_400);
    const query = new URLSearchParams({ start_time: String(windowStart), end_time: String(windowEnd), bucket_width: '1d', limit: '31' });
    query.append('group_by', 'project_id');
    query.append('group_by', 'line_item');
    const response = await fetch(`https://api.openai.com/v1/organization/costs?${query}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(`OpenAI Costs API returned ${response.status}: ${detail?.error?.message ?? 'unknown error'}`);
    }
    const body = await response.json() as CostPage;
    pages.push(body);
  }
  return summarizeCostPages(pages);
}

export function billingForRange(snapshot: BillingSnapshot, range: string, now = Date.now()) {
  const span = range === 'all' ? Infinity : Number(range.slice(0, -1)) * 86_400_000;
  const cutoff = now - span;
  const days = snapshot.days.filter(day => Date.parse(`${day.id}T23:59:59Z`) >= cutoff);
  const actualCost = days.reduce((sum, day) => sum + day.actualCost, 0);
  return { ...snapshot, days, actualCost, coverageStart: snapshot.days[0]?.id ?? null };
}
