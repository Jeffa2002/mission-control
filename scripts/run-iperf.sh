#!/usr/bin/env bash
# run-iperf.sh — runs iperf3 tests from bazza to all nodes, writes iperf-results.json
# Run periodically (e.g. every 6 hours) via cron

set -euo pipefail

TARGET_NODE="${1:-all}"
LOCK_FILE="/tmp/mission-control-iperf.lock"

PROD_HOST="root@100.95.166.47"
PROD_PORT="2222"
PROD_KEY="/root/.ssh/prod_deploy_v3"
OUTPUT="/root/.openclaw/workspace/mission-control/iperf-results.json"
PROD_DEST="/var/www/mission-control/iperf-results.json"

declare -A NODES
NODES[prod]="100.95.166.47"
NODES[sec1]="100.122.8.93"
NODES[secspy-lab01]="100.87.75.20"
NODES[crm8]="100.112.179.70"
NODES[shazza]="100.113.217.81"
NODES[backup-melb]="100.110.100.97"

if [[ "$TARGET_NODE" != "all" && -z "${NODES[$TARGET_NODE]:-}" ]]; then
  echo "Unknown iperf node: $TARGET_NODE" >&2
  exit 2
fi

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another iperf collection is already running" >&2; exit 0; }

run_iperf() {
  local id="$1"
  local ip="$2"
  # Run iperf3 client for 5 seconds, JSON output
  local result
  result=$(iperf3 -c "$ip" -t 5 -J 2>/dev/null) || { echo "{\"id\":\"$id\",\"status\":\"error\"}"; return; }

  local send recv rtt retransmits
  send=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(round(d['end']['sum_sent']['bits_per_second']/1e6,2))" 2>/dev/null || echo "0")
  recv=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(round(d['end']['sum_received']['bits_per_second']/1e6,2))" 2>/dev/null || echo "0")
  rtt=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(round(d['end']['streams'][0]['sender']['mean_rtt']/1000,2))" 2>/dev/null || echo "0")
  retransmits=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['end']['sum_sent'].get('retransmits',0))" 2>/dev/null || echo "0")

  echo "{\"id\":\"$id\",\"status\":\"ok\",\"mbpsSend\":$send,\"mbpsRecv\":$recv,\"rttMs\":$rtt,\"retransmits\":$retransmits}"
}

echo "Running iperf3 tests from bazza (target: $TARGET_NODE)..."
RESULTS=""
for id in "${!NODES[@]}"; do
  [[ "$TARGET_NODE" == "all" || "$TARGET_NODE" == "$id" ]] || continue
  ip="${NODES[$id]}"
  echo "  → $id ($ip)..."
  r=$(run_iperf "$id" "$ip")
  RESULTS="${RESULTS}${r},"
done

# Merge this run into the existing snapshot so staggered tests retain the
# latest measurement for every node. Each result carries its own timestamp.
RESULTS="${RESULTS%,}"
python3 - "$OUTPUT" "$RESULTS" <<'PYEOF'
import json, os, sys, tempfile
from datetime import datetime, timezone

output, raw_results = sys.argv[1], sys.argv[2]
measured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
current = {"testedFrom": "bazza", "results": []}
try:
    with open(output) as f:
        current = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    pass

incoming = json.loads(f"[{raw_results}]")
by_id = {row.get("id"): row for row in current.get("results", []) if row.get("id")}
for row in incoming:
    row["measuredAt"] = measured_at
    by_id[row["id"]] = row

snapshot = {
    "measuredAt": measured_at,
    "testedFrom": "bazza",
    "results": sorted(by_id.values(), key=lambda row: row["id"]),
}
directory = os.path.dirname(output)
fd, tmp = tempfile.mkstemp(prefix=".iperf-results-", dir=directory, text=True)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(snapshot, f, indent=2)
        f.write("\n")
    os.replace(tmp, output)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
PYEOF

echo "iperf results written to $OUTPUT"

# Append results to network-history.db
DB="/root/.openclaw/workspace/mission-control/network-history.db"
if [ -f "$DB" ]; then
  python3 - "$OUTPUT" "$DB" "$TARGET_NODE" <<'PYEOF'
import json, sqlite3, sys
from datetime import datetime, timezone

iperf_file, db_path, target_node = sys.argv[1], sys.argv[2], sys.argv[3]
with open(iperf_file) as f:
    data = json.load(f)

ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
con = sqlite3.connect(db_path)
cur = con.cursor()
rows = 0
for r in data.get("results", []):
    if target_node != "all" and r.get("id") != target_node:
        continue
    if r.get("status") != "ok":
        continue
    cur.execute(
        "INSERT INTO iperf_history (ts, node_id, mbps_send, mbps_recv, rtt_ms, retransmits) "
        "VALUES (?,?,?,?,?,?)",
        (r.get("measuredAt", ts), r["id"], r.get("mbpsSend"), r.get("mbpsRecv"), r.get("rttMs"), r.get("retransmits", 0)),
    )
    rows += 1
con.commit()
con.close()
print(f"Appended {rows} iperf rows to {db_path}")
PYEOF
  echo "iperf history updated"
else
  echo "network-history.db not found, skipping history append"
fi

# Copy to prod container-accessible path
scp -i "$PROD_KEY" -P "$PROD_PORT" -o StrictHostKeyChecking=no \
    "$OUTPUT" \
    "${PROD_HOST}:${PROD_DEST}" 2>/dev/null && echo "Synced to prod" || echo "Sync failed (non-fatal)"
