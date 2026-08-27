/**
 * Pure aggregation model for the /api/overview endpoint.
 *
 * Takes the settled results of the upstream telemetry fetches and shapes them
 * into the overview brief payload. A failed source keeps its previous value on
 * the client (the route returns null for it) and is listed in `failures` so
 * the UI can show honest partial-data state.
 */

export type SettledSource = [
  key: string,
  result: PromiseSettledResult<unknown>,
];

const ARRAY_SOURCES: Record<string, (value: any) => unknown[]> = {
  agents: (v) => v?.agents ?? [],
  apps: (v) => v?.apps ?? [],
  deploys: (v) => v?.deploys ?? [],
  activity: (v) => v?.items ?? [],
  alerts: (v) => v?.data?.alerts ?? [],
};

export function aggregateOverview(settled: SettledSource[]): {
  data: Record<string, unknown | null>;
  failures: string[];
} {
  const data: Record<string, unknown | null> = {};
  const failures: string[] = [];

  for (const [key, result] of settled) {
    if (result.status === 'rejected') {
      failures.push(
        `${key}: ${
          result.reason instanceof Error ? result.reason.message : 'request failed'
        }`,
      );
      data[key] = null;
      continue;
    }
    const value = result.value;
    const extract = ARRAY_SOURCES[key];
    data[key] = extract ? extract(value) : value ?? null;
  }

  return { data, failures };
}
