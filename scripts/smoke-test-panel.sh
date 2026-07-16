#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3020}"
: "${MISSION_COOKIE_SECRET:?MISSION_COOKIE_SECRET must be set}"

curl_auth=(curl -fsS -H "Cookie: mc_auth=$MISSION_COOKIE_SECRET")

dashboard_html="$("${curl_auth[@]}" "$BASE_URL/")"
security_html="$("${curl_auth[@]}" "$BASE_URL/security")"
office_html="$("${curl_auth[@]}" "$BASE_URL/office")"
teams_html="$("${curl_auth[@]}" "$BASE_URL/teams")"
deploys_html="$("${curl_auth[@]}" "$BASE_URL/deploys")"

grep -qi "operational brief" <<<"$dashboard_html"
grep -q "Needs action" <<<"$dashboard_html"
grep -q "Security Threat Surface" <<<"$security_html"
grep -qi "active roster" <<<"$office_html"
grep -q "Team Directory" <<<"$teams_html"
grep -q "Release Impact Console" <<<"$deploys_html"
"${curl_auth[@]}" "$BASE_URL/api/deploys" | grep -q '"source"'
"${curl_auth[@]}" "$BASE_URL/activity" >/dev/null
