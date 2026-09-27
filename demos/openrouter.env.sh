# Route Claude Code in the current shell through OpenRouter.
#
#   source demos/openrouter.env.sh          reads OPENROUTER_API_KEY from ./.env
#   source demos/openrouter.env.sh path/.env
#   source demos/openrouter.env.sh --off    back to your normal Claude login
#
# Only this shell is affected. Other terminals and your interactive Claude Code keep
# their normal login. The key is never printed.

if [ "${1:-}" = "--off" ]; then
  unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY
  echo "Claude Code in this shell uses your normal login again."
  return 0 2>/dev/null || exit 0
fi

_or_env_file="${1:-.env}"
if [ ! -r "$_or_env_file" ]; then
  echo "openrouter.env.sh: cannot read $_or_env_file" >&2
  unset _or_env_file
  return 1 2>/dev/null || exit 1
fi

_or_key="$(sed -n 's/^OPENROUTER_API_KEY=//p' "$_or_env_file" | tr -d "\"' \r")"
if [ -z "$_or_key" ]; then
  echo "openrouter.env.sh: no OPENROUTER_API_KEY in $_or_env_file" >&2
  unset _or_env_file _or_key
  return 1 2>/dev/null || exit 1
fi

# The base URL has no /v1: this is OpenRouter's Anthropic-compatible endpoint.
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$_or_key"
# Must be empty, or Claude Code authenticates against Anthropic instead.
export ANTHROPIC_API_KEY=""
unset _or_env_file _or_key

echo "Claude Code in this shell now goes through OpenRouter. Undo: source demos/openrouter.env.sh --off"
