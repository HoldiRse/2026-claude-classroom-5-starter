// C4: a review team. Four subagents, each with its own prompt, model, and
// tools, run in parallel under one orchestrating agent. --single runs the same
// review as one agent, for the comparison.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentDefinition,
  query,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  baseOptions,
  drain,
  jsonSchema,
  printModelUsage,
  printResult,
  printToolCalls,
  repoRoot,
} from "./shared";

const READ_ONLY = ["Read", "Grep", "Glob"];
const RULES =
  "Report only what you can point at in the code, with a file and a line. Return at most five findings, most severe first, each with severity (high, medium, low), file, line, title, and fix. Change no files.";

const team: Record<string, AgentDefinition> = {
  architecture: {
    description:
      "Reviews layering: whether every way into the todo list goes through lib/todo-tools.ts and the shared contract package.",
    prompt: `You review the architecture of the ai-tutor repository. Check that the chat, the REST API, the CLI, and both MCP servers share one data path (lib/todo-tools.ts) and one set of schemas (packages/api-contract), and flag logic that is duplicated or bypasses them. ${RULES}`,
    model: "claude-sonnet-5",
    tools: READ_ONLY,
    maxTurns: 25,
  },
  security: {
    description:
      "Reviews identity and scoping: where each way in establishes the caller and whether every query is scoped to that caller.",
    prompt: `You are a security engineer reviewing the ai-tutor repository before a production release. For each way into the todo list, find where the caller's identity is established and check that every query is scoped to that caller. Also check token handling and input limits. ${RULES}`,
    model: "claude-opus-5-5",
    tools: READ_ONLY,
    maxTurns: 30,
  },
  tests: {
    description:
      "Reviews the test suite: which behavior of each way in is pinned by a test and which is not.",
    prompt: `You review the tests of the ai-tutor repository under tests/. Find behavior that matters and has no test, above all per-user scoping and input validation, and name the test file each missing test belongs in. ${RULES}`,
    model: "claude-sonnet-5",
    tools: READ_ONLY,
    maxTurns: 25,
  },
  docs: {
    description:
      "Reviews AGENTS.md, the CLI --help texts, and the skills for statements the code contradicts.",
    prompt: `You review the documentation of the ai-tutor repository that agents read: AGENTS.md, the --help texts in cli/src/index.ts, and the SKILL.md files under .agents/skills. Find statements the code contradicts. ${RULES}`,
    model: "claude-haiku-4-5",
    tools: READ_ONLY,
    maxTurns: 20,
  },
};

const Findings = z.object({
  findings: z.array(
    z.object({
      reviewer: z.enum(["architecture", "security", "tests", "docs"]),
      severity: z.enum(["high", "medium", "low"]),
      file: z.string(),
      line: z.number().int(),
      title: z.string(),
      fix: z.string(),
    }),
  ),
});

type SubagentStats = {
  type: string;
  tokens: number;
  toolUses: number;
  seconds: number;
};

export async function review(single: boolean): Promise<void> {
  const rubric = readFileSync(join(repoRoot, "demos/review-rubric.md"), "utf8");
  const prompt = single
    ? `Review the ai-tutor repository from four angles, one after the other: architecture, security, tests, and docs. ${Object.values(
        team,
      )
        .map((a) => a.prompt)
        .join(
          "\n\n",
        )}\n\nReturn all findings, each tagged with the angle that found it as reviewer.`
    : "Review the ai-tutor repository with your four reviewers: architecture, security, tests, and docs. Start all four in one message so they run in parallel, and give each only the instruction to review. Then merge their findings into one list, drop duplicates, keep the reviewer that found each one, and sort by severity.";

  // Which subagent a tool_use id belongs to, and what each subagent used.
  const typeOf = new Map<string, string>();
  const stats: SubagentStats[] = [];
  const track = (message: SDKMessage) => {
    printToolCalls(message);
    if (message.type === "assistant" && !message.parent_tool_use_id) {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && block.name === "Agent") {
          const input = block.input as { subagent_type?: string };
          typeOf.set(block.id, input.subagent_type ?? "?");
        }
      }
    }
    if (
      message.type === "system" &&
      message.subtype === "task_notification" &&
      message.usage
    ) {
      stats.push({
        type: typeOf.get(message.tool_use_id ?? "") ?? message.task_id,
        tokens: message.usage.total_tokens,
        toolUses: message.usage.tool_uses,
        seconds: message.usage.duration_ms / 1000,
      });
    }
  };

  const result = await drain(
    query({
      prompt,
      options: {
        ...baseOptions(),
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: `Use this rubric for severities:\n\n${rubric}`,
        },
        tools: single ? READ_ONLY : [...READ_ONLY, "Agent"],
        agents: single ? undefined : team,
        allowedTools: single ? READ_ONLY : [...READ_ONLY, "Agent"],
        permissionMode: "dontAsk",
        outputFormat: { type: "json_schema", schema: jsonSchema(Findings) },
        persistSession: false,
      },
    }),
    track,
  );

  printResult(result);
  printModelUsage(result.modelUsage);
  if (stats.length) {
    console.log("\nPer subagent:");
    for (const s of stats) {
      console.log(
        `   ${s.type.padEnd(14)} ${String(s.tokens).padStart(9)} tokens  ${String(s.toolUses).padStart(3)} tool uses  ${s.seconds.toFixed(0).padStart(4)} s`,
      );
    }
  }
  if (result.subtype !== "success") process.exit(1);

  const { findings } = Findings.parse(result.structured_output);
  console.log("");
  for (const f of findings) {
    console.log(
      `${f.severity.padEnd(6)} ${f.reviewer.padEnd(12)} ${f.file}:${f.line}  ${f.title}`,
    );
  }
}
