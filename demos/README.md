# Session 5 demo assets

Files the session 5 storybook refers to, so nobody types a JSON schema from a PDF. Run
every command from the repository root, where the app's `.env` lives.

| File | Used in | What it is |
|---|---|---|
| `openrouter.env.sh` | steps 25 to 31 | `source` it to route Claude Code in the current shell through OpenRouter, using `OPENROUTER_API_KEY` from `.env`. `--off` undoes it. |
| `a2-doors.schema.json` | steps 27, 32 | `--json-schema` for the inventory of ways into the todo list |
| `a2-findings.schema.json` | steps 27, 37 | `--json-schema` for review findings with a severity, used by the gate and the CI job |
| `a3-tool-calls.jq` | steps 27 to 31 | `jq -r -f` filter for `--output-format stream-json --verbose`: one line per tool call, one summary line |
| `review-rubric.md` | step 29 | `--append-system-prompt-file` for the code review report |
| `b1-bakeoff.sh` | step 31 | one question, three contestants (Claude Code and pi on glm-5.3-flash, pi on kimi-k3), event streams in `bakeoff/` |
| `c4-thread-leak.sh` | step 34 | signs up a throwaway user and reads every other user's chat through CopilotKit's thread endpoints |
| `jaeger.sh` | step 35 | Jaeger in Docker, OTLP on 4318, UI on 16686 |

The Agent SDK program for steps 32 to 35 is not in this folder. It is the `agents/`
workspace, and `.tours/agent-sdk.tour` walks through it.
