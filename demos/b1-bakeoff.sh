#!/usr/bin/env bash
# B1: one research question, three contestants, run in parallel.
#
#   bash demos/b1-bakeoff.sh
#
# Writes bakeoff/<contestant>.jsonl (the event stream) and bakeoff/<contestant>.err,
# and prints one line per contestant with its exit code and wall-clock seconds.
# Needs OPENROUTER_API_KEY in .env for Claude Code and pi's OpenRouter login for pi.
set -u
cd "$(dirname "$0")/.."

QUESTION="For each of the ways into the todo list, show where the user's identity is established and where the query is scoped to that user, with file and line."
mkdir -p bakeoff

# Both harnesses get read-only tools and the same thinking level. pi reads stdin
# until EOF when it is not a terminal, so every run gets </dev/null.
contestant() {
  local name="$1"
  shift
  local start=$SECONDS
  "$@" </dev/null >"bakeoff/$name.jsonl" 2>"bakeoff/$name.err"
  echo "$name: exit $?, $((SECONDS - start)) s"
}

contestant claude-code-glm bash -c 'source demos/openrouter.env.sh >/dev/null &&
  exec claude -p --model z-ai/glm-5.3-flash --effort medium --tools "Read,Grep,Glob" \
    --output-format stream-json --verbose "$0"' "$QUESTION" &
contestant pi-glm pi -p --mode json --no-session --no-extensions --thinking medium \
  --tools read,grep,find,ls --model openrouter/z-ai/glm-5.3-flash "$QUESTION" &
contestant pi-kimi pi -p --mode json --no-session --no-extensions --thinking medium \
  --tools read,grep,find,ls --model openrouter/moonshotai/kimi-k3 "$QUESTION" &
wait
