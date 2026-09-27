// C1: the A2 question from part A, asked through query() instead of `claude -p`.
// query() spawns the Claude Code binary that ships with the SDK and reads the
// same stream-json events that `claude -p --output-format stream-json` prints.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  baseOptions,
  drain,
  printResult,
  printToolCalls,
  repoRoot,
} from "./shared";

type Door = {
  door: string;
  entryFile: string;
  auth: string;
  operations: string[];
};

export async function hello(): Promise<void> {
  const schema = JSON.parse(
    readFileSync(join(repoRoot, "demos/a2-doors.schema.json"), "utf8"),
  );

  console.log(
    `This process is ${process.pid}. In a second terminal: pgrep -lP ${process.pid}`,
  );

  const messages = query({
    prompt:
      "List the ways into the todo list: the chat, the REST API, the CLI, the stdio MCP server, and the HTTP MCP server. One entry per way, with its entry file, how the caller is authenticated, and which todo operations it offers.",
    options: {
      ...baseOptions(),
      tools: ["Read", "Grep", "Glob"],
      outputFormat: { type: "json_schema", schema },
      persistSession: false,
    },
  });

  const result = await drain(messages, (message) => {
    // Every event, by type, to show it is the stream-json protocol.
    const subtype = "subtype" in message ? `/${message.subtype}` : "";
    if (subtype !== "/thinking_tokens")
      console.log(`[${message.type}${subtype}]`);
    if (message.type === "system" && message.subtype === "init") {
      console.log(
        `   Claude Code ${message.claude_code_version}, model ${message.model}, apiKeySource ${message.apiKeySource}, ${message.skills.length} skills, ${message.tools.length} tools`,
      );
    }
    printToolCalls(message);
  });

  printResult(result);
  if (result.subtype !== "success") process.exit(1);

  const { doors } = result.structured_output as { doors: Door[] };
  console.table(
    doors.map((d) => ({
      door: d.door,
      entry: d.entryFile,
      auth: d.auth,
      operations: d.operations.length,
    })),
  );
}
