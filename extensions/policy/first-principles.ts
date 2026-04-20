import type { ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { MUTATION_BASH_PATTERN, POSTFLIGHT_LINE_REGEX, PREFLIGHT_LINE_REGEX } from "../lib/constants";

export type PolicyMode = "monitor" | "warn" | "enforce";
export type PolicyOutcome = "allow" | "warn" | "block";
export type PreflightClarify = "yes" | "no";
export type PreflightSource = "manual" | "auto";
export type PostflightResult = "pass" | "fail" | "not-run";

export interface FirstPrinciplesConfig {
  preflightMode: PolicyMode;
  postflightMode: PolicyMode;
  responseComplianceMode: PolicyMode;
}

export interface PreflightRecord {
  at: string;
  skill: string;
  reason: string;
  clarify: PreflightClarify;
  raw: string;
  source: PreflightSource;
}

export interface PostflightRecord {
  at: string;
  verify: string;
  result: PostflightResult;
  raw: string;
}

export function parsePolicyMode(value: string | undefined): PolicyMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "monitor" || normalized === "warn" || normalized === "enforce") return normalized;
  return null;
}

export function parseFirstPrinciplesConfig(raw: string): { config: FirstPrinciplesConfig; warnings: string[] } {
  if (!raw.trim()) {
    return {
      config: { preflightMode: "warn", postflightMode: "warn", responseComplianceMode: "warn" },
      warnings: ["first-principles-gate.yaml missing or empty; using defaults (warn/warn)."],
    };
  }

  const warnings: string[] = [];
  let preflightMode: PolicyMode | null = null;
  let postflightMode: PolicyMode | null = null;
  let responseComplianceMode: PolicyMode | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(preflight_mode|postflight_mode|response_compliance):\s*([a-zA-Z_-]+)\s*$/);
    if (!match) continue;

    const mode = parsePolicyMode(match[2]);
    if (!mode) {
      warnings.push(`Invalid ${match[1]} value '${match[2]}' in first-principles-gate.yaml.`);
      continue;
    }

    if (match[1] === "preflight_mode") preflightMode = mode;
    if (match[1] === "postflight_mode") postflightMode = mode;
    if (match[1] === "response_compliance") responseComplianceMode = mode;
  }

  return {
    config: {
      preflightMode: preflightMode ?? "warn",
      postflightMode: postflightMode ?? "warn",
      responseComplianceMode: responseComplianceMode ?? "warn",
    },
    warnings,
  };
}

export function parsePreflightLine(line: string, nowIso: () => string): PreflightRecord | null {
  const match = line.trim().match(PREFLIGHT_LINE_REGEX);
  if (!match) return null;

  const clarify = match[3];
  if (clarify !== "yes" && clarify !== "no") return null;

  return {
    at: nowIso(),
    skill: match[1],
    reason: match[2],
    clarify,
    raw: line.trim(),
    source: "manual",
  };
}

export function parsePostflightLine(line: string, nowIso: () => string): PostflightRecord | null {
  const match = line.trim().match(POSTFLIGHT_LINE_REGEX);
  if (!match) return null;

  const result = match[2];
  if (result !== "pass" && result !== "fail" && result !== "not-run") return null;

  return {
    at: nowIso(),
    verify: match[1],
    result,
    raw: line.trim(),
  };
}

export function extractPostflightFromAssistantText(text: string, nowIso: () => string): PostflightRecord | null {
  for (const line of text.split(/\r?\n/)) {
    const parsed = parsePostflightLine(line, nowIso);
    if (parsed) return parsed;
  }

  return null;
}

export function isMutationCapableBash(command: string): boolean {
  return MUTATION_BASH_PATTERN.test(command);
}

export function isMutationToolCall(event: ToolCallEvent): boolean {
  if (isToolCallEventType("edit", event) || isToolCallEventType("write", event)) return true;
  if (!isToolCallEventType("bash", event)) return false;
  return isMutationCapableBash(event.input.command);
}

export function modeOutcome(mode: PolicyMode, violation: boolean): PolicyOutcome {
  if (!violation) return "allow";
  if (mode === "enforce") return "block";
  if (mode === "warn") return "warn";
  return "allow";
}

export function buildPreflightRawLine(record: PreflightRecord): string {
  return `Preflight: skill=${record.skill} reason="${record.reason}" clarify=${record.clarify}`;
}
