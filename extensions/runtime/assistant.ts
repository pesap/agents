import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";

export type WorkflowOutcome = "success" | "partial" | "failed";

type AgentEndEventMessage = {
  role: "assistant" | "user" | "toolResult" | "system" | string;
  content: AssistantMessage["content"];
  stopReason?: string;
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isWorkflowOutcome(value: unknown): value is WorkflowOutcome {
  return value === "success" || value === "partial" || value === "failed";
}

function extractTextFromMessageContent(content: AssistantMessage["content"]): string {
  const parts = content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text);
  return parts.join("\n").trim();
}

export function getLastAssistantMessage(
  messages: AgentEndEventMessages,
): AgentEndEventMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "assistant") return message;
  }
  return null;
}

export function extractLastAssistantText(messages: AgentEndEventMessages): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;

    const text = extractTextFromMessageContent(message.content);
    if (text) return text;
  }
  return "";
}

export function extractLastUserText(messages: AgentEndEventMessages): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;

    const text = extractTextFromMessageContent(message.content);
    if (text) return text;
  }
  return "";
}

export function hasRequiredWorkflowFooter(text: string): boolean {
  return /(?:^|\n)\s*Result\s*:\s*(success|partial|failed)\b/i.test(text) &&
    /(?:^|\n)\s*Confidence\s*:\s*([0-9]{1,3}(?:\.[0-9]+)?%?)/i.test(text);
}

export function isEmptyTerminalAssistantResponse(
  messages: AgentEndEventMessages,
): boolean {
  const lastAssistant = getLastAssistantMessage(messages);
  if (!lastAssistant || lastAssistant.stopReason !== "stop") return false;

  return !lastAssistant.content.some((item) => {
    if (item.type === "toolCall") return true;
    if (item.type === "text") return item.text.trim().length > 0;
    return false;
  });
}

export function inferOutcomeFromText(text: string): {
  outcome: WorkflowOutcome;
  confidence: number;
  strictViolation?: string;
} {
  const resultMatch = text.match(/(?:^|\n)\s*Result\s*:\s*(success|partial|failed)\b/i);
  const confidenceMatch = text.match(/(?:^|\n)\s*Confidence\s*:\s*([0-9]{1,3}(?:\.[0-9]+)?%?)/i);

  if (!resultMatch || !confidenceMatch) {
    const missingFields: string[] = [];
    if (!resultMatch) missingFields.push("Result");
    if (!confidenceMatch) missingFields.push("Confidence");

    return {
      outcome: "failed",
      confidence: 0,
      strictViolation: `Missing required footer field(s): ${missingFields.join(", ")}.`,
    };
  }

  const outcomeCandidate = resultMatch[1].toLowerCase();
  if (!isWorkflowOutcome(outcomeCandidate)) {
    return {
      outcome: "failed",
      confidence: 0,
      strictViolation: `Invalid Result value '${resultMatch[1]}'. Use success|partial|failed.`,
    };
  }

  const outcome = outcomeCandidate;
  const raw = confidenceMatch[1] ?? "";
  let confidence: number;
  if (raw.endsWith("%")) {
    confidence = Number(raw.slice(0, -1)) / 100;
  } else {
    const numeric = Number(raw);
    confidence = numeric > 1 ? numeric / 100 : numeric;
  }

  if (!Number.isFinite(confidence)) {
    return {
      outcome: "failed",
      confidence: 0,
      strictViolation: "Invalid Confidence value. Use a numeric value like `0.82`.",
    };
  }

  return { outcome, confidence: clampConfidence(confidence) };
}

type AgentEndEventMessages = AgentEndEventMessage[];
