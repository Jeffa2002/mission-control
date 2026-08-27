#!/usr/bin/env bash
# sync-agent-data.sh - runs on bazza, syncs agent status + sessions to prod
# Called once per minute by the installed cron schedule.

set -euo pipefail

exec 9>/tmp/mission-control-agent-sync.lock
flock -n 9 || exit 0

LOG=/tmp/agent-sync.log

# Keep the cron log bounded (it reached 3.7MB during the Aug 10-27 failure loop).
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 1048576 ]; then
  tail -n 500 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

AGENTS_DIR="/root/.openclaw/agents"
PROD_HOST="root@100.95.166.47"
PROD_PORT="2222"
PROD_KEY="/root/.ssh/prod_deploy_v3"
CONTROL_PATH="/tmp/mission-control-telemetry-%C"
SSH_OPTIONS=(-i "$PROD_KEY" -p "$PROD_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ControlMaster=auto -o ControlPersist=120 -o "ControlPath=$CONTROL_PATH")
SCP_OPTIONS=(-i "$PROD_KEY" -P "$PROD_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ControlMaster=auto -o ControlPersist=120 -o "ControlPath=$CONTROL_PATH")
RSYNC_SSH="ssh -i $PROD_KEY -p $PROD_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o ControlMaster=auto -o ControlPersist=120 -o ControlPath=$CONTROL_PATH"
PROD_AGENT_DATA="/root/.openclaw/agents"
STATUS_FILE="/tmp/agent-status.json"
WORKSPACE_STATUS="/root/.openclaw/workspace/agent-status.json"
MISSION_STATUS="/root/.openclaw/workspace/mission-control/agent-status.json"
MISSION_SECURITY="/root/.openclaw/workspace/mission-control/security-data.json"

# ── 1. Build an allowlisted snapshot from supported OpenClaw metadata only ────
# Non-fatal: agent metadata must never block the rest of the telemetry sync.
# (A hard failure here froze ALL downstream telemetry for 17 days, 2026-08-10..27.)
if python3 "$(dirname "$0")/collect-agent-observability.py" --output "$STATUS_FILE"; then
  cp "$STATUS_FILE" "$WORKSPACE_STATUS"
  cp "$STATUS_FILE" "$MISSION_STATUS"
else
  echo "WARNING: agent snapshot failed; continuing with remaining telemetry" >&2
fi

# ── 2. Rsync session files to prod (fast incremental, skip deleted/reset) ─────
rsync -az --delete \
    -e "$RSYNC_SSH" \
    --exclude="*.reset.*" \
    --exclude="*.deleted.*" \
    --exclude="*.sqlite" \
    --exclude="*.sqlite-wal" \
    --exclude="*.sqlite-shm" \
    --exclude="cache/" \
    --exclude="shell_snapshots/" \
    --exclude="models_cache.json" \
    --exclude="agent-status.json" \
    --exclude="iperf-results.json" \
    --exclude="network-history.db" \
    "$AGENTS_DIR/" \
    "${PROD_HOST}:${PROD_AGENT_DATA}/" 2>>"$LOG" \
  || echo "WARN: agents-dir rsync failed at $(date)"

# ── 4. Write status JSON after rsync (so --delete doesn't wipe it) ────────────
# Land as a temp file, then chown/chmod so the non-root panel container (uid 100,
# gid 101) can read it, then atomically move into place.
if scp "${SCP_OPTIONS[@]}" \
    "$STATUS_FILE" \
    "${PROD_HOST}:${PROD_AGENT_DATA}/agent-status.json.tmp" 2>>"$LOG" \
  && ssh "${SSH_OPTIONS[@]}" "$PROD_HOST" \
    "chown 100:101 '${PROD_AGENT_DATA}/agent-status.json.tmp'; chmod 640 '${PROD_AGENT_DATA}/agent-status.json.tmp'; mv '${PROD_AGENT_DATA}/agent-status.json.tmp' '${PROD_AGENT_DATA}/agent-status.json'" 2>>"$LOG"; then
  :
else
  echo "WARN: agent-status.json transfer failed at $(date)"
fi

# ── 5. Sync iperf-results.json to prod agents dir ──────────────────────────────
IPERF_SRC="/root/.openclaw/workspace/mission-control/iperf-results.json"
if [ -f "$IPERF_SRC" ]; then
  scp "${SCP_OPTIONS[@]}" \
      "$IPERF_SRC" \
      "${PROD_HOST}:${PROD_AGENT_DATA}/iperf-results.json" 2>>"$LOG" \
    || echo "WARN: iperf-results.json transfer failed at $(date)"
fi

# ── 6b. Collect ping history and append to network-history.db ────────────────
DB="/root/.openclaw/workspace/mission-control/network-history.db"
if [ -f "$DB" ]; then
  python3 - <<'PINGEOF'
import subprocess, sqlite3, time
from datetime import datetime, timezone, timedelta

NODES = {
    "prod":        "100.95.166.47",
    "sec1":        "100.122.8.93",
    "secspy-lab01":"100.87.75.20",
    "crm8":        "100.112.179.70",
    "shazza":      "100.113.217.81",
    "backup-melb": "100.110.100.97",
    "bazza":       "127.0.0.1",
}

def ping(ip):
    try:
        out = subprocess.check_output(
            ["ping", "-c", "3", "-W", "1", "-q", ip],
            stderr=subprocess.DEVNULL, timeout=8
        ).decode()
        import re
        latency = re.search(r"= [\d.]+/([\d.]+)/", out)
        loss = re.search(r"([\d.]+)% packet loss", out)
        return (float(latency.group(1)) if latency else None,
                float(loss.group(1)) if loss else 100.0)
    except Exception:
        return None, 100.0

ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
con = sqlite3.connect("/root/.openclaw/workspace/mission-control/network-history.db", timeout=30)
cur = con.cursor()
cur.execute("PRAGMA busy_timeout=30000")
cur.execute("""CREATE TABLE IF NOT EXISTS ping_hourly (
  bucket TEXT NOT NULL, node_id TEXT NOT NULL, ping_avg REAL, ping_min REAL,
  ping_max REAL, packet_loss_avg REAL NOT NULL DEFAULT 0,
  availability_pct REAL NOT NULL DEFAULT 100, samples INTEGER NOT NULL,
  PRIMARY KEY (bucket, node_id))""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_ping_hourly_node ON ping_hourly(node_id, bucket)")
columns = {row[1] for row in cur.execute("PRAGMA table_info(ping_history)")}
if "reachable" not in columns:
    cur.execute("ALTER TABLE ping_history ADD COLUMN reachable INTEGER NOT NULL DEFAULT 1")
if "packet_loss" not in columns:
    cur.execute("ALTER TABLE ping_history ADD COLUMN packet_loss REAL NOT NULL DEFAULT 0")
rows = 0
for node_id, ip in NODES.items():
    ms, loss = ping(ip)
    cur.execute(
        "INSERT INTO ping_history (ts, node_id, ping_ms, reachable, packet_loss) VALUES (?,?,?,?,?)",
        (ts, node_id, ms, 1 if ms is not None else 0, loss),
    )
    rows += 1

if int(time.strftime("%M")) % 10 == 0:
    current_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
    last_bucket = cur.execute("SELECT MAX(bucket) FROM ping_hourly").fetchone()[0]
    where = "ts < ?" if not last_bucket else "ts >= ? AND ts < ?"
    params = (current_hour,) if not last_bucket else (last_bucket, current_hour)
    cur.execute(f"""INSERT OR REPLACE INTO ping_hourly
      (bucket,node_id,ping_avg,ping_min,ping_max,packet_loss_avg,availability_pct,samples)
      SELECT strftime('%Y-%m-%dT%H:00:00Z',ts), node_id,
             ROUND(AVG(ping_ms),2), ROUND(MIN(ping_ms),2), ROUND(MAX(ping_ms),2),
             ROUND(AVG(packet_loss),2), ROUND(AVG(reachable)*100,2), COUNT(*)
      FROM ping_history WHERE {where}
      GROUP BY strftime('%Y-%m-%dT%H:00:00Z',ts), node_id""", params)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    cur.execute("DELETE FROM ping_history WHERE ts < ?", (cutoff,))
con.commit()
con.close()
print(f"Ping: {rows} rows recorded")
PINGEOF
fi

# ── 6c. Snapshot and atomically sync network-history.db to prod ──────────────
if [ -f "$DB" ] && [ $((10#$(date +%M) % 10)) -eq 0 ]; then
  SNAPSHOT=$(mktemp /tmp/network-history.XXXXXX.db)
  python3 - "$DB" "$SNAPSHOT" <<'SNAPEOF'
import os, sqlite3, sys
source, destination = sys.argv[1], sys.argv[2]
with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
    src.backup(dst)
os.chmod(destination, 0o644)
SNAPEOF
  rsync -az \
      -e "$RSYNC_SSH" \
      "$SNAPSHOT" \
      "${PROD_HOST}:${PROD_AGENT_DATA}/network-history.db" 2>>"$LOG" \
    || echo "WARN: network-history.db transfer failed at $(date)"
  rm -f "$SNAPSHOT"
fi

# ── 6. Collect real security data from prod and sync ──────────────────────────
python3 - <<'SECEOF'
import subprocess, json, re
from datetime import datetime, timezone

SSH = ["ssh", "-i", "/root/.ssh/prod_deploy_v3", "-p", "2222",
       "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
       "-o", "ControlMaster=auto", "-o", "ControlPersist=120",
       "-o", "ControlPath=/tmp/mission-control-telemetry-%C",
       "root@100.95.166.47"]

def run(cmd):
    try:
        result = subprocess.run(SSH + [cmd], timeout=15, capture_output=True, shell=False)
        return result.stdout.decode()
    except Exception:
        try:
            return subprocess.check_output(SSH + ["bash", "-c", cmd],
                                           timeout=15, stderr=subprocess.DEVNULL).decode()
        except Exception:
            return ""

# fail2ban
f2b_raw = run("/usr/bin/fail2ban-client status sshd 2>/dev/null || echo UNAVAILABLE")
f2b = {"available": False, "banned": 0, "totalFailed": 0, "bannedIPs": []}
if "UNAVAILABLE" not in f2b_raw and f2b_raw.strip():
    f2b["available"] = True
    m = re.search(r"Currently banned:\s+(\d+)", f2b_raw)
    if m: f2b["banned"] = int(m.group(1))
    m = re.search(r"Total failed:\s+(\d+)", f2b_raw)
    if m: f2b["totalFailed"] = int(m.group(1))
    m = re.search(r"Banned IP list:\s+(.+)", f2b_raw)
    if m: f2b["bannedIPs"] = m.group(1).strip().split()

# nginx errors
nginx_raw = run("grep -cE ' [45][0-9]{2} ' /var/log/nginx/access.log")
nginx_count = int(nginx_raw.strip()) if nginx_raw.strip().isdigit() else 0

# recent nginx error lines (last 10 4xx/5xx)
nginx_errors = [l.strip() for l in run(
    "grep -E ' [45][0-9]{2} ' /var/log/nginx/access.log | tail -10"
).splitlines() if l.strip()]

# auth failures
auth_raw = run("grep -c 'Failed password' /var/log/auth.log")
auth_count = int(auth_raw.strip()) if auth_raw.strip().isdigit() else 0
auth_recent = [l.strip() for l in run(
    "grep 'Failed password' /var/log/auth.log | tail -10"
).splitlines() if l.strip()]

# banned IPs detail
has_threats = f2b["banned"] > 0 or auth_count > 50 or nginx_count > 5000

data = {
    "ok": True,
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "hasThreats": has_threats,
    "fail2ban": f2b,
    "nginx": {"errorCount": nginx_count, "recentErrors": nginx_errors[-10:]},
    "auth": {"failCount": auth_count, "recent": auth_recent},
}

with open("/tmp/security-data.json", "w") as f:
    json.dump(data, f)
print(f"Security: {f2b['banned']} banned, {nginx_count} nginx errors, {auth_count} auth failures")
SECEOF

# Sync security data to prod
if [ -f "/tmp/security-data.json" ]; then
  cp /tmp/security-data.json "$MISSION_SECURITY"
  scp "${SCP_OPTIONS[@]}" \
      /tmp/security-data.json \
      "${PROD_HOST}:${PROD_AGENT_DATA}/security-data.json" 2>>"$LOG" \
    || echo "WARN: security-data.json transfer failed at $(date)"
fi

echo "Sync complete at $(date)"
