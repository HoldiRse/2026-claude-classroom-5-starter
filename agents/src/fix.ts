// C3: fix proposals with a human in the loop. Three layers decide about every
// edit: the PreToolUse hook (policy, no human), canUseTool (the human, y/n with
// the diff), and after the run the test suite and the human again, with a
// rewind to the checkpoint when either says no.
import { relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { type Options, query } from "@anthropic-ai/claude-agent-sdk";
import { askInTerminal } from "./gate";
import { protectedPaths, WRITE_TOOLS } from "./guard";
import { maintainerServer, RUN_TESTS, runVitest } from "./run-tests";
import {
  baseOptions,
  drain,
  printModelUsage,
  printResult,
  printToolCalls,
  repoRoot,
} from "./shared";

export async function fix(finding: string): Promise<void> {
  if (!finding) {
    console.error('Usage: npm run maintainer -- fix "<finding>"');
    process.exit(2);
  }

  const options: Options = {
    ...baseOptions(),
    tools: ["Read", "Grep", "Glob", "Edit", "Write"],
    mcpServers: { maintainer: maintainerServer() },
    // Reads and test runs are pre-approved. Edit and Write are not on the
    // list, so each one goes to canUseTool, which asks in the terminal.
    allowedTools: ["Read", "Grep", "Glob", RUN_TESTS],
    canUseTool: askInTerminal,
    hooks: {
      PreToolUse: [{ matcher: WRITE_TOOLS, hooks: [protectedPaths(repoRoot)] }],
    },
    // Claude Code backs up every file before Edit or Write touches it.
    // replay-user-messages puts the user message UUIDs, the checkpoint ids,
    // into the stream.
    enableFileCheckpointing: true,
    extraArgs: { "replay-user-messages": null },
  };

  let checkpoint: string | undefined;
  const result = await drain(
    query({
      prompt: `Fix this finding in the repository: ${finding}\nMake the smallest change that fixes it and add or adjust one unit test that pins it. Run the affected test files with run_tests before you finish. Answer with two sentences: what you changed, and what the test checks.`,
      options,
    }),
    (message) => {
      if (message.type === "user" && message.uuid && !checkpoint) {
        checkpoint = message.uuid;
      }
      printToolCalls(message);
    },
  );
  printResult(result);
  printModelUsage(result.modelUsage);
  if (result.subtype === "success") console.log(`\n${result.result}\n`);

  // The agent says the tests pass. The program checks for itself.
  console.log("Running the whole suite ...");
  const summary = await runVitest();
  console.log(`Suite: ${summary.passed} passed, ${summary.failed} failed`);

  if (summary.failed > 0) {
    for (const file of summary.files.filter((f) => f.failures.length)) {
      console.log(`   ${file.file}\n      ${file.failures.join("\n      ")}`);
    }
    await rewindTo(result.session_id, checkpoint, options, "Red suite");
    process.exit(1);
  }

  // Green is necessary, not sufficient. The human has the last word.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const keep = (await rl.question("Keep the changes? [Y/n] ")).trim();
  rl.close();
  if (keep.toLowerCase() === "n") {
    await rewindTo(result.session_id, checkpoint, options, "Declined");
  }
}

// Rewind: resume the session with an empty prompt and ask Claude Code to
// restore every file it touched to its state at the first user message.
async function rewindTo(
  sessionId: string,
  checkpoint: string | undefined,
  options: Options,
  why: string,
): Promise<void> {
  if (!checkpoint) {
    console.log("No checkpoint in the stream, so nothing to rewind.");
    return;
  }
  const rewind = query({
    prompt: "",
    options: { ...options, resume: sessionId },
  });
  for await (const _ of rewind) {
    // The dry run reports what would change, the real run changes it.
    const preview = await rewind.rewindFiles(checkpoint, { dryRun: true });
    if (!preview.canRewind) {
      console.log(`${why}: cannot rewind: ${preview.error}`);
      break;
    }
    await rewind.rewindFiles(checkpoint);
    console.log(
      `${why}: rewound ${preview.filesChanged?.map((f) => relative(repoRoot, f)).join(", ")} (+${preview.insertions} -${preview.deletions})`,
    );
    break;
  }
  rewind.close();
}
