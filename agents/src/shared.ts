// Helpers every subcommand shares: where the repository is, which model runs,
// how the event stream is printed, and the environment the CLI subprocess gets.
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ModelUsage,
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// agents/src/shared.ts -> repository root. Every query() runs there, so the
// spawned Claude Code loads the app's AGENTS.md and skills like the TUI does.
export const repoRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

// The class model. MAINTAINER_MODEL overrides it, for example with a model id
// that OpenRouter serves after `source demos/openrouter.env.sh`.
export const model = process.env.MAINTAINER_MODEL ?? "claude-opus-5-5";

// In TypeScript, options.env replaces the subprocess environment instead of
// adding to it, so start from process.env or PATH and the login are gone.
// --otel adds the OpenTelemetry switches (step C6).
export function agentEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (process.argv.includes("--otel")) {
    Object.assign(env, {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
      OTEL_TRACES_EXPORTER: "otlp",
      // Jaeger stores traces only. Metrics and logs would need a collector.
      OTEL_METRICS_EXPORTER: "none",
      OTEL_LOGS_EXPORTER: "none",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      OTEL_EXPORTER_OTLP_ENDPOINT:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318",
      OTEL_SERVICE_NAME: "tutor-maintainer",
      OTEL_TRACES_EXPORT_INTERVAL: "1000",
    });
  }
  return env;
}

// Options every query() in this program shares. strictMcpConfig keeps the
// user's claude.ai connectors out, so only the servers we pass are loaded.
export function baseOptions() {
  return {
    cwd: repoRoot,
    model,
    env: agentEnv(),
    strictMcpConfig: true,
  };
}

function short(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const rel = text.startsWith(repoRoot) ? relative(repoRoot, text) : text;
  return rel.replace(/\s+/g, " ").slice(0, 100);
}

// One line per tool call, the same view as demos/a3-tool-calls.jq on
// `claude -p --output-format stream-json`. Subagent calls are indented.
export function printToolCalls(message: SDKMessage): void {
  if (message.type !== "assistant") return;
  const indent = message.parent_tool_use_id ? "    " : "";
  for (const block of message.message.content) {
    if (block.type !== "tool_use") continue;
    const input = block.input as Record<string, unknown>;
    const arg =
      input.file_path ??
      input.pattern ??
      input.command ??
      input.description ??
      input;
    console.log(`${indent}-> ${block.name} ${short(arg)}`);
  }
}

export function formatUsd(value: number): string {
  return `${value.toFixed(3)} USD`;
}

export function printResult(result: SDKResultMessage): void {
  console.log(
    `== ${result.num_turns} turns, ${(result.duration_ms / 1000).toFixed(1)} s, ${formatUsd(result.total_cost_usd)}, ${result.subtype}`,
  );
}

export function printModelUsage(usage: Record<string, ModelUsage>): void {
  for (const [name, u] of Object.entries(usage)) {
    const tokens =
      u.inputTokens +
      u.outputTokens +
      u.cacheReadInputTokens +
      u.cacheCreationInputTokens;
    console.log(
      `   ${name.padEnd(28)} ${String(tokens).padStart(9)} tokens  ${formatUsd(u.costUSD)}`,
    );
  }
}

// query() throws after yielding an error result; this returns the result
// either way, so callers can print cost and denials before they exit.
export async function drain(
  messages: AsyncIterable<SDKMessage>,
  onMessage: (message: SDKMessage) => void = printToolCalls,
): Promise<SDKResultMessage> {
  let result: SDKResultMessage | undefined;
  try {
    for await (const message of messages) {
      onMessage(message);
      if (message.type === "result") result = message;
    }
  } catch (error) {
    if (!result) throw error;
  }
  if (!result) throw new Error("The agent ended without a result message.");
  return result;
}

// outputFormat wants a JSON Schema. zod 4 writes one, but its default
// "$schema" is draft 2020-12, which the CLI's validator rejects with "no
// schema with key or ref". Draft 7 passes.
export function jsonSchema(type: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(type, { target: "draft-7" }) as Record<string, unknown>;
}
