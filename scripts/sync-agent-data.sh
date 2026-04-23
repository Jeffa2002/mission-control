#!/usr/bin/env bash
# sync-agent-data.sh - runs on bazza, syncs agent status + sessions to prod
# Called every 15s via cron

set -euo pipefail

AGENTS_DIR="/root/.openclaw/agents"
PROD_HOST="root@203.57.50.240"
PROD_PORT="2222"
PROD_KEY="/root/.ssh/prod_deploy_v3"
PROD_AGENT_DATA="/root/.openclaw/agents"
STATUS_FILE="/tmp/agent-status.json"
WORKSPACE_STATUS="/root/.openclaw/workspace/agent-status.json"

# ── 1. Build agent-status.json from local agents dir ──────────────────────────
python3 - <<'PYEOF'
import os, json, time, glob

AGENTS_DIR = "/root/.openclaw/agents"
AGENT_META = {
    "main":       {"label": "Archie",   "emoji": "🤖"},
    "dev":        {"label": "Dev",      "emoji": "👨‍💻"},
    "designer":   {"label": "Nova",     "emoji": "🎨"},
    "sec":        {"label": "SecSpy",   "emoji": "🕵️"},
    "research":   {"label": "Scout",    "emoji": "🔍"},
    "writer":     {"label": "Writer",   "emoji": "✍️"},
    "qa":         {"label": "QA",       "emoji": "🧪"},
    "archie-pro": {"label": "Archie Pro","emoji": "⚡"},
}

now = time.time()
agents = []

for agent_id in sorted(os.listdir(AGENTS_DIR)):
    agent_dir = os.path.join(AGENTS_DIR, agent_id)
    if not os.path.isdir(agent_dir):
        continue

    sessions_dir = os.path.join(agent_dir, "sessions")
    session_files = []
    if os.path.isdir(sessions_dir):
        session_files = [
            f for f in glob.glob(os.path.join(sessions_dir, "*.jsonl"))
            if ".reset." not in f and ".deleted." not in f
        ]

    if not session_files:
        last_seen = None
        last_task = None
        status = "Offline"
    else:
        # Find most recently modified session
        latest = max(session_files, key=os.path.getmtime)
        mtime = os.path.getmtime(latest)
        age = now - mtime
        last_seen = __import__("datetime").datetime.fromtimestamp(mtime).isoformat() + "Z"

        # Read last few lines to get current task
        last_task = None
        try:
            with open(latest, "r") as f:
                lines = f.readlines()
            for line in reversed(lines[-20:]):
                try:
                    rec = json.loads(line.strip())
                    # Look for assistant message or tool call
                    role = rec.get("role") or (rec.get("message") or {}).get("role")
                    if role in ("assistant", "tool"):
                        content = rec.get("content") or rec.get("text") or ""
                        if isinstance(content, list):
                            content = " ".join(
                                (c.get("text") or "") if isinstance(c, dict) else str(c)
                                for c in content
                            )
                        if content and len(content.strip()) > 3:
                            last_task = content.strip()[:120]
                            break
                except Exception:
                    continue
        except Exception:
            pass

        if age < 45:
            status = "Working"
        elif age < 1200:
            status = "Idle"
        else:
            status = "Offline"

    meta = AGENT_META.get(agent_id, {"label": agent_id.title(), "emoji": "🤖"})
    agents.append({
        "id": agent_id,
        "label": meta["label"],
        "emoji": meta["emoji"],
        "busy": status == "Working",
        "status": status,
        "lastSeen": last_seen,
        "currentTask": last_task,
        "sessionId": None,
    })

output = {"ok": True, "ts": __import__("datetime").datetime.utcnow().isoformat() + "Z", "agents": agents}
with open("/tmp/agent-status.json", "w") as f:
    json.dump(output, f)
print(f"Generated status for {len(agents)} agents")
PYEOF

# ── 2. Rsync session files to prod (fast incremental, skip deleted/reset) ─────
rsync -az --delete \
    -e "ssh -i $PROD_KEY -p $PROD_PORT -o StrictHostKeyChecking=no" \
    --exclude="*.reset.*" \
    --exclude="*.deleted.*" \
    --exclude="agent-status.json" \
    "$AGENTS_DIR/" \
    "${PROD_HOST}:${PROD_AGENT_DATA}/" 2>/dev/null

# ── 4. Write status JSON after rsync (so --delete doesn't wipe it) ────────────
scp -i "$PROD_KEY" -P "$PROD_PORT" -o StrictHostKeyChecking=no \
    "$STATUS_FILE" \
    "${PROD_HOST}:${PROD_AGENT_DATA}/agent-status.json" 2>/dev/null

# ── 5. Sync iperf-results.json to prod agents dir ──────────────────────────────
IPERF_SRC="/root/.openclaw/workspace/mission-control/iperf-results.json"
if [ -f "$IPERF_SRC" ]; then
  scp -i "$PROD_KEY" -P "$PROD_PORT" -o StrictHostKeyChecking=no \
      "$IPERF_SRC" \
      "${PROD_HOST}:${PROD_AGENT_DATA}/iperf-results.json" 2>/dev/null
fi

# ── 6b. Collect ping history and append to network-history.db ────────────────
DB="/root/.openclaw/workspace/mission-control/network-history.db"
if [ -f "$DB" ]; then
  python3 - <<'PINGEOF'
import subprocess, sqlite3, time
from datetime import datetime, timezone

NODES = {
    "prod":        "203.57.50.240",
    "crm8":        "103.230.159.104",
    "shazza":      "100.113.217.81",
    "backup-melb": "43.229.63.19",
    "bazza":       "127.0.0.1",
}

def ping(ip):
    try:
        out = subprocess.check_output(
            ["ping", "-c", "3", "-W", "1", "-q", ip],
            stderr=subprocess.DEVNULL, timeout=8
        ).decode()
        import re
        m = re.search(r"= [\d.]+/([\d.]+)/", out)
        return float(m.group(1)) if m else None
    except Exception:
        return None

ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
con = sqlite3.connect("/root/.openclaw/workspace/mission-control/network-history.db")
cur = con.cursor()
rows = 0
for node_id, ip in NODES.items():
    ms = ping(ip)
    if ms is not None:
        cur.execute("INSERT INTO ping_history (ts, node_id, ping_ms) VALUES (?,?,?)", (ts, node_id, ms))
        rows += 1
con.commit()
con.close()
print(f"Ping: {rows} rows recorded")
PINGEOF
fi

# ── 6c. Sync network-history.db to prod ──────────────────────────────────────
if [ -f "$DB" ]; then
  scp -i "$PROD_KEY" -P "$PROD_PORT" -o StrictHostKeyChecking=no \
      "$DB" \
      "${PROD_HOST}:${PROD_AGENT_DATA}/network-history.db" 2>/dev/null && true
fi

# ── 6. Collect real security data from prod and sync ──────────────────────────
python3 - <<'SECEOF'
import subprocess, json, re
from datetime import datetime, timezone

SSH = ["ssh", "-i", "/root/.ssh/prod_deploy_v3", "-p", "2222",
       "-o", "StrictHostKeyChecking=no", "root@203.57.50.240"]

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
  scp -i "$PROD_KEY" -P "$PROD_PORT" -o StrictHostKeyChecking=no \
      /tmp/security-data.json \
      "${PROD_HOST}:${PROD_AGENT_DATA}/security-data.json" 2>/dev/null
fi

echo "Sync complete at $(date)"