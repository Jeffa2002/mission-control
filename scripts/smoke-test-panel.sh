#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3020}"
: "${MISSION_USER:?MISSION_USER must be set}"
: "${MISSION_PASSWORD:?MISSION_PASSWORD must be set}"

cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar"' EXIT
login_payload="$(node -e 'process.stdout.write(JSON.stringify({user:process.env.MISSION_USER,password:process.env.MISSION_PASSWORD}))')"
curl -fsS --connect-timeout 5 --max-time 30 -c "$cookie_jar" -H 'content-type: application/json' --data "$login_payload" "$BASE_URL/api/login" >/dev/null
curl_auth=(curl -fsS --connect-timeout 5 --max-time 30 -b "$cookie_jar")

dashboard_html="$("${curl_auth[@]}" "$BASE_URL/")"
security_html="$("${curl_auth[@]}" "$BASE_URL/security")"
office_html="$("${curl_auth[@]}" "$BASE_URL/office")"
teams_html="$("${curl_auth[@]}" "$BASE_URL/teams")"
deploys_html="$("${curl_auth[@]}" "$BASE_URL/deploys")"

grep -qi "live operations" <<<"$dashboard_html"
grep -q "Needs action" <<<"$dashboard_html"
grep -q "Security Threat Surface" <<<"$security_html"
grep -qi "active roster" <<<"$office_html"
grep -q "Team Directory" <<<"$teams_html"
grep -q "Release Impact Console" <<<"$deploys_html"
"${curl_auth[@]}" "$BASE_URL/api/deploys" | grep -q '"source"'
"${curl_auth[@]}" "$BASE_URL/activity" >/dev/null
