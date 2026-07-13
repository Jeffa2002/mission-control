#!/usr/bin/env python3
"""Build Mission Control's allowlisted agent-work snapshot from OpenClaw metadata."""

import argparse
import json
import re
import subprocess
import time
from datetime import datetime, timezone


AGENT_META = {
    "main": ("Archie", "🤖"), "dev": ("Dev", "👨‍💻"), "designer": ("Nova", "🎨"),
    "sec": ("SecSpy", "🕵️"), "research": ("Scout", "🔍"), "writer": ("Writer", "✍️"),
    "qa": ("QA", "🧪"), "archie-pro": ("Archie Pro", "⚡"), "travel": ("Travel", "🧳"),
}
ACTIVE_STATUSES = {"queued", "running", "waiting_for_tool", "waiting_for_approval", "blocked", "retrying"}
STATUS_MAP = {
    "queued": "queued", "pending": "queued", "running": "running",
    "waiting_for_tool": "waiting_for_tool", "waiting_for_approval": "waiting_for_approval",
    "blocked": "blocked", "retrying": "retrying", "succeeded": "completed",
    "completed": "completed", "failed": "failed", "error": "failed", "cancelled": "cancelled",
    "canceled": "cancelled",
}


def cli_json(*args):
    last_error = None
    for attempt in range(5):
        result = subprocess.run(["openclaw", *args], capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return json.loads(result.stdout)
        last_error = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        time.sleep(attempt + 1)
    raise RuntimeError(f"openclaw {' '.join(args)} failed after retries: {last_error}")


def iso(milliseconds):
    if not isinstance(milliseconds, (int, float)) or milliseconds <= 0:
        return None
    return datetime.fromtimestamp(milliseconds / 1000, timezone.utc).isoformat().replace("+00:00", "Z")


def safe_text(value):
    if not isinstance(value, str):
        return None
    value = re.sub(r"[\r\n\t]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()[:120]
    if not value:
        return None
    value = re.sub(r"\b(?:bearer|token|password|secret|api[-_ ]?key)\s*[:=]?\s*\S+", "[redacted]", value, flags=re.I)
    value = re.sub(r"(?:^|\s)(?:/[\w.-]+){2,}(?=\s|$)", " [redacted-path]", value)
    value = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[redacted-email]", value, flags=re.I)
    return value


def freshness(last_event_ms, now_ms):
    if not isinstance(last_event_ms, (int, float)):
        return "unknown"
    age = now_ms - last_event_ms
    if age <= 120_000:
        return "fresh"
    if age <= 1_200_000:
        return "aging"
    return "stale"


def event_summary(status):
    return {
        "queued": "Task queued", "running": "Task running", "waiting_for_tool": "Waiting for a tool",
        "waiting_for_approval": "Waiting for approval", "blocked": "Task blocked", "retrying": "Task retrying",
        "completed": "Task completed", "failed": "Task failed", "cancelled": "Task cancelled",
        "stale": "Task heartbeat stale", "unknown": "Task state unknown",
    }[status]


def build_snapshot(sessions_payload, tasks_payload, cron_payload, now_ms):
    sessions = sessions_payload.get("sessions", []) if isinstance(sessions_payload, dict) else []
    tasks = tasks_payload.get("tasks", []) if isinstance(tasks_payload, dict) else []
    jobs = cron_payload.get("jobs", []) if isinstance(cron_payload, dict) else []
    cron_names = {job.get("id"): safe_text(job.get("name")) for job in jobs if isinstance(job, dict)}

    latest_sessions = {}
    for raw in sessions:
        if not isinstance(raw, dict) or not isinstance(raw.get("agentId"), str):
            continue
        candidate = {
            "agentId": raw["agentId"], "sessionId": raw.get("sessionId"), "updatedAt": raw.get("updatedAt"),
            "kind": raw.get("kind"), "abortedLastRun": raw.get("abortedLastRun"),
        }
        existing = latest_sessions.get(candidate["agentId"])
        if not existing or (candidate.get("updatedAt") or 0) > (existing.get("updatedAt") or 0):
            latest_sessions[candidate["agentId"]] = candidate

    deduped_tasks = {}
    for raw in tasks:
        if not isinstance(raw, dict) or not isinstance(raw.get("taskId"), str) or not isinstance(raw.get("agentId"), str):
            continue
        task = {key: raw.get(key) for key in (
            "taskId", "runtime", "sourceId", "requesterSessionKey", "ownerKey", "scopeKind",
            "childSessionKey", "agentId", "runId", "label", "status", "createdAt", "startedAt", "endedAt", "lastEventAt",
        )}
        existing = deduped_tasks.get(task["taskId"])
        if not existing or (task.get("lastEventAt") or 0) > (existing.get("lastEventAt") or 0):
            deduped_tasks[task["taskId"]] = task
    tasks = list(deduped_tasks.values())

    session_owners = {task.get("childSessionKey"): task["taskId"] for task in tasks if task.get("childSessionKey")}
    parent_ids = {}
    child_counts = {task["taskId"]: 0 for task in tasks}
    for task in tasks:
        owner_key = task.get("ownerKey") or task.get("requesterSessionKey")
        parent_id = session_owners.get(owner_key)
        if parent_id and parent_id != task["taskId"] and owner_key != task.get("childSessionKey"):
            parent_ids[task["taskId"]] = parent_id
            child_counts[parent_id] = child_counts.get(parent_id, 0) + 1

    work_by_agent = {}
    for task in tasks:
        status = STATUS_MAP.get(str(task.get("status", "")).lower(), "unknown")
        last_event_ms = task.get("lastEventAt")
        task_freshness = freshness(last_event_ms, now_ms)
        if status in ACTIVE_STATUSES and task_freshness == "stale":
            status = "stale"
        runtime = str(task.get("runtime") or "")
        source = "cron" if runtime == "cron" else "acp" if runtime == "acp" else "subagent" if task["taskId"] in parent_ids else "task"
        title = safe_text(task.get("label")) or (cron_names.get(task.get("sourceId")) if runtime == "cron" else None)
        blocker = "approval" if status == "waiting_for_approval" else "tool" if status == "waiting_for_tool" else "unknown" if status == "blocked" else None
        started_ms = task.get("startedAt") or task.get("createdAt")
        end_ms = task.get("endedAt") if status in {"completed", "failed", "cancelled"} else now_ms
        elapsed = max(0, end_ms - started_ms) if isinstance(started_ms, (int, float)) and isinstance(end_ms, (int, float)) else None
        work = {
            "workId": task["taskId"], "parentWorkId": parent_ids.get(task["taskId"]), "source": source,
            "title": title, "goal": None, "status": status, "phase": "unknown", "startedAt": iso(started_ms),
            "lastEventAt": iso(last_event_ms), "elapsedMs": elapsed, "freshness": task_freshness,
            "lastEvent": {"category": "blocker" if status in {"blocked", "waiting_for_approval", "waiting_for_tool"} else "retry" if status == "retrying" else "lifecycle", "summary": event_summary(status)},
            "childCount": child_counts.get(task["taskId"], 0), "blockerCategory": blocker,
            "progress": {"kind": "indeterminate"},
        }
        rank = (1 if status in ACTIVE_STATUSES or status == "stale" else 0, last_event_ms or 0)
        existing = work_by_agent.get(task["agentId"])
        if not existing or rank > existing[0]:
            work_by_agent[task["agentId"]] = (rank, work)

    agent_ids = sorted(set(latest_sessions) | set(work_by_agent) | set(AGENT_META))
    agents = []
    for agent_id in agent_ids:
        session = latest_sessions.get(agent_id)
        last_seen_ms = session.get("updatedAt") if session else None
        work = work_by_agent.get(agent_id, (None, None))[1]
        if work is None and session and isinstance(session.get("sessionId"), str) and freshness(last_seen_ms, now_ms) != "stale":
            work = {
                "workId": session["sessionId"], "parentWorkId": None, "source": "session", "title": None,
                "goal": None, "status": "unknown", "phase": "unknown", "startedAt": None,
                "lastEventAt": iso(last_seen_ms), "elapsedMs": None, "freshness": freshness(last_seen_ms, now_ms),
                "lastEvent": {"category": "lifecycle", "summary": "Recent session heartbeat"}, "childCount": 0,
                "blockerCategory": None, "progress": {"kind": "indeterminate"},
            }
        active_work = work and work["status"] in ACTIVE_STATUSES and work["freshness"] != "stale"
        seen_freshness = freshness(last_seen_ms, now_ms)
        availability = "Working" if active_work else "Idle" if seen_freshness in {"fresh", "aging"} else "Offline"
        label, emoji = AGENT_META.get(agent_id, (safe_text(agent_id.title()) or "Unknown", "🤖"))
        agents.append({
            "id": agent_id, "label": label, "emoji": emoji, "busy": availability == "Working",
            "status": availability, "lastSeen": iso(last_seen_ms), "work": work,
        })

    return {"schemaVersion": 1, "ok": True, "ts": iso(now_ms), "agents": agents}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/agent-status.json")
    args = parser.parse_args()
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    snapshot = build_snapshot(
        cli_json("sessions", "--all-agents", "--active", "240", "--json"),
        cli_json("tasks", "list", "--json"),
        cli_json("cron", "list", "--json"),
        now_ms,
    )
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, separators=(",", ":"))
    print(f"Generated safe status for {len(snapshot['agents'])} agents")


if __name__ == "__main__":
    main()
