// C5: two fixers, two git worktrees, one winner. Each query() gets its own
// checkout as cwd, so the agents cannot see or overwrite each other's edits.
// The program, not an agent, runs the tests and picks the fix to keep.
import { execFileSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { protectedPaths, WRITE_TOOLS } from "./guard";
import { maintainerServer, RUN_TESTS, runVitest } from "./run-tests";
import { agentEnv, formatUsd, repoRoot } from "./shared";

const contestants = [
  { name: "sonnet", model: "claude-sonnet-5" },
  { name: "haiku", model: "claude-haiku-4-5" },
];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

type Outcome = {
  name: string;
  model: string;
  dir: string;
  branch: string;
  cost: number;
  seconds: number;
  diffStat: string;
  failed: number;
  passed: number;
};

async function runFixer(
  name: string,
  model: string,
  finding: string,
  stamp: string,
): Promise<Outcome> {
  // A sibling of the repository, so no path of the worktree runs through
  // .claude/, which Claude Code guards against edits.
  const dir = join(repoRoot, "..", `${basename(repoRoot)}-race-${name}`);
  const branch = `race/${name}-${stamp}`;
  git(repoRoot, "worktree", "add", "-b", branch, dir, "HEAD");
  // A worktree has no node_modules. Borrowing the main checkout's is fast, and
  // it has one catch: workspace packages resolve to the main checkout's copy.
  if (!existsSync(join(dir, "node_modules"))) {
    symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"));
  }

  const log = (line: string) => console.log(`[${name}] ${line}`);
  log(`working in ${dir}`);
  let cost = 0;
  let seconds = 0;
  for await (const message of query({
    prompt: `Fix this finding: ${finding}\nMake the smallest change that fixes it and add or adjust one unit test that pins it. Run the affected test files with run_tests before you finish.`,
    options: {
      cwd: dir,
      // The worktree belongs to this checkout, which is where the trusted
      // project configuration lives.
      projectConfigRoot: repoRoot,
      model,
      env: agentEnv(),
      strictMcpConfig: true,
      tools: ["Read", "Grep", "Glob", "Edit", "Write"],
      mcpServers: { maintainer: maintainerServer(dir) },
      allowedTools: ["Read", "Grep", "Glob", RUN_TESTS],
      // No human in this loop: edits inside the worktree are accepted, the
      // hook still guards the protected paths, and the tests decide.
      permissionMode: "acceptEdits",
      hooks: {
        PreToolUse: [{ matcher: WRITE_TOOLS, hooks: [protectedPaths(dir)] }],
      },
      maxBudgetUsd: 3,
      persistSession: false,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (
          block.type === "tool_use" &&
          /Edit|Write|run_tests/.test(block.name)
        ) {
          const input = block.input as { file_path?: string };
          log(
            `-> ${block.name} ${(input.file_path ?? "").replace(`${dir}/`, "")}`,
          );
        }
      }
    }
    if (message.type === "result") {
      cost = message.total_cost_usd;
      seconds = message.duration_ms / 1000;
    }
  }

  git(dir, "add", "-A", ":!node_modules");
  const diffStat = git(dir, "diff", "--cached", "--shortstat");
  const suite = await runVitest(dir, ["tests/unit"]);
  log(
    `done: ${diffStat || "no changes"}; unit tests ${suite.passed} passed, ${suite.failed} failed`,
  );
  return { name, model, dir, branch, cost, seconds, diffStat, ...suite };
}

export async function race(finding: string): Promise<void> {
  if (!finding) {
    console.error('Usage: npm run maintainer -- race "<finding>"');
    process.exit(2);
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const outcomes = await Promise.all(
    contestants.map((c) => runFixer(c.name, c.model, finding, stamp)),
  );

  console.log("");
  for (const o of outcomes) {
    console.log(
      `${o.name.padEnd(7)} ${o.model.padEnd(18)} ${o.seconds.toFixed(0).padStart(4)} s  ${formatUsd(o.cost)}  ${o.failed === 0 && o.diffStat ? "green" : "out"}  ${o.diffStat}`,
    );
  }

  // Keep a fix with changes and a green suite; among those, the cheaper one.
  const winner = outcomes
    .filter((o) => o.failed === 0 && o.diffStat)
    .sort((a, b) => a.cost - b.cost)[0];

  for (const o of outcomes) {
    if (o === winner) {
      git(o.dir, "commit", "-q", "-m", `Fix: ${finding}`);
    }
    git(repoRoot, "worktree", "remove", "--force", o.dir);
    if (o !== winner) git(repoRoot, "branch", "-D", o.branch);
  }

  if (!winner) {
    console.log("\nNo fix passed. Both worktrees and branches are gone.");
    process.exit(1);
  }
  console.log(
    `\nKept ${winner.name}'s fix on branch ${winner.branch}. Review it, then:\n   git diff HEAD...${winner.branch}\n   git merge ${winner.branch}`,
  );
}
