// C2: test run and analysis. The agent runs the suite through run_tests, reads
// the test files, and answers in a shape a zod schema fixes, so the program
// gets typed data instead of prose.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { maintainerServer, RUN_TESTS } from "./run-tests";
import {
  baseOptions,
  drain,
  jsonSchema,
  printModelUsage,
  printResult,
} from "./shared";

const TestReport = z.object({
  suite: z.object({
    passed: z.number().int(),
    failed: z.number().int(),
  }),
  doors: z.array(
    z.object({
      door: z
        .enum(["chat", "REST API", "CLI", "stdio MCP", "HTTP MCP"])
        .describe("One of the five ways into the todo list"),
      testFiles: z
        .array(z.string())
        .describe("Repo-relative test files that exercise this way in"),
      untested: z
        .array(z.string())
        .describe(
          "Behavior of this way in that no test pins, one short sentence each",
        ),
    }),
  ),
});

export async function tests(): Promise<void> {
  const messages = query({
    prompt:
      "Run the whole test suite with run_tests. Then read the test files and map them to the ways into the todo list: the chat, the REST API, the CLI, the stdio MCP server, and the HTTP MCP server. For each way, name the test files that exercise it and at most three behaviors that no test pins, such as scoping a query to the caller.",
    options: {
      ...baseOptions(),
      // Built-in tools: read-only. No Bash, so run_tests is the only way to run anything.
      tools: ["Read", "Grep", "Glob"],
      mcpServers: { maintainer: maintainerServer() },
      allowedTools: ["Read", "Grep", "Glob", RUN_TESTS],
      permissionMode: "dontAsk",
      outputFormat: {
        type: "json_schema",
        schema: jsonSchema(TestReport),
      },
      persistSession: false,
    },
  });

  const result = await drain(messages);
  printResult(result);
  printModelUsage(result.modelUsage);
  if (result.subtype !== "success") process.exit(1);

  // Parse again on this side: the schema is the contract, and zod gives types.
  const report = TestReport.parse(result.structured_output);
  console.log(
    `\nSuite: ${report.suite.passed} passed, ${report.suite.failed} failed\n`,
  );
  for (const door of report.doors) {
    console.log(`${door.door}  (${door.testFiles.join(", ") || "no tests"})`);
    for (const gap of door.untested) console.log(`   - ${gap}`);
  }
}
