// C3: the human gate. canUseTool is the permission prompt of the TUI, turned
// into a function. Claude Code calls it for every tool call that no rule
// allows. Here that means every edit: the program shows the change and asks.
import { createInterface } from "node:readline/promises";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function prefixLines(
  text: string,
  prefix: string,
  color: (s: string) => string,
) {
  return text
    .split("\n")
    .map((line) => color(`${prefix}${line}`))
    .join("\n");
}

function preview(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Edit") {
    return [
      prefixLines(String(input.old_string), "- ", red),
      prefixLines(String(input.new_string), "+ ", green),
    ].join("\n");
  }
  if (toolName === "Write") {
    const lines = String(input.content).split("\n");
    const head = lines.slice(0, 30).join("\n");
    const more =
      lines.length > 30 ? `\n  ... ${lines.length - 30} more lines` : "";
    return prefixLines(head, "+ ", green) + more;
  }
  return JSON.stringify(input, null, 2);
}

export const askInTerminal: CanUseTool = async (toolName, input) => {
  console.log(`\n=== ${toolName} ${String(input.file_path ?? "")}`);
  console.log(preview(toolName, input));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("Allow this change? [y/N] ")).trim();
    if (answer.toLowerCase() === "y") {
      return { behavior: "allow", updatedInput: input };
    }
    const reason = (await rl.question("Why not? (sent to the agent) ")).trim();
    return {
      behavior: "deny",
      message: `The maintainer declined this change. ${reason || "No reason given."}`,
    };
  } finally {
    rl.close();
  }
};
