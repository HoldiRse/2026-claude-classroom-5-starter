# One line per tool call while the agent works, one summary line at the end.
# Subagent tool calls are indented (their events carry parent_tool_use_id).
# Use with: claude -p ... --output-format stream-json --verbose | jq -r -f demos/a3-tool-calls.jq
if .type == "assistant" then
  (if .parent_tool_use_id then "    " else "" end) as $indent
  | .message.content[]?
  | select(.type == "tool_use")
  | "\($indent)-> \(.name) \(.input | (.file_path // .pattern // .command // .path // .description // tostring) | tostring | ltrimstr($ENV.PWD + "/") | .[0:100])"
elif .type == "result" then
  "== \(.num_turns) turns, \(.duration_ms / 1000) s, \(.total_cost_usd) USD, \(.subtype)"
else
  empty
end
