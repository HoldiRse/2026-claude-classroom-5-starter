# Session 5 demo assets

Files the session 5 storybook refers to, so nobody types a JSON schema from a PDF. Run
every command from the repository root, where the app's `.env` lives.

| File | Used in | What it is |
|---|---|---|
| `openrouter.env.sh` | A0 | `source` it to route Claude Code in the current shell through OpenRouter, using `OPENROUTER_API_KEY` from `.env`. `--off` undoes it. |
| `a2-doors.schema.json` | A2 | `--json-schema` for the inventory of ways into the todo list |
| `a2-findings.schema.json` | A2, A6 | `--json-schema` for review findings with a severity, used by the CI gate |
| `a3-tool-calls.jq` | A3 | `jq -r -f` filter for `--output-format stream-json --verbose`: one line per tool call, one summary line |

Status: draft. The plumbing was tested on Haiku 4.5 through OpenRouter; the Opus 5 dry
runs of the storybook prompts are still to come.
