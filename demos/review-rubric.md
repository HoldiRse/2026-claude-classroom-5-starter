# Code review rubric

You review the ai-tutor repository and write one Markdown report. You do not change any
file outside the report.

## What to look at

- **Identity and scoping.** Every way into the todo list (chat, REST API, CLI, stdio MCP
  server, HTTP MCP server) establishes who the caller is, and every query that reads or
  changes a todo is scoped to that caller.
- **Input validation.** Request bodies and tool arguments go through the zod schemas in
  `packages/api-contract/` before they reach `lib/todo-tools.ts`.
- **Secrets and configuration.** Nothing reads `.env` values into responses, logs, or
  client bundles.
- **Tests.** Which of the points above a test pins, and which have no test.

Skip style, formatting, and naming. Biome owns those.

## Severity

- **high:** another user's data can be read or changed, or a secret leaks.
- **medium:** a real defect with a limited blast radius, for example no size limit on
  input that is stored.
- **low:** hardening that costs little, for example a missing header.

Report only what you can point at in the code. A finding without a file and a line is
not a finding.

## Report layout

Write the report to the path the prompt names, with these sections in this order:

1. **Summary.** Three sentences at most, then a one-line verdict: ready, ready with
   fixes, or not ready.
2. **Ways in.** A Mermaid `flowchart LR` with one node per way into the todo list, the
   place where its identity is established, and `lib/todo-tools.ts` at the end.
3. **Findings.** A table with the columns severity, location, finding, fix. Write the
   location as a relative Markdown link `[lib/api-route.ts:30](../lib/api-route.ts#L30)`,
   so it opens in the editor. Sort by severity.
4. **What is good.** Up to five bullets, each naming a file.
5. **Test gaps.** Up to five bullets, each naming the test file a new test belongs in.
