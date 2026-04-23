#!/usr/bin/env bash
# sync-agent-data.sh — runs on bazza, syncs agent status + sessions to prod
# Called every 15s via cron

set -euo pipefail

AGENTS_DIR="/root/.openclaw/agents"
PROD_HOST="root@203.57.50.240"
PROD_PORT="2222"
PROD_KEY="/root/.ssh/prod_deploy_v3"
PROD_AGENT_DATA="/root/.openclaw/agents"
STATUS_FILE="/tmp/agent-status.json"

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

# ── 2. Rsync agent-status.json to prod ────────────────────────────────────────
scp -i "$PROD_KEY" -P "$PROD_PORT" -o StrictHostKeyChecking=no \
    "$STATUS_FILE" \
    "${PROD_HOST}:/var/www/mission-control/agent-status.json" 2>/dev/null

# ── 3. Rsync session files to prod (fast incremental, skip deleted/reset) ─────
rsync -az --delete \
    -e "ssh -i $PROD_KEY -p $PROD_PORT -o StrictHostKeyChecking=no" \
    --exclude="*.reset.*" \
    --exclude="*.deleted.*" \
    "$AGENTS_DIR/" \
    "${PROD_HOST}:${PROD_AGENT_DATA}/" 2>/dev/null

echo "Sync complete at $(date)"

chmod +x /root/.openclaw/workspace/mission-control/scripts/sync-agent-data.sh