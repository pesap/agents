import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LoadedAgent } from "./loader.js";
import type { GitAgentRuntimeState } from "./state.js";

const MEMORY_LINE_CAP = 200;

export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: unknown) => {
      if (!block || typeof block !== "object") return false;
      return (block as { type?: string }).type === "text";
    })
    .map((block) => (block as { text?: string }).text ?? "")
    .join(" ")
    .trim();
}

export function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

export function appendToMemory(agent: LoadedAgent, entry: string): void {
  mkdirSync(agent.memoryDir, { recursive: true });
  const memoryPath = join(agent.memoryDir, "MEMORY.md");

  if (existsSync(memoryPath)) {
    const content = readFileSync(memoryPath, "utf-8");
    const lineCount = (content.match(/\n/g) || []).length + 1;

    if (lineCount < MEMORY_LINE_CAP) {
      appendFileSync(memoryPath, `\n${entry}`, "utf-8");
      return;
    }

    const lines = content.split("\n");
    lines.push(entry);
    writeFileSync(memoryPath, lines.slice(lines.length - MEMORY_LINE_CAP).join("\n"), "utf-8");
    return;
  }

  writeFileSync(memoryPath, entry, "utf-8");
}

export function saveAgentMemoryEntry(
  state: GitAgentRuntimeState,
  agent: LoadedAgent,
  entry: string,
): void {
  appendToMemory(agent, entry);
  state.rememberedThisSession = true;
}

export function getLastAssistantText(ctx: {
  sessionManager?: { getBranch?: () => unknown[] };
}): string {
  const entries = ctx.sessionManager?.getBranch?.() ?? [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as { type?: string; message?: { role?: string; content?: unknown } };
    if (entry?.type !== "message") continue;
    if (entry.message?.role === "assistant") return extractText(entry.message.content);
  }
  return "";
}

export function getLastUserText(ctx: {
  sessionManager?: { getBranch?: () => unknown[] };
}): string {
  const entries = ctx.sessionManager?.getBranch?.() ?? [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as { type?: string; message?: { role?: string; content?: unknown } };
    if (entry?.type !== "message") continue;
    if (entry.message?.role === "user") return extractText(entry.message.content);
  }
  return "";
}
