import path from "node:path";
import { readTextIfExists } from "../lib/io";

export type HookLifecycle = "on_session_start" | "pre_risky_action" | "on_session_end";
export type HookType = "markdown" | "policy";

export interface HookEntry {
  type: HookType;
  path?: string;
  policy?: string;
  description?: string;
}

export interface HookConfig {
  on_session_start: HookEntry[];
  pre_risky_action: HookEntry[];
  on_session_end: HookEntry[];
}

export interface HookConfigLoadResult {
  config: HookConfig;
  warnings: string[];
}

export const DEFAULT_HOOK_CONFIG: HookConfig = {
  on_session_start: [{ type: "markdown", path: "bootstrap.md", description: "Load compliance baseline and escalation triggers." }],
  pre_risky_action: [{ type: "policy", policy: "require_human_checker_for_high_risk", description: "Block high-risk execution without explicit approval." }],
  on_session_end: [{ type: "markdown", path: "teardown.md", description: "Persist compliance-relevant summary and next checks." }],
};

export function cloneHookConfig(config: HookConfig): HookConfig {
  return {
    on_session_start: config.on_session_start.map((entry) => ({ ...entry })),
    pre_risky_action: config.pre_risky_action.map((entry) => ({ ...entry })),
    on_session_end: config.on_session_end.map((entry) => ({ ...entry })),
  };
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isHookLifecycle(value: string): value is HookLifecycle {
  return value === "on_session_start" || value === "pre_risky_action" || value === "on_session_end";
}

export function parseHooksConfig(raw: string, defaults: HookConfig = DEFAULT_HOOK_CONFIG): HookConfigLoadResult {
  const warnings: string[] = [];
  const parsed: HookConfig = {
    on_session_start: [],
    pre_risky_action: [],
    on_session_end: [],
  };

  let currentLifecycle: HookLifecycle | null = null;
  let currentEntry: HookEntry | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "hooks:") continue;

    const lifecycleMatch = line.match(/^\s{2}([a-z_]+):\s*$/);
    if (lifecycleMatch) {
      const lifecycle = lifecycleMatch[1];
      if (isHookLifecycle(lifecycle)) {
        currentLifecycle = lifecycle;
      } else {
        currentLifecycle = null;
        warnings.push(`Unknown hook lifecycle '${lifecycle}' ignored.`);
      }
      currentEntry = null;
      continue;
    }

    const typeMatch = line.match(/^\s{4}-\s+type:\s+([a-z_]+)\s*$/);
    if (typeMatch) {
      if (!currentLifecycle) {
        warnings.push("Found hook entry before lifecycle section; entry ignored.");
        currentEntry = null;
        continue;
      }
      const type = stripOuterQuotes(typeMatch[1]);
      if (type !== "markdown" && type !== "policy") {
        warnings.push(`Unsupported hook entry type '${type}' under ${currentLifecycle}; entry ignored.`);
        currentEntry = null;
        continue;
      }
      currentEntry = { type };
      parsed[currentLifecycle].push(currentEntry);
      continue;
    }

    const propertyMatch = line.match(/^\s{6}(path|policy|description):\s+(.+)\s*$/);
    if (propertyMatch && currentEntry) {
      const key = propertyMatch[1];
      if (key === "path" || key === "policy" || key === "description") {
        currentEntry[key] = stripOuterQuotes(propertyMatch[2]);
      }
    }
  }

  const merged = cloneHookConfig(defaults);
  for (const lifecycle of ["on_session_start", "pre_risky_action", "on_session_end"] as const) {
    if (parsed[lifecycle].length === 0) {
      warnings.push(`Hook lifecycle '${lifecycle}' missing entries in hooks.yaml; default policy used.`);
      continue;
    }
    merged[lifecycle] = parsed[lifecycle];
  }

  return {
    config: merged,
    warnings,
  };
}

export async function loadHooksConfig(hooksConfigPath: string, defaults: HookConfig = DEFAULT_HOOK_CONFIG): Promise<HookConfigLoadResult> {
  const raw = await readTextIfExists(hooksConfigPath);
  if (!raw.trim()) {
    return {
      config: cloneHookConfig(defaults),
      warnings: ["hooks.yaml missing or empty; default hook policy used."],
    };
  }
  return parseHooksConfig(raw, defaults);
}

export async function buildLifecycleHookMarkdown(params: {
  lifecycle: HookLifecycle;
  activeHookConfig: HookConfig;
  hooksDir: string;
  readTextIfExists?: (filePath: string) => Promise<string>;
}): Promise<string> {
  const readTextFn = params.readTextIfExists ?? readTextIfExists;
  const entries = params.activeHookConfig[params.lifecycle].filter((entry) => entry.type === "markdown" && typeof entry.path === "string");
  if (entries.length === 0) return "";

  const sections: string[] = [];
  for (const entry of entries) {
    const hookPath = path.join(params.hooksDir, entry.path!);
    const content = await readTextFn(hookPath);
    sections.push(
      content.trim()
        ? `[${params.lifecycle}:${entry.path}]\n${content.trim()}`
        : `[${params.lifecycle}:${entry.path}]\n(Missing hook markdown file or empty content)`,
    );
  }

  return sections.join("\n\n");
}
