#!/usr/bin/env bash
# run-iperf.sh — runs iperf3 tests from bazza to all nodes, writes iperf-results.json
# Run periodically (e.g. every 6 hours) via cron

set -euo pipefail

PROD_HOST="root@203.57.50.240"
PROD_PORT="2222"
PROD_KEY="/root/.ssh/prod_deploy_v3"
OUTPUT="/root/.openclaw/workspace/mission-control/iperf-results.json"
PROD_DEST="/var/www/mission-control/iperf-results.json"

declare -A NODES
NODES[prod]="100.95.166.47"
NODES[sec1]="100.122.8.93"
NODES[crm8]="100.112.179.70"
NODES[shazza]="100.113.217.81"
NODES[backup-melb]="100.110.100.97"

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

echo "Running iperf3 tests from bazza..."
RESULTS=""
for id in "${!NODES[@]}"; do
  ip="${NODES[$id]}"
  echo "  → $id ($ip)..."
  r=$(run_iperf "$id" "$ip")
  RESULTS="${RESULTS}${r},"
done

# Trim trailing comma
RESULTS="${RESULTS%,}"

# Write JSON
cat > "$OUTPUT" << JSONEOF
{
  "measuredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "testedFrom": "bazza",
  "results": [${RESULTS}]
}
JSONEOF

echo "iperf results written to $OUTPUT"

# Append results to network-history.db
DB="/root/.openclaw/workspace/mission-control/network-history.db"
if [ -f "$DB" ]; then
  python3 - "$OUTPUT" "$DB" <<'PYEOF'
import json, sqlite3, sys
from datetime import datetime, timezone

iperf_file, db_path = sys.argv[1], sys.argv[2]
with open(iperf_file) as f:
    data = json.load(f)

ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
con = sqlite3.connect(db_path)
cur = con.cursor()
rows = 0
for r in data.get("results", []):
    if r.get("status") != "ok":
        continue
    cur.execute(
        "INSERT INTO iperf_history (ts, node_id, mbps_send, mbps_recv, rtt_ms, retransmits) "
        "VALUES (?,?,?,?,?,?)",
        (ts, r["id"], r.get("mbpsSend"), r.get("mbpsRecv"), r.get("rttMs"), r.get("retransmits", 0)),
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
