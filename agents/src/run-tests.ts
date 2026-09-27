// C2: a custom tool. The agent gets run_tests instead of a shell, so it can run
// the suite and nothing else. The tool runs in this process, as an in-process
// MCP server that query() hands to the Claude Code subprocess.
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { repoRoot } from "./shared";

const run = promisify(execFile);

export type TestSummary = {
  passed: number;
  failed: number;
  files: { file: string; status: string; failures: string[] }[];
};

// Vitest's JSON reporter, boiled down to what a reviewer reads: one entry per
// test file, with the names and first message line of failing tests.
export async function runVitest(
  cwd: string = repoRoot,
  files: string[] = [],
): Promise<TestSummary> {
  const dir = mkdtempSync(join(tmpdir(), "maintainer-vitest-"));
  const outputFile = join(dir, "report.json");
  try {
    // Vitest exits 1 when a test fails. The report is written either way.
    await run(
      "npx",
      [
        "vitest",
        "run",
        "--reporter=json",
        `--outputFile=${outputFile}`,
        ...files,
      ],
      { cwd, maxBuffer: 50 * 1024 * 1024 },
    ).catch(() => undefined);
    const report = JSON.parse(readFileSync(outputFile, "utf8"));
    return {
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      files: report.testResults.map(
        (r: {
          name: string;
          status: string;
          assertionResults: {
            fullName: string;
            status: string;
            failureMessages: string[];
          }[];
        }) => ({
          file: r.name.replace(`${cwd}/`, ""),
          status: r.status,
          failures: r.assertionResults
            .filter((a) => a.status === "failed")
            .map(
              (a) => `${a.fullName}: ${a.failureMessages[0]?.split("\n")[0]}`,
            ),
        }),
      ),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function maintainerServer(cwd: string = repoRoot) {
  const runTests = tool(
    "run_tests",
    "Run the Vitest suite of the repository, or only the given test files, and return passed and failed counts plus the failures per file. This is the only way to run tests; there is no shell.",
    {
      files: z
        .array(z.string())
        .optional()
        .describe("Repo-relative test files. Omit to run the whole suite."),
    },
    async ({ files }) => {
      const summary = await runVitest(cwd, files ?? []);
      return { content: [{ type: "text", text: JSON.stringify(summary) }] };
    },
    { annotations: { readOnlyHint: true } },
  );
  return createSdkMcpServer({
    name: "maintainer",
    version: "0.1.0",
    tools: [runTests],
  });
}

// The name Claude Code gives the tool: mcp__<server>__<tool>.
export const RUN_TESTS = "mcp__maintainer__run_tests";
