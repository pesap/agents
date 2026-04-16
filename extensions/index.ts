import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = resolveAgentDir(PACKAGE_ROOT);
const SKILLFLOWS_DIR = path.join(AGENT_DIR, "skillflows");
const COMMANDS_DIR = path.join(PACKAGE_ROOT, "commands");
const INTERCEPTED_COMMANDS_DIR = path.join(PACKAGE_ROOT, "intercepted-commands");

const AGENT_STATE_TYPE = "pesap-agent-state";

const DEFAULT_DEBUG_PARALLEL = 3;
const DEFAULT_FEATURE_PARALLEL = 2;

const LEARNING_STORE_DIRNAME = "pesap-agent";
const LEARNING_VERSION = 1;
const MEMORY_TAIL_LINES = 20;
const PROMOTION_MIN_OBSERVATIONS = 3;
const PROMOTION_SUCCESS_THRESHOLD = 0.75;
const PROMOTION_IMPROVEMENT_THRESHOLD = 0.4;
const HOOKS_DIR = path.join(AGENT_DIR, "hooks");
const HOOKS_CONFIG_PATH = path.join(HOOKS_DIR, "hooks.yaml");
const RISK_APPROVAL_TYPE = "pesap-risk-approval";
const RISK_APPROVAL_TTL_MINUTES = 20;
const LOW_CONFIDENCE_THRESHOLD = 0.7;
const RUNTIME_DAILYLOG_PATH = path.join(AGENT_DIR, "memory", "runtime", "live", "dailylog.md");
const GLOBAL_PI_SETTINGS_PATH = path.join(homedir(), ".pi", "agent", "settings.json");
const PACKAGE_SKILLS_PATH = path.join(PACKAGE_ROOT, "agent", "skills");
const FIRST_PRINCIPLES_CONFIG_PATH = path.join(AGENT_DIR, "compliance", "first-principles-gate.yaml");
const PREFLIGHT_STATE_TYPE = "pesap-preflight-state";
const POSTFLIGHT_EVENT_TYPE = "pesap-postflight-event";
const POLICY_EVENT_TYPE = "pesap-policy-event";

type WorkflowType = "debug" | "feature" | "review" | "git-review" | "simplify" | "learn-skill";
type WorkflowOutcome = "success" | "partial" | "failed";

const REVIEW_COMMAND_SOURCE = "https://github.com/earendil-works/pi-review";
const GIT_REVIEW_COMMAND_SOURCE = "https://piechowski.io/post/git-commands-before-reading-code/";
const SIMPLIFY_COMMAND_SOURCE = "https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md";

type ReviewMode = "uncommitted" | "branch" | "commit" | "pr" | "folder";
type HookLifecycle = "on_session_start" | "pre_risky_action" | "on_session_end";
type HookType = "markdown" | "policy";
type RiskCategory = "destructive_operation" | "secret_or_pii_exposure_risk";

interface ParsedReviewArgs {
  mode: ReviewMode;
  branch?: string;
  commit?: string;
  pr?: string;
  paths?: string[];
  extraInstruction?: string;
  error?: string;
}

interface PendingWorkflow {
  id: string;
  type: WorkflowType;
  input: string;
  flags: Record<string, unknown>;
  startedAt: string;
  runFile: string;
  mutationCount: number;
  policyWarnings: string[];
}

interface LearningPaths {
  root: string;
  memoryDir: string;
  runsDir: string;
  skillsDir: string;
  learningJsonl: string;
  memoryMd: string;
  promotionQueue: string;
  stateJson: string;
}

interface LearningObservation {
  version: number;
  id: string;
  timestamp: string;
  taskType: WorkflowType;
  input: string;
  flags: Record<string, unknown>;
  outcome: WorkflowOutcome;
  confidence: number;
  evidenceSnippet: string;
  workflowId: string;
}

interface LearningState {
  hints: Record<
    string,
    {
      kind: "promote" | "improve";
      sampleSize: number;
      scoreRate: number;
      at: string;
    }
  >;
}

interface HookEntry {
  type: HookType;
  path?: string;
  policy?: string;
  description?: string;
}

interface HookConfig {
  on_session_start: HookEntry[];
  pre_risky_action: HookEntry[];
  on_session_end: HookEntry[];
}

interface HookConfigLoadResult {
  config: HookConfig;
  warnings: string[];
}

interface RiskApproval {
  reason: string;
  approvedAt: string;
  expiresAt: string;
}

interface RiskEvent {
  at: string;
  command: string;
  category: RiskCategory;
  detail: string;
  approved: boolean;
}

type PolicyMode = "monitor" | "warn" | "enforce";

type PolicyPhase = "preflight" | "postflight";

interface FirstPrinciplesConfig {
  preflightMode: PolicyMode;
  postflightMode: PolicyMode;
}

interface PreflightRecord {
  at: string;
  skill: string;
  reason: string;
  clarify: "yes" | "no";
  raw: string;
  source: "manual" | "auto";
}

interface PostflightRecord {
  at: string;
  verify: string;
  result: "pass" | "fail" | "not-run";
  raw: string;
}

interface PolicyEvent {
  at: string;
  phase: PolicyPhase;
  mode: PolicyMode;
  outcome: "allow" | "warn" | "block";
  detail: string;
  toolName?: string;
}

let pendingWorkflow: PendingWorkflow | null = null;
let agentEnabled = false;
const learningPathCache = new Map<string, LearningPaths>();
const DEFAULT_HOOK_CONFIG: HookConfig = {
  on_session_start: [{ type: "markdown", path: "bootstrap.md", description: "Load compliance baseline and escalation triggers." }],
  pre_risky_action: [{ type: "policy", policy: "require_human_checker_for_high_risk", description: "Block high-risk execution without explicit approval." }],
  on_session_end: [{ type: "markdown", path: "teardown.md", description: "Persist compliance-relevant summary and next checks." }],
};
let activeHookConfig: HookConfig = DEFAULT_HOOK_CONFIG;
let riskApproval: RiskApproval | null = null;
let riskEvents: RiskEvent[] = [];
let lowConfidenceEvents: Array<{ at: string; workflowId: string; workflowType: WorkflowType; confidence: number; outcome: WorkflowOutcome }> = [];
let firstPrinciplesConfig: FirstPrinciplesConfig = { preflightMode: "warn", postflightMode: "warn" };
let activePreflight: PreflightRecord | null = null;
let latestPostflight: PostflightRecord | null = null;
let policyEvents: PolicyEvent[] = [];

const PREFLIGHT_LINE_REGEX = /^Preflight:\s+skill=([a-zA-Z0-9_.-]+|none)\s+reason="([^"]{1,200})"\s+clarify=(yes|no)\s*$/;
const POSTFLIGHT_LINE_REGEX = /^Postflight:\s+verify="([^"]{1,280})"\s+result=(pass|fail|not-run)\s*$/;
const MUTATION_BASH_PATTERN = /(?:^|\n|[;|&]{1,2})\s*(?:git\s+(?:add|apply|am|commit|checkout|switch|merge|rebase|cherry-pick|revert|reset|restore|clean|stash|tag|branch|push|pull)|rm\b|mv\b|cp\b|mkdir\b|rmdir\b|touch\b|chmod\b|chown\b|sed\b[^\n;|&]*\s-i\b|perl\b[^\n;|&]*\s-i\b|tee\b|truncate\b|dd\b)/m;
const POSTFLIGHT_INSTRUCTION = "Instruction: If you ran any mutation tool (edit/write/mutating bash), include exactly one line: `Postflight: verify=\"<command_or_check>\" result=<pass|fail|not-run>`.";

const BLOCKED_COMMAND_PATTERNS = {
  pip: /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?pip\s*(?:$|\s)/m,
  pip3: /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?pip3\s*(?:$|\s)/m,
  poetry: /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?poetry\s*(?:$|\s)/m,
  pythonPip: /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*pip\b|\s-mpip\b)/m,
  pythonVenv: /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*venv\b|\s-mvenv\b)/m,
  pythonPyCompile:
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*py_compile\b|\s-mpy_compile\b)/m,
  pythonExplicitPath:
    /(?:^|\n|[;|&]{1,2})\s*(?:(?:env(?:\s+-\S+(?:\s+\S+)?)?(?:\s+[A-Za-z_][A-Za-z0-9_]*=\S+)*\s+)|(?:command|builtin|exec|nohup|time)(?:\s+-\S+(?:\s+\S+)?)*\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:\S+\/)python(?:3(?:\.\d+)?)?\b(?=\s|$)/m,
};

const UV_INSTALL_GUIDANCE = [
  "To install a package for a script: uv run --with PACKAGE python script.py",
  "To add a dependency to the project: uv add PACKAGE",
];

const DESTRUCTIVE_COMMAND_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  {
    pattern: /(?:^|\n|[;|&]{1,2})\s*(?:sudo\s+)?rm\b[^\n;|&]*\s-(?:[^\n;|&]*r[^\n;|&]*f|[^\n;|&]*f[^\n;|&]*r)\b/m,
    detail: "recursive forced delete",
  },
  { pattern: /(?:^|\n|[;|&]{1,2})\s*(?:sudo\s+)?find\b[^\n;|&]*\s-delete\b/m, detail: "find -delete" },
  { pattern: /(?:^|\n|[;|&]{1,2})\s*git\s+reset\b[^\n;|&]*\s--hard\b/m, detail: "git reset --hard" },
  { pattern: /(?:^|\n|[;|&]{1,2})\s*git\s+clean\b[^\n;|&]*\s-[^\n;|&]*f[^\n;|&]*\b/m, detail: "git clean -f" },
  {
    pattern: /(?:^|\n|[;|&]{1,2})\s*git\s+push\b[^\n;|&]*(?:\s--force(?:-with-lease)?\b|\s-[^\n;|&]*f[^\n;|&]*\b)/m,
    detail: "forced git push",
  },
  { pattern: /(?:^|\n|[;|&]{1,2})\s*(?:sudo\s+)?mkfs\.[a-z0-9]+\b/m, detail: "filesystem formatting" },
];
const SENSITIVE_COMMAND_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  {
    pattern: /(?:^|\n|[;|&]{1,2})\s*(?:cat|less|more|head|tail)\s+[^\n;|&]*(?:\.env(?:\.[\w-]+)?|id_rsa|id_ed25519|\.pem|credentials?|secrets?)\b/m,
    detail: "potential secret material read",
  },
  {
    pattern: /(?:^|\n|[;|&]{1,2})\s*(?:printenv|env)\b[^\n;|&]*(?:token|secret|password|api[_-]?key)\b/i,
    detail: "potential secret environment output",
  },
];

function formatBlockedCommandMessage(headline: string, guidance: string[]): string {
  return [headline, "", ...guidance.map((line) => `  ${line}`), ""].join("\n");
}
function getBlockedCommandMessage(command: string): string | null {
  if (BLOCKED_COMMAND_PATTERNS.pip.test(command)) {
    return formatBlockedCommandMessage("Error: pip is disabled while pesap-agent is active. Use uv instead:", UV_INSTALL_GUIDANCE);
  }

  if (BLOCKED_COMMAND_PATTERNS.pip3.test(command)) {
    return formatBlockedCommandMessage("Error: pip3 is disabled while pesap-agent is active. Use uv instead:", UV_INSTALL_GUIDANCE);
  }

  if (BLOCKED_COMMAND_PATTERNS.poetry.test(command)) {
    return formatBlockedCommandMessage("Error: poetry is disabled while pesap-agent is active. Use uv instead:", [
      "To initialize a project: uv init",
      "To add a dependency: uv add PACKAGE",
      "To sync dependencies: uv sync",
      "To run commands: uv run COMMAND",
    ]);
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonPip.test(command)) {
    return formatBlockedCommandMessage("Error: 'python -m pip' is disabled while pesap-agent is active. Use uv instead:", UV_INSTALL_GUIDANCE);
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonVenv.test(command)) {
    return formatBlockedCommandMessage("Error: 'python -m venv' is disabled while pesap-agent is active. Use uv instead:", [
      "To create a virtual environment: uv venv",
    ]);
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonPyCompile.test(command)) {
    return formatBlockedCommandMessage(
      "Error: 'python -m py_compile' is disabled while pesap-agent is active because it writes .pyc files to __pycache__.",
      ["To verify syntax without bytecode output: uv run python -m ast path/to/file.py >/dev/null"],
    );
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonExplicitPath.test(command)) {
    return formatBlockedCommandMessage(
      "Error: Direct path-qualified Python executables (for example `/usr/bin/python3`) are disabled while pesap-agent is active.",
      [
        "Use `python` or `python3` so pesap-agent can route through uv.",
        "For explicit interpreter control, run: uv run python ...",
      ],
    );
  }
  return null;
}

function prependInterceptedCommandsPath(command: string): string {
  const escapedPath = INTERCEPTED_COMMANDS_DIR.replace(/\"/g, '\\\"');
  return `export PATH="${escapedPath}:$PATH"\n${command}`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "new-skill";
}

function resolveAgentDir(packageRoot: string): string {
  const candidates = ["agent", "pesap-agent"].map((name) => path.join(packageRoot, name));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await readText(filePath);
  } catch {
    return "";
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureFile(filePath: string, initialContent: string): Promise<void> {
  if (await exists(filePath)) return;
  await fs.writeFile(filePath, initialContent, "utf8");
}

async function appendLine(filePath: string, line: string): Promise<void> {
  await fs.appendFile(filePath, `${line}\n`, "utf8");
}

async function ensureSkillPathInSettings(settingsPath: string, skillPath: string): Promise<{ added: boolean; warning?: string }> {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    const raw = await readTextIfExists(settingsPath);
    const settings = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
    const skills = Array.isArray(settings.skills) ? settings.skills.filter((value): value is string => typeof value === "string") : [];

    if (skills.includes(skillPath)) {
      return { added: false };
    }

    await fs.writeFile(settingsPath, `${JSON.stringify({ ...settings, skills: [...skills, skillPath] }, null, 2)}\n`, "utf8");
    return { added: true };
  } catch (error) {
    return {
      added: false,
      warning: `Failed to persist skills path in ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function cloneHookConfig(config: HookConfig): HookConfig {
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

function parseHooksConfig(raw: string): HookConfigLoadResult {
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
      const key = propertyMatch[1] as "path" | "policy" | "description";
      currentEntry[key] = stripOuterQuotes(propertyMatch[2]);
    }
  }

  const merged = cloneHookConfig(DEFAULT_HOOK_CONFIG);
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

async function loadHooksConfig(): Promise<HookConfigLoadResult> {
  const raw = await readTextIfExists(HOOKS_CONFIG_PATH);
  if (!raw.trim()) {
    return {
      config: cloneHookConfig(DEFAULT_HOOK_CONFIG),
      warnings: ["hooks.yaml missing or empty; default hook policy used."],
    };
  }
  return parseHooksConfig(raw);
}

function parsePolicyMode(value: string | undefined): PolicyMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "monitor" || normalized === "warn" || normalized === "enforce") return normalized;
  return null;
}

async function loadFirstPrinciplesConfig(): Promise<{ config: FirstPrinciplesConfig; warnings: string[] }> {
  const raw = await readTextIfExists(FIRST_PRINCIPLES_CONFIG_PATH);
  if (!raw.trim()) {
    return {
      config: { preflightMode: "warn", postflightMode: "warn" },
      warnings: ["first-principles-gate.yaml missing or empty; using defaults (warn/warn)."],
    };
  }

  const warnings: string[] = [];
  let preflightMode: PolicyMode | null = null;
  let postflightMode: PolicyMode | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(preflight_mode|postflight_mode):\s*([a-zA-Z_-]+)\s*$/);
    if (!match) continue;

    const mode = parsePolicyMode(match[2]);
    if (!mode) {
      warnings.push(`Invalid ${match[1]} value '${match[2]}' in first-principles-gate.yaml.`);
      continue;
    }

    if (match[1] === "preflight_mode") preflightMode = mode;
    if (match[1] === "postflight_mode") postflightMode = mode;
  }

  return {
    config: {
      preflightMode: preflightMode ?? "warn",
      postflightMode: postflightMode ?? "warn",
    },
    warnings,
  };
}

function hasValidRiskApproval(): boolean {
  if (!riskApproval) return false;
  return Date.parse(riskApproval.expiresAt) > Date.now();
}

function getRiskApprovalFromSession(ctx: ExtensionContext): RiskApproval | null {
  let approval: RiskApproval | null = null;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "custom") continue;
    const custom = entry as { customType?: string; data?: { approved?: unknown; reason?: unknown; approvedAt?: unknown; expiresAt?: unknown } };
    if (custom.customType !== RISK_APPROVAL_TYPE) continue;
    if (custom.data?.approved !== true) {
      approval = null;
      continue;
    }
    if (
      typeof custom.data.reason === "string"
      && typeof custom.data.approvedAt === "string"
      && typeof custom.data.expiresAt === "string"
    ) {
      approval = {
        reason: custom.data.reason,
        approvedAt: custom.data.approvedAt,
        expiresAt: custom.data.expiresAt,
      };
    }
  }
  if (!approval) return null;
  return Date.parse(approval.expiresAt) > Date.now() ? approval : null;
}

function getPreflightFromSession(ctx: ExtensionContext): PreflightRecord | null {
  let record: PreflightRecord | null = null;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "custom") continue;
    const custom = entry as {
      customType?: string;
      data?: {
        at?: unknown;
        skill?: unknown;
        reason?: unknown;
        clarify?: unknown;
        raw?: unknown;
        source?: unknown;
      };
    };
    if (custom.customType !== PREFLIGHT_STATE_TYPE) continue;
    if (!custom.data) continue;

    if (
      typeof custom.data.at === "string"
      && typeof custom.data.skill === "string"
      && typeof custom.data.reason === "string"
      && (custom.data.clarify === "yes" || custom.data.clarify === "no")
      && typeof custom.data.raw === "string"
      && (custom.data.source === "manual" || custom.data.source === "auto")
    ) {
      record = {
        at: custom.data.at,
        skill: custom.data.skill,
        reason: custom.data.reason,
        clarify: custom.data.clarify,
        raw: custom.data.raw,
        source: custom.data.source,
      };
    }
  }
  return record;
}

function requiresCheckerForHighRisk(config: HookConfig): boolean {
  return config.pre_risky_action.some((entry) => entry.type === "policy" && entry.policy === "require_human_checker_for_high_risk");
}

function classifyRiskyCommand(command: string): { category: RiskCategory; detail: string } | null {
  for (const entry of DESTRUCTIVE_COMMAND_PATTERNS) {
    if (entry.pattern.test(command)) {
      return {
        category: "destructive_operation",
        detail: entry.detail,
      };
    }
  }
  for (const entry of SENSITIVE_COMMAND_PATTERNS) {
    if (entry.pattern.test(command)) {
      return {
        category: "secret_or_pii_exposure_risk",
        detail: entry.detail,
      };
    }
  }
  return null;
}

function buildRiskApprovalRequiredMessage(risk: { category: RiskCategory; detail: string }): string {
  return [
    `Error: High-risk command blocked (${risk.category}; ${risk.detail}).`,
    "Checker approval is required before executing high-risk actions.",
    "",
    "Run:",
    "  /approve-risk \"checker approved: <ticket/reason>\"",
    "",
    "Approval is one-time and expires automatically.",
  ].join("\n");
}

function recordRiskEvent(command: string, risk: { category: RiskCategory; detail: string }, approved: boolean, at: string): void {
  riskEvents.push({
    at,
    command: summarizeEvidence(command, 200),
    category: risk.category,
    detail: risk.detail,
    approved,
  });
}

function evaluateRiskPolicy(command: string): string | null {
  if (!requiresCheckerForHighRisk(activeHookConfig)) return null;
  const risk = classifyRiskyCommand(command);
  if (!risk) return null;

  const at = nowIso();
  if (!hasValidRiskApproval()) {
    recordRiskEvent(command, risk, false, at);
    return buildRiskApprovalRequiredMessage(risk);
  }

  recordRiskEvent(command, risk, true, at);
  riskApproval = null;
  return null;
}

function parseApproveRiskArgs(args: string): { reason: string; ttlMinutes: number; error?: string } {
  let rest = normalizeWhitespace(args);
  const ttlResult = removeFlag(rest, /(^|\s)--ttl\s+(\d+)(\s|$)/);
  rest = ttlResult.value;

  const ttlCandidate = Number(ttlResult.match?.[2] ?? RISK_APPROVAL_TTL_MINUTES);
  const ttlMinutes = Number.isFinite(ttlCandidate) ? Math.max(1, Math.min(120, Math.floor(ttlCandidate))) : RISK_APPROVAL_TTL_MINUTES;
  if (!rest) {
    return {
      reason: "",
      ttlMinutes,
      error: "Usage: /approve-risk <checker approval reason> [--ttl MINUTES]",
    };
  }

  return {
    reason: rest,
    ttlMinutes,
  };
}

function parsePreflightArgs(args: string): { record?: PreflightRecord; error?: string } {
  const candidate = args.trim();
  if (!candidate) {
    return {
      error: "Usage: /preflight Preflight: skill=<name|none> reason=\"<short>\" clarify=<yes|no>",
    };
  }

  const parsed = parsePreflightLine(candidate);
  if (!parsed) {
    return {
      error: "Invalid preflight. Expected: Preflight: skill=<name|none> reason=\"<short>\" clarify=<yes|no>",
    };
  }

  return { record: parsed };
}

function parsePostflightArgs(args: string): { record?: PostflightRecord; error?: string } {
  const candidate = args.trim();
  if (!candidate) {
    return {
      error: "Usage: /postflight Postflight: verify=\"<command_or_check>\" result=<pass|fail|not-run>",
    };
  }

  const parsed = parsePostflightLine(candidate);
  if (!parsed) {
    return {
      error: "Invalid postflight. Expected: Postflight: verify=\"<command_or_check>\" result=<pass|fail|not-run>",
    };
  }

  return { record: parsed };
}

async function buildLifecycleHookMarkdown(lifecycle: HookLifecycle): Promise<string> {
  const entries = activeHookConfig[lifecycle].filter((entry) => entry.type === "markdown" && typeof entry.path === "string");
  if (entries.length === 0) return "";

  const sections: string[] = [];
  for (const entry of entries) {
    const hookPath = path.join(HOOKS_DIR, entry.path!);
    const content = await readTextIfExists(hookPath);
    sections.push(
      content.trim()
        ? `[${lifecycle}:${entry.path}]\n${content.trim()}`
        : `[${lifecycle}:${entry.path}]\n(Missing hook markdown file or empty content)`,
    );
  }

  return sections.join("\n\n");
}

async function appendRuntimeDailyLog(line: string): Promise<void> {
  try {
    await appendLine(RUNTIME_DAILYLOG_PATH, line);
  } catch {
    // best-effort only
  }
}

async function runSessionEndHooks(pi: ExtensionAPI, ctx: Pick<ExtensionContext, "hasUI" | "ui">): Promise<void> {
  const teardownHooks = await buildLifecycleHookMarkdown("on_session_end");
  const summary = {
    at: nowIso(),
    riskEvents,
    lowConfidenceEvents,
    policyEvents,
    teardownHooksLoaded: Boolean(teardownHooks.trim()),
  };
  pi.appendEntry("pesap-hook-summary", summary);

  const executedHighRisk = riskEvents.filter((event) => event.approved).length;
  const blockedHighRisk = riskEvents.filter((event) => !event.approved).length;
  const blockedPolicy = policyEvents.filter((event) => event.outcome === "block").length;
  const warnedPolicy = policyEvents.filter((event) => event.outcome === "warn").length;
  notify(
    ctx,
    `Hook teardown summary: high-risk approved=${executedHighRisk}, blocked=${blockedHighRisk}, policy(block=${blockedPolicy},warn=${warnedPolicy}), low-confidence=${lowConfidenceEvents.length}.`,
    "info",
  );

  await appendRuntimeDailyLog(
    `- ${summary.at.slice(0, 10)}: hook-summary approved_high_risk=${executedHighRisk} blocked_high_risk=${blockedHighRisk} policy_blocked=${blockedPolicy} policy_warned=${warnedPolicy} low_confidence=${lowConfidenceEvents.length}`,
  );

  riskEvents = [];
  lowConfidenceEvents = [];
  policyEvents = [];
  riskApproval = null;
  activePreflight = null;
  latestPostflight = null;
}



function getAgentEnabledFromSession(ctx: ExtensionContext): boolean {
  let enabled = false;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "custom") continue;
    const custom = entry as { customType?: string; data?: { enabled?: unknown; initialized?: unknown } };
    if (custom.customType !== AGENT_STATE_TYPE) continue;
    if (typeof custom.data?.initialized === "boolean") {
      enabled = custom.data.initialized;
      continue;
    }
    if (typeof custom.data?.enabled === "boolean") {
      enabled = custom.data.enabled;
    }
  }
  return enabled;
}

function setAgentEnabledState(ctx: Pick<ExtensionContext, "hasUI" | "ui">, enabled: boolean): void {
  agentEnabled = enabled;
  setStatus(ctx, enabled ? "🐉 pesap-agent enabled" : undefined);
}

function ensureAgentEnabledForCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  source: WorkflowType,
): void {
  if (agentEnabled) return;
  setAgentEnabledState(ctx, true);
  pi.appendEntry(AGENT_STATE_TYPE, {
    initialized: true,
    enabled: true,
    source,
    at: nowIso(),
  });
  notify(ctx, `pesap-agent initialized automatically for /${source}.`, "info");
}

function removeFlag(input: string, pattern: RegExp): { value: string; match: RegExpMatchArray | null } {
  const match = input.match(pattern);
  if (!match) return { value: input, match: null };
  return { value: normalizeWhitespace(input.replace(pattern, " ")), match };
}

function parseDebugArgs(args: string): { problem: string; parallel: number; fix: boolean } {
  let rest = normalizeWhitespace(args);
  const fix = /(^|\s)--fix(\s|$)/.test(rest);
  rest = normalizeWhitespace(rest.replace(/(^|\s)--fix(\s|$)/g, " "));

  const parallelResult = removeFlag(rest, /(^|\s)--parallel\s+(\d+)(\s|$)/);
  rest = parallelResult.value;
  const parallel = Number(parallelResult.match?.[2] ?? DEFAULT_DEBUG_PARALLEL);

  return {
    problem: rest,
    parallel: Number.isFinite(parallel) && parallel > 0 ? parallel : DEFAULT_DEBUG_PARALLEL,
    fix,
  };
}

function parseFeatureArgs(args: string): { request: string; parallel: number; ship: boolean } {
  let rest = normalizeWhitespace(args);
  const ship = /(^|\s)--ship(\s|$)/.test(rest);
  rest = normalizeWhitespace(rest.replace(/(^|\s)--ship(\s|$)/g, " "));

  const parallelResult = removeFlag(rest, /(^|\s)--parallel\s+(\d+)(\s|$)/);
  rest = parallelResult.value;
  const parallel = Number(parallelResult.match?.[2] ?? DEFAULT_FEATURE_PARALLEL);

  return {
    request: rest,
    parallel: Number.isFinite(parallel) && parallel > 0 ? parallel : DEFAULT_FEATURE_PARALLEL,
    ship,
  };
}

function parseLearnSkillArgs(args: string): {
  topic: string;
  fromFile?: string;
  fromUrl?: string;
  dryRun: boolean;
} {
  let rest = normalizeWhitespace(args);
  const dryRun = /(^|\s)--dry-run(\s|$)/.test(rest);
  rest = normalizeWhitespace(rest.replace(/(^|\s)--dry-run(\s|$)/g, " "));

  const fromFileResult = removeFlag(rest, /(^|\s)--from-file\s+(\S+)(\s|$)/);
  rest = fromFileResult.value;
  let fromFile = fromFileResult.match?.[2];
  const fromUrlResult = removeFlag(rest, /(^|\s)--from-url\s+(\S+)(\s|$)/);
  rest = fromUrlResult.value;
  let fromUrl = fromUrlResult.match?.[2];

  const fromResult = removeFlag(rest, /(^|\s)--from\s+(\S+)(\s|$)/);
  rest = fromResult.value;
  const from = fromResult.match?.[2];

  if (from && !fromFile && !fromUrl) {
    if (/^(?:https?:\/\/|ssh:\/\/|file:\/\/|git@)/.test(from)) {
      fromUrl = from;
    } else {
      fromFile = from;
    }
  }
  return {
    topic: rest,
    fromFile,
    fromUrl,
    dryRun,
  };
}

function tokenizeArgs(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (quote) {
      if (char === "\\" && i + 1 < value.length) {
        current += value[i + 1];
        i += 1;
        continue;
      }

      if (char === quote) {
        quote = null;
        continue;
      }

      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function isResolvableReviewPath(entry: string, cwd: string): boolean {
  const value = entry.trim();
  if (!value) return false;
  if (existsSync(path.resolve(cwd, value))) return true;

  return (
    value === "." ||
    value === ".." ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("/") ||
    value.startsWith("~/") ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes(".")
  );
}

function parseReviewArgs(args: string, cwd: string, commandName = "review"): ParsedReviewArgs {
  const usage = `Usage: /${commandName} [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`;
  const trimmed = args.trim();
  if (!trimmed) {
    return { mode: "uncommitted" };
  }
  const tokens = tokenizeArgs(trimmed);
  const positional: string[] = [];
  let extraInstruction: string | undefined;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--extra") {
      const extra = tokens.slice(i + 1).join(" ").trim();
      if (!extra) {
        return { mode: "uncommitted", error: usage };
      }
      extraInstruction = extra;
      break;
    }
    positional.push(token);
  }
  if (positional.length === 0) {
    return { mode: "uncommitted", extraInstruction };
  }
  const [modeToken, ...rest] = positional;
  const mode = modeToken.toLowerCase();
  if (mode === "uncommitted") {
    if (rest.length > 0) {
      return { mode: "uncommitted", error: "`uncommitted` does not accept additional arguments." };
    }
    return { mode: "uncommitted", extraInstruction };
  }
  if (mode === "branch") {
    const branch = rest[0]?.trim();
    if (!branch || rest.length !== 1) {
      return { mode: "branch", error: `Usage: /${commandName} branch <base-branch> [--extra "focus"]` };
    }
    return { mode: "branch", branch, extraInstruction };
  }
  if (mode === "commit") {
    const commit = rest[0]?.trim();
    if (!commit || rest.length !== 1) {
      return { mode: "commit", error: `Usage: /${commandName} commit <sha> [--extra "focus"]` };
    }
    return { mode: "commit", commit, extraInstruction };
  }
  if (mode === "pr") {
    const pr = rest[0]?.trim();
    if (!pr || rest.length !== 1) {
      return { mode: "pr", error: `Usage: /${commandName} pr <number|url> [--extra "focus"]` };
    }
    return { mode: "pr", pr, extraInstruction };
  }
  if (mode === "folder" || mode === "file") {
    const paths = rest.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    if (paths.length === 0) {
      return { mode: "folder", error: `Usage: /${commandName} ${mode} <path ...> [--extra "focus"]` };
    }
    return { mode: "folder", paths, extraInstruction };
  }
  const directPaths = positional.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (directPaths.length > 0 && directPaths.every((entry) => isResolvableReviewPath(entry, cwd))) {
    return { mode: "folder", paths: directPaths, extraInstruction };
  }
  return {
    mode: "uncommitted",
    error: usage,
  };
}

function buildReviewTarget(parsed: ParsedReviewArgs): { summary: string; instruction: string; flags: Record<string, unknown> } {
  if (parsed.mode === "branch") {
    return {
      summary: `branch ${parsed.branch}`,
      instruction: [
        `Review changes against base branch \`${parsed.branch}\`.`,
        `Find merge base first, e.g. \`git merge-base HEAD ${parsed.branch}\`, then inspect diff from that SHA.`,
      ].join(" "),
      flags: { mode: "branch", branch: parsed.branch },
    };
  }

  if (parsed.mode === "commit") {
    return {
      summary: `commit ${parsed.commit}`,
      instruction: `Review only changes introduced by commit \`${parsed.commit}\` (use \`git show ${parsed.commit}\` or equivalent).`,
      flags: { mode: "commit", commit: parsed.commit },
    };
  }

  if (parsed.mode === "pr") {
    return {
      summary: `pull request ${parsed.pr}`,
      instruction: [
        `Review pull request reference \`${parsed.pr}\`.`,
        "If GitHub CLI is available, resolve PR metadata and checkout or diff PR branch against its base branch before reviewing.",
      ].join(" "),
      flags: { mode: "pr", pr: parsed.pr },
    };
  }

  if (parsed.mode === "folder") {
    const paths = parsed.paths ?? [];
    return {
      summary: `paths ${paths.join(", ")}`,
      instruction: `Snapshot review only for files/folders in: ${paths.join(", ")}. Read files directly, do not assume git diff context.`,
      flags: { mode: "folder", paths },
    };
  }

  return {
    summary: "uncommitted changes",
    instruction: "Review staged, unstaged, and untracked changes in the current workspace.",
    flags: { mode: "uncommitted" },
  };
}

function buildSimplifyTarget(parsed: ParsedReviewArgs): { summary: string; instruction: string; flags: Record<string, unknown> } {
  if (parsed.mode === "branch") {
    return {
      summary: `branch ${parsed.branch}`,
      instruction: [
        `Simplify code changed against base branch \`${parsed.branch}\` while preserving exact behavior.`,
        `Find merge base first, e.g. \`git merge-base HEAD ${parsed.branch}\`, then work from that diff scope.`,
      ].join(" "),
      flags: { mode: "branch", branch: parsed.branch },
    };
  }

  if (parsed.mode === "commit") {
    return {
      summary: `commit ${parsed.commit}`,
      instruction: `Simplify only code introduced by commit \`${parsed.commit}\` while keeping output and API behavior unchanged.`,
      flags: { mode: "commit", commit: parsed.commit },
    };
  }

  if (parsed.mode === "pr") {
    return {
      summary: `pull request ${parsed.pr}`,
      instruction: [
        `Simplify code in pull request reference \`${parsed.pr}\` with no behavior drift.`,
        "If GitHub CLI is available, resolve PR metadata and checkout or diff PR branch against its base branch first.",
      ].join(" "),
      flags: { mode: "pr", pr: parsed.pr },
    };
  }

  if (parsed.mode === "folder") {
    const paths = parsed.paths ?? [];
    return {
      summary: `paths ${paths.join(", ")}`,
      instruction: `Simplify code only in these files/folders: ${paths.join(", ")}. Read files directly, do not assume git diff context.`,
      flags: { mode: "folder", paths },
    };
  }

  return {
    summary: "uncommitted changes",
    instruction: "Simplify staged, unstaged, and untracked code in the current workspace while preserving exact functionality.",
    flags: { mode: "uncommitted" },
  };
}
function hasSubagentTool(pi: ExtensionAPI): boolean {
  return pi.getAllTools().some((tool) => tool.name === "subagent");
}
function buildSkillTemplate(skillName: string, topic: string): string {
  const summary = topic || skillName;
  return [
    "---",
    `name: ${skillName}`,
    `description: Reusable workflow for ${summary}`,
    "---",
    "",
    "## Use when",
    `- ${summary}`,
    "",
    "## Steps",
    "1. Clarify input and intent.",
    "2. Execute the workflow with concise output.",
    "3. Validate outcomes before finalizing.",
    "",
    "## Output",
    "- Summary of actions",
    "- Validation evidence",
    "- Risks and follow-ups",
    "",
    "## Avoid when",
    "- The task needs a different specialized workflow",
  ].join("\n");
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const maybeText = (item as { type?: string; text?: string }).type === "text" ? (item as { text?: string }).text : null;
    if (typeof maybeText === "string") parts.push(maybeText);
  }

  return parts.join("\n").trim();
}

function extractLastAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: unknown };
    if (message?.role !== "assistant") continue;
    const text = extractTextFromContent(message.content);
    if (text) return text;
  }
  return "";
}

function inferOutcomeFromText(text: string): { outcome: WorkflowOutcome; confidence: number; strictViolation?: string } {
  const resultMatch = text.match(/(?:^|\n)\s*Result\s*:\s*(success|partial|failed)\b/i);
  const confidenceMatch = text.match(/(?:^|\n)\s*Confidence\s*:\s*([0-9]{1,3}(?:\.[0-9]+)?%?)/i);
  const missingFields: string[] = [];
  if (!resultMatch) missingFields.push("Result");
  if (!confidenceMatch) missingFields.push("Confidence");

  if (missingFields.length > 0) {
    return {
      outcome: "failed",
      confidence: 0,
      strictViolation: `Missing required footer field(s): ${missingFields.join(", ")}.`,
    };
  }

  const outcome = resultMatch[1].toLowerCase() as WorkflowOutcome;
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

function summarizeEvidence(text: string, max = 280): string {
  const compact = normalizeWhitespace(text);
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

function parsePreflightLine(line: string): PreflightRecord | null {
  const match = line.trim().match(PREFLIGHT_LINE_REGEX);
  if (!match) return null;
  return {
    at: nowIso(),
    skill: match[1],
    reason: match[2],
    clarify: match[3] as "yes" | "no",
    raw: line.trim(),
    source: "manual",
  };
}

function parsePostflightLine(line: string): PostflightRecord | null {
  const match = line.trim().match(POSTFLIGHT_LINE_REGEX);
  if (!match) return null;
  return {
    at: nowIso(),
    verify: match[1],
    result: match[2] as "pass" | "fail" | "not-run",
    raw: line.trim(),
  };
}

function extractPostflightFromAssistantText(text: string): PostflightRecord | null {
  for (const line of text.split(/\r?\n/)) {
    const parsed = parsePostflightLine(line);
    if (parsed) return parsed;
  }
  return null;
}

function isMutationCapableBash(command: string): boolean {
  return MUTATION_BASH_PATTERN.test(command);
}

function isMutationToolCall(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName === "edit" || toolName === "write") return true;
  if (toolName !== "bash") return false;
  const command = typeof input.command === "string" ? input.command : "";
  return isMutationCapableBash(command);
}

function modeOutcome(mode: PolicyMode, violation: boolean): "allow" | "warn" | "block" {
  if (!violation) return "allow";
  if (mode === "enforce") return "block";
  if (mode === "warn") return "warn";
  return "allow";
}

function addPolicyEvent(pi: ExtensionAPI, event: PolicyEvent): void {
  policyEvents.push(event);
  pi.appendEntry(POLICY_EVENT_TYPE, event);
}

function buildPreflightRawLine(record: PreflightRecord): string {
  return `Preflight: skill=${record.skill} reason="${record.reason}" clarify=${record.clarify}`;
}

function setStatus(ctx: Pick<ExtensionContext, "hasUI" | "ui">, label?: string): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("pesap", label);
}

function notify(ctx: Pick<ExtensionContext, "hasUI" | "ui">, message: string, type: "info" | "error" | "warning" | "success"): void {
  if (!ctx.hasUI) return;
  ctx.ui.notify(message, type);
}

function buildLearningPaths(root: string): LearningPaths {
  return {
    root,
    memoryDir: path.join(root, "memory"),
    runsDir: path.join(root, "runs"),
    skillsDir: path.join(root, "skills"),
    learningJsonl: path.join(root, "memory", "learning.jsonl"),
    memoryMd: path.join(root, "memory", "MEMORY.md"),
    promotionQueue: path.join(root, "memory", "promotion-queue.md"),
    stateJson: path.join(root, "state.json"),
  };
}

function getGlobalLearningPaths(): LearningPaths {
  return buildLearningPaths(path.join(homedir(), ".pi", LEARNING_STORE_DIRNAME));
}
async function resolveLearningPaths(cwd: string): Promise<LearningPaths> {
  const cached = learningPathCache.get(cwd);
  if (cached) return cached;
  const projectPiDir = path.join(cwd, ".pi");
  const useProjectLocal = await exists(projectPiDir);
  const paths = useProjectLocal
    ? buildLearningPaths(path.join(projectPiDir, LEARNING_STORE_DIRNAME))
    : getGlobalLearningPaths();
  learningPathCache.set(cwd, paths);
  return paths;
}

async function initializeLearningStore(paths: LearningPaths): Promise<void> {
  await fs.mkdir(paths.memoryDir, { recursive: true });
  await fs.mkdir(paths.runsDir, { recursive: true });
  await fs.mkdir(paths.skillsDir, { recursive: true });
  await ensureFile(paths.learningJsonl, "");
  await ensureFile(paths.memoryMd, "# MEMORY\n");
  await ensureFile(paths.promotionQueue, "# Promotion Queue\n");
  await ensureFile(paths.stateJson, JSON.stringify({ hints: {} }, null, 2));
}
async function ensureLearningStore(cwd: string): Promise<LearningPaths> {
  const primary = await resolveLearningPaths(cwd);

  try {
    await initializeLearningStore(primary);
    return primary;
  } catch {
    const fallback = getGlobalLearningPaths();
    await initializeLearningStore(fallback);
    learningPathCache.set(cwd, fallback);
    return fallback;
  }
}

async function readWorkflow(name: string): Promise<string> {
  const filePath = path.join(SKILLFLOWS_DIR, name);
  return readText(filePath);
}

async function readCommandPrompt(name: string): Promise<string> {
  const filePath = path.join(COMMANDS_DIR, name);
  return readText(filePath);
}

// Adapted from https://github.com/earendil-works/pi-review
async function loadProjectReviewGuidelines(cwd: string): Promise<string | null> {
  let currentDir = path.resolve(cwd);

  while (true) {
    const piDir = path.join(currentDir, ".pi");
    const guidelinesPath = path.join(currentDir, "REVIEW_GUIDELINES.md");

    const piStats = await fs.stat(piDir).catch(() => null);
    if (piStats?.isDirectory()) {
      const guidelineStats = await fs.stat(guidelinesPath).catch(() => null);
      if (!guidelineStats?.isFile()) return null;

      try {
        const content = await fs.readFile(guidelinesPath, "utf8");
        const trimmed = content.trim();
        return trimmed || null;
      } catch {
        return null;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

async function getLearningMemoryTail(cwd: string): Promise<string> {
  const paths = await ensureLearningStore(cwd);
  const memory = await readTextIfExists(paths.memoryMd);
  if (!memory.trim()) return "";

  const lines = memory
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return lines.slice(-MEMORY_TAIL_LINES).join("\n");
}

async function getLearnedSkillsList(cwd: string): Promise<string[]> {
  const paths = await ensureLearningStore(cwd);
  try {
    const entries = await fs.readdir(paths.skillsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function getBootstrapPayload(cwd: string): Promise<string> {
  const [soul, rules, duties, instructions, complianceProfile, startupHooks, memoryTail, learnedSkills] = await Promise.all([
    readTextIfExists(path.join(AGENT_DIR, "SOUL.md")),
    readTextIfExists(path.join(AGENT_DIR, "RULES.md")),
    readTextIfExists(path.join(AGENT_DIR, "DUTIES.md")),
    readTextIfExists(path.join(AGENT_DIR, "INSTRUCTIONS.md")),
    readTextIfExists(path.join(AGENT_DIR, "compliance", "risk-assessment.md")),
    buildLifecycleHookMarkdown("on_session_start"),
    getLearningMemoryTail(cwd),
    getLearnedSkillsList(cwd),
  ]);
  return [
    "Pesap agent bootstrap context (single-agent runtime):",
    "",
    "[SOUL]",
    soul.trim(),
    "",
    "[RULES]",
    rules.trim(),
    duties.trim() ? "" : "",
    duties.trim() ? "[DUTIES]" : "",
    duties.trim(),
    "",
    "[INSTRUCTIONS]",
    instructions.trim(),
    complianceProfile.trim() ? "" : "",
    complianceProfile.trim() ? "[COMPLIANCE PROFILE]" : "",
    complianceProfile.trim(),
    startupHooks.trim() ? "" : "",
    startupHooks.trim() ? "[LIFECYCLE HOOKS: on_session_start]" : "",
    startupHooks.trim(),
    memoryTail ? "" : "",
    memoryTail ? "[LEARNING MEMORY TAIL]" : "",
    memoryTail,
    learnedSkills.length > 0 ? "" : "",
    learnedSkills.length > 0 ? `[LEARNED SKILLS] ${learnedSkills.join(", ")}` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

async function enqueueWorkflow(
  pi: ExtensionAPI,
  workflowPromptName: string,
  workflowFileName: string,
  sections: string[],
): Promise<void> {
  const [promptTemplate, workflowSpec] = await Promise.all([
    readCommandPrompt(workflowPromptName),
    readWorkflow(workflowFileName),
  ]);

  const payload = [
    promptTemplate.trim(),
    "",
    "Workflow spec:",
    "```yaml",
    workflowSpec.trim(),
    "```",
    "",
    ...sections,
  ].join("\n");

  pi.sendUserMessage(payload);
}

async function beginWorkflowTracking(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  type: WorkflowType,
  input: string,
  flags: Record<string, unknown>,
): Promise<PendingWorkflow> {
  const paths = await ensureLearningStore(ctx.cwd);
  const id = makeId(type);
  const startedAt = nowIso();
  const runFile = path.join(paths.runsDir, `${id}.json`);

  const record = {
    version: LEARNING_VERSION,
    id,
    type,
    input,
    flags,
    status: "started",
    startedAt,
  };

  await fs.writeFile(runFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  pi.appendEntry("pesap-workflow-start", { id, type, input, flags, startedAt });

  const pending: PendingWorkflow = { id, type, input, flags, startedAt, runFile, mutationCount: 0, policyWarnings: [] };
  pendingWorkflow = pending;
  latestPostflight = null;

  const autoPreflightReason = summarizeEvidence(input, 120).replace(/"/g, "'") || "workflow requested";
  activePreflight = {
    at: startedAt,
    skill: type,
    reason: autoPreflightReason,
    clarify: "no",
    raw: `Preflight: skill=${type} reason="${autoPreflightReason}" clarify=no`,
    source: "auto",
  };
  pi.appendEntry(PREFLIGHT_STATE_TYPE, activePreflight);

  return pending;
}

async function readLearningState(paths: LearningPaths): Promise<LearningState> {
  try {
    const raw = await readText(paths.stateJson);
    const parsed = JSON.parse(raw) as Partial<LearningState>;
    return { hints: parsed.hints ?? {} };
  } catch {
    return { hints: {} };
  }
}

async function writeLearningState(paths: LearningPaths, state: LearningState): Promise<void> {
  await fs.writeFile(paths.stateJson, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readLearningEntries(paths: LearningPaths): Promise<LearningObservation[]> {
  const raw = await readTextIfExists(paths.learningJsonl);
  if (!raw.trim()) return [];

  const entries: LearningObservation[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as LearningObservation);
    } catch {
      // ignore malformed lines
    }
  }
  return entries;
}

async function maybeEmitPromotionHint(
  paths: LearningPaths,
  observation: LearningObservation,
  ctx: ExtensionContext,
): Promise<void> {
  const entries = await readLearningEntries(paths);
  const relevant = entries.filter((entry) => entry.taskType === observation.taskType).slice(-20);

  if (relevant.length < PROMOTION_MIN_OBSERVATIONS) return;

  const score = relevant.reduce((acc, entry) => {
    if (entry.outcome === "success") return acc + 1;
    if (entry.outcome === "partial") return acc + 0.5;
    return acc;
  }, 0);

  const scoreRate = score / relevant.length;
  const kind: "promote" | "improve" | null =
    scoreRate >= PROMOTION_SUCCESS_THRESHOLD
      ? "promote"
      : scoreRate <= PROMOTION_IMPROVEMENT_THRESHOLD
        ? "improve"
        : null;

  if (!kind) return;

  const state = await readLearningState(paths);
  const key = `${observation.taskType}:${kind}`;
  const previous = state.hints[key];

  if (previous && relevant.length - previous.sampleSize < PROMOTION_MIN_OBSERVATIONS) {
    return;
  }

  const now = nowIso();
  const summary =
    kind === "promote"
      ? `Observed ${relevant.length} ${observation.taskType} runs with a strong score (${scoreRate.toFixed(2)}). Suggest promoting repeated behavior into INSTRUCTIONS.md or a dedicated skillflow.`
      : `Observed ${relevant.length} ${observation.taskType} runs with low score (${scoreRate.toFixed(2)}). Suggest prompt/workflow refinement before further automation.`;

  await appendLine(
    paths.promotionQueue,
    `- ${now.slice(0, 10)} [${observation.taskType}/${kind}] ${summary}`,
  );

  state.hints[key] = {
    kind,
    sampleSize: relevant.length,
    scoreRate,
    at: now,
  };

  await writeLearningState(paths, state);

  notify(
    ctx,
    kind === "promote"
      ? `Learning hint: ${observation.taskType} is stable enough to promote.`
      : `Learning hint: ${observation.taskType} needs workflow tuning.`,
    "info",
  );
}

async function completeWorkflowTracking(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  workflow: PendingWorkflow,
  assistantText: string,
): Promise<void> {
  const inference = inferOutcomeFromText(assistantText);
  const paths = await ensureLearningStore(ctx.cwd);
  const finishedAt = nowIso();

  const postflightFromOutput = extractPostflightFromAssistantText(assistantText) ?? latestPostflight;
  const postflightMissing = workflow.mutationCount > 0 && !postflightFromOutput;
  const postflightDecision = modeOutcome(firstPrinciplesConfig.postflightMode, postflightMissing);

  addPolicyEvent(pi, {
    at: finishedAt,
    phase: "postflight",
    mode: firstPrinciplesConfig.postflightMode,
    outcome: postflightDecision,
    detail: postflightMissing
      ? "Missing postflight evidence after mutation."
      : `Postflight evidence present (${postflightFromOutput?.result ?? "unknown"}).`,
  });

  if (postflightDecision === "warn") {
    const warning = "Policy warning: Missing postflight evidence after mutation.";
    workflow.policyWarnings.push(warning);
    notify(ctx, warning, "warning");
  }

  if (postflightFromOutput) {
    latestPostflight = postflightFromOutput;
    pi.appendEntry(POSTFLIGHT_EVENT_TYPE, postflightFromOutput);
  }

  const hasPreflightWarning = workflow.policyWarnings.some((line) => line.includes("Missing valid preflight"));
  const qualityScore = Math.max(0, 100 - (hasPreflightWarning ? 50 : 0) - (postflightMissing ? 20 : 0));

  const strictViolations: string[] = [];
  if (inference.strictViolation) strictViolations.push(inference.strictViolation);
  if (postflightMissing && firstPrinciplesConfig.postflightMode === "enforce") {
    strictViolations.push("Missing required postflight evidence.");
  }

  const strictViolation = strictViolations.length > 0 ? strictViolations.join(" ") : null;
  const outcome: WorkflowOutcome = strictViolation ? "failed" : inference.outcome;
  const confidence = inference.confidence;

  const evidenceSnippet = strictViolation
    ? summarizeEvidence(`${strictViolation} ${assistantText}`)
    : summarizeEvidence(assistantText);

  const runRecord = {
    version: LEARNING_VERSION,
    id: workflow.id,
    type: workflow.type,
    input: workflow.input,
    flags: workflow.flags,
    startedAt: workflow.startedAt,
    finishedAt,
    outcome,
    confidence,
    strictViolation,
    evidenceSnippet,
    policy: {
      preflightMode: firstPrinciplesConfig.preflightMode,
      postflightMode: firstPrinciplesConfig.postflightMode,
      mutationCount: workflow.mutationCount,
      warnings: workflow.policyWarnings,
      postflightMissing,
      qualityScore,
      postflight: postflightFromOutput,
    },
  };

  await fs.writeFile(workflow.runFile, `${JSON.stringify(runRecord, null, 2)}\n`, "utf8");

  const observation: LearningObservation = {
    version: LEARNING_VERSION,
    id: makeId("obs"),
    timestamp: finishedAt,
    taskType: workflow.type,
    input: workflow.input,
    flags: workflow.flags,
    outcome,
    confidence,
    evidenceSnippet: runRecord.evidenceSnippet,
    workflowId: workflow.id,
  };

  await appendLine(paths.learningJsonl, JSON.stringify(observation));
  await appendLine(
    paths.memoryMd,
    `- ${finishedAt.slice(0, 10)} [${workflow.type}/${outcome}] ${summarizeEvidence(workflow.input, 180)} (confidence=${confidence.toFixed(2)}, q=${qualityScore})`,
  );

  pi.appendEntry("pesap-workflow-complete", {
    id: workflow.id,
    type: workflow.type,
    outcome,
    confidence,
    strictViolation,
    qualityScore,
    mutationCount: workflow.mutationCount,
    postflightMissing,
    at: finishedAt,
  });

  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    lowConfidenceEvents.push({
      at: finishedAt,
      workflowId: workflow.id,
      workflowType: workflow.type,
      confidence,
      outcome,
    });
  }

  await maybeEmitPromotionHint(paths, observation, ctx);

  notify(
    ctx,
    strictViolation
      ? `Workflow ${workflow.type} completed with strict-output violation (${strictViolation}). Marked failed.`
      : `Workflow ${workflow.type} completed (${outcome}, confidence=${confidence.toFixed(2)}, q=${qualityScore}).`,
    strictViolation ? "error" : "info",
  );

  if (workflow.mutationCount > 0) {
    activePreflight = null;
    latestPostflight = null;
  }
}

async function handleDebug(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parsed = parseDebugArgs(args);
  if (pendingWorkflow) {
    notify(ctx, `Workflow already running (${pendingWorkflow.type}). Wait for completion before starting another.`, "error");
    return;
  }
  if (!parsed.problem) {
    notify(ctx, "Usage: /debug <problem> [--parallel N] [--fix]", "error");
    return;
  }

  ensureAgentEnabledForCommand(pi, ctx, "debug");
  const subagentAvailable = hasSubagentTool(pi);
  const parallelTarget = subagentAvailable ? parsed.parallel : 1;
  const applyFixMode = parsed.fix ? "yes" : "no";
  const debugInstruction = subagentAvailable
    ? "Instruction: If the subagent tool is available, run parallel hypothesis investigations and synthesize findings before selecting a fix."
    : "Instruction: pi-subagents is not installed in this session, run hypothesis investigations sequentially without subagent delegation.";
  const subagentMode = subagentAvailable ? "on" : "off";
  const fixMode = parsed.fix ? "on" : "off";
  await beginWorkflowTracking(pi, ctx, "debug", parsed.problem, {
    parallel: parallelTarget,
    fix: parsed.fix,
    subagentAvailable,
  });
  await enqueueWorkflow(pi, "debug-workflow.md", "debug-workflow.yaml", [
    `User problem: ${parsed.problem}`,
    `Parallel subagents target: ${parallelTarget}`,
    `Apply fix: ${applyFixMode}`,
    "",
    debugInstruction,
    POSTFLIGHT_INSTRUCTION,
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`. Missing either line is treated as failed.",
  ]);
  pi.appendEntry("pesap-debug-command", {
    problem: parsed.problem,
    parallel: parallelTarget,
    fix: parsed.fix,
    subagentAvailable,
    at: nowIso(),
  });
  if (!subagentAvailable) {
    notify(ctx, "pi-subagents not detected, running /debug in single-agent mode.", "warning");
  }

  notify(ctx, `Started debug workflow (parallel=${parallelTarget}, fix=${fixMode}, subagents=${subagentMode}).`, "info");
}

async function handleFeature(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parsed = parseFeatureArgs(args);
  if (pendingWorkflow) {
    notify(ctx, `Workflow already running (${pendingWorkflow.type}). Wait for completion before starting another.`, "error");
    return;
  }
  if (!parsed.request) {
    notify(ctx, "Usage: /feature <request> [--parallel N] [--ship]", "error");
    return;
  }
  ensureAgentEnabledForCommand(pi, ctx, "feature");

  const subagentAvailable = hasSubagentTool(pi);
  const parallelTarget = subagentAvailable ? parsed.parallel : 1;
  await beginWorkflowTracking(pi, ctx, "feature", parsed.request, {
    parallel: parallelTarget,
    ship: parsed.ship,
    subagentAvailable,
  });
  await enqueueWorkflow(pi, "feature-workflow.md", "feature-workflow.yaml", [
    `Feature request: ${parsed.request}`,
    `Parallel subagents target: ${parallelTarget}`,
    `Ship mode: ${parsed.ship ? "yes" : "no"}`,
    "",
    subagentAvailable
      ? "Instruction: Use parallel subagents for implementation/tests/docs when that reduces delivery time or risk."
      : "Instruction: pi-subagents is not installed in this session, run implementation/tests/docs sequentially without subagent delegation.",
    POSTFLIGHT_INSTRUCTION,
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`. Missing either line is treated as failed.",
  ]);
  pi.appendEntry("pesap-feature-command", {
    request: parsed.request,
    parallel: parallelTarget,
    ship: parsed.ship,
    subagentAvailable,
    at: nowIso(),
  });

  if (!subagentAvailable) {
    notify(ctx, "pi-subagents not detected, running /feature in single-agent mode.", "warning");
  }

  notify(
    ctx,
    `Started feature workflow (parallel=${parallelTarget}, ship=${parsed.ship ? "on" : "off"}, subagents=${subagentAvailable ? "on" : "off"}).`,
    "info",
  );
}

async function handleReview(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parsed = parseReviewArgs(args, ctx.cwd);
  if (pendingWorkflow) {
    notify(ctx, `Workflow already running (${pendingWorkflow.type}). Wait for completion before starting another.`, "error");
    return;
  }

  if (parsed.error) {
    notify(ctx, parsed.error, "error");
    return;
  }

  ensureAgentEnabledForCommand(pi, ctx, "review");

  const target = buildReviewTarget(parsed);
  const projectGuidelines = await loadProjectReviewGuidelines(ctx.cwd);

  await beginWorkflowTracking(pi, ctx, "review", target.summary, {
    ...target.flags,
    extraInstruction: parsed.extraInstruction ?? null,
    source: REVIEW_COMMAND_SOURCE,
  });

  await enqueueWorkflow(pi, "review-workflow.md", "review-workflow.yaml", [
    `Review target: ${target.summary}`,
    `Target mode: ${parsed.mode}`,
    `Source reference: ${REVIEW_COMMAND_SOURCE}`,
    "",
    `Instruction: ${target.instruction}`,
    parsed.extraInstruction ? `Additional focus: ${parsed.extraInstruction}` : "",
    projectGuidelines
      ? [
          "",
          "Project review guidelines (REVIEW_GUIDELINES.md):",
          "```markdown",
          projectGuidelines,
          "```",
        ].join("\n")
      : "",
    "Instruction: Prioritize correctness, security, performance, and maintainability findings with concrete evidence.",
    POSTFLIGHT_INSTRUCTION,
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`. Missing either line is treated as failed.",
  ]);

  pi.appendEntry("pesap-review-command", {
    mode: parsed.mode,
    ...target.flags,
    extraInstruction: parsed.extraInstruction ?? null,
    source: REVIEW_COMMAND_SOURCE,
    at: nowIso(),
  });

  notify(ctx, `Started review workflow (${target.summary}).`, "info");
}

async function handleGitReview(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const extraFocus = normalizeWhitespace(args ?? "");
  if (pendingWorkflow) {
    notify(ctx, `Workflow already running (${pendingWorkflow.type}). Wait for completion before starting another.`, "error");
    return;
  }

  ensureAgentEnabledForCommand(pi, ctx, "git-review");

  const summary = extraFocus ? `current repository (${extraFocus})` : "current repository";
  await beginWorkflowTracking(pi, ctx, "git-review", summary, {
    extraFocus: extraFocus || null,
    source: GIT_REVIEW_COMMAND_SOURCE,
  });

  await enqueueWorkflow(pi, "git-review-workflow.md", "git-review-workflow.yaml", [
    "Repository scope: current working tree",
    `Source reference: ${GIT_REVIEW_COMMAND_SOURCE}`,
    "",
    "Instruction: Run the git diagnostics from the prompt before reading code.",
    extraFocus ? `Additional focus: ${extraFocus}` : "",
    "Instruction: Compare churn, authorship, bug clusters, velocity, and firefighting signals.",
    POSTFLIGHT_INSTRUCTION,
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`. Missing either line is treated as failed.",
  ]);

  pi.appendEntry("pesap-git-review-command", {
    extraFocus: extraFocus || null,
    source: GIT_REVIEW_COMMAND_SOURCE,
    at: nowIso(),
  });

  notify(ctx, `Started git-review workflow${extraFocus ? ` (${extraFocus})` : ""}.`, "info");
}

async function handleSimplify(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parsed = parseReviewArgs(args, ctx.cwd, "simplify");
  if (pendingWorkflow) {
    notify(ctx, `Workflow already running (${pendingWorkflow.type}). Wait for completion before starting another.`, "error");
    return;
  }

  if (parsed.error) {
    notify(ctx, parsed.error, "error");
    return;
  }

  ensureAgentEnabledForCommand(pi, ctx, "simplify");

  const target = buildSimplifyTarget(parsed);

  await beginWorkflowTracking(pi, ctx, "simplify", target.summary, {
    ...target.flags,
    extraInstruction: parsed.extraInstruction ?? null,
    source: SIMPLIFY_COMMAND_SOURCE,
  });

  await enqueueWorkflow(pi, "simplify-workflow.md", "simplify-workflow.yaml", [
    `Simplify target: ${target.summary}`,
    `Target mode: ${parsed.mode}`,
    `Source reference: ${SIMPLIFY_COMMAND_SOURCE}`,
    "",
    `Instruction: ${target.instruction}`,
    parsed.extraInstruction ? `Additional focus: ${parsed.extraInstruction}` : "",
    "Instruction: Preserve exact behavior, API shape, and outputs. Ask before any semantic change.",
    POSTFLIGHT_INSTRUCTION,
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`. Missing either line is treated as failed.",
  ]);

  pi.appendEntry("pesap-simplify-command", {
    mode: parsed.mode,
    ...target.flags,
    extraInstruction: parsed.extraInstruction ?? null,
    source: SIMPLIFY_COMMAND_SOURCE,
    at: nowIso(),
  });

  notify(ctx, `Started simplify workflow (${target.summary}).`, "info");
}

async function handleLearnSkill(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parsed = parseLearnSkillArgs(args);
  if (pendingWorkflow) {
    notify(ctx, `Workflow already running (${pendingWorkflow.type}). Wait for completion before starting another.`, "error");
    return;
  }
  if (!parsed.topic && !parsed.fromFile && !parsed.fromUrl) {
    notify(ctx, "Usage: /learn-skill <topic> [--from <path|url>] [--from-file path] [--from-url url] [--dry-run]", "error");
    return;
  }

  ensureAgentEnabledForCommand(pi, ctx, "learn-skill");

  const paths = await ensureLearningStore(ctx.cwd);

  let sourceExcerpt = "";
  if (parsed.fromFile) {
    const resolvedSourcePath = path.resolve(ctx.cwd, parsed.fromFile);
    if (!(await exists(resolvedSourcePath))) {
      notify(ctx, `Source file not found: ${resolvedSourcePath}`, "error");
      return;
    }
    const raw = await readText(resolvedSourcePath);
    sourceExcerpt = raw.slice(0, 4000);
  }

  const skillHint = parsed.topic || parsed.fromFile || parsed.fromUrl || "new-skill";
  const skillName = slugify(skillHint);
  const skillDir = path.join(paths.skillsDir, skillName);
  const skillFile = path.join(skillDir, "SKILL.md");

  if (!parsed.dryRun) {
    await fs.mkdir(skillDir, { recursive: true });
    if (!(await exists(skillFile))) {
      await fs.writeFile(skillFile, buildSkillTemplate(skillName, parsed.topic || skillHint), "utf8");
    }
  }

  await beginWorkflowTracking(pi, ctx, "learn-skill", parsed.topic || skillHint, {
    fromFile: parsed.fromFile ?? null,
    fromUrl: parsed.fromUrl ?? null,
    dryRun: parsed.dryRun,
    targetSkill: skillName,
    targetFile: skillFile,
  });

  await enqueueWorkflow(pi, "learn-skill-workflow.md", "learn-skill-workflow.yaml", [
    `Topic: ${parsed.topic || "(derived from source)"}`,
    `Target skill: ${skillName}`,
    `Target file: ${skillFile}`,
    `Dry run: ${parsed.dryRun ? "yes" : "no"}`,
    parsed.fromFile ? `Source file: ${path.resolve(ctx.cwd, parsed.fromFile)}` : "",
    parsed.fromUrl ? `Source URL: ${parsed.fromUrl}` : "",
    sourceExcerpt
      ? [
          "",
          "Source excerpt:",
          "```text",
          sourceExcerpt,
          "```",
        ].join("\n")
      : "",
    "",
    "Instruction: Keep the skill concise and include explicit 'Use when' and 'Avoid when' sections.",
    POSTFLIGHT_INSTRUCTION,
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`. Missing either line is treated as failed.",
  ]);

  pi.appendEntry("pesap-learn-skill-command", {
    topic: parsed.topic,
    fromFile: parsed.fromFile ?? null,
    fromUrl: parsed.fromUrl ?? null,
    dryRun: parsed.dryRun,
    targetSkill: skillName,
    targetFile: skillFile,
    at: nowIso(),
  });

  notify(
    ctx,
    parsed.dryRun
      ? `Started learn-skill dry run for ${skillName}.`
      : `Started learn-skill workflow for ${skillName} (${skillFile}).`,
    "info",
  );
}

export default function pesapExtension(pi: ExtensionAPI): void {
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: (spawnContext) => {
      if (!agentEnabled) return spawnContext;

      const blockedMessage = getBlockedCommandMessage(spawnContext.command);
      if (blockedMessage) {
        throw new Error(blockedMessage);
      }

      const riskPolicyMessage = evaluateRiskPolicy(spawnContext.command);
      if (riskPolicyMessage) {
        throw new Error(riskPolicyMessage);
      }

      return {
        ...spawnContext,
        command: prependInterceptedCommandsPath(spawnContext.command),
      };
    },
  });

  pi.registerTool(bashTool);
  pi.on("session_start", async (_event, ctx) => {
    const paths = await ensureLearningStore(ctx.cwd);
    const [hookConfig, gateConfig] = await Promise.all([loadHooksConfig(), loadFirstPrinciplesConfig()]);
    activeHookConfig = hookConfig.config;
    firstPrinciplesConfig = gateConfig.config;

    for (const warning of hookConfig.warnings) {
      notify(ctx, `Hook config warning: ${warning}`, "warning");
    }
    for (const warning of gateConfig.warnings) {
      notify(ctx, `Gate config warning: ${warning}`, "warning");
    }

    riskApproval = getRiskApprovalFromSession(ctx);
    activePreflight = getPreflightFromSession(ctx);
    agentEnabled = getAgentEnabledFromSession(ctx);
    setAgentEnabledState(ctx, agentEnabled);

    const settingsSync = await ensureSkillPathInSettings(GLOBAL_PI_SETTINGS_PATH, PACKAGE_SKILLS_PATH);
    if (settingsSync.warning) {
      notify(ctx, settingsSync.warning, "warning");
    } else if (settingsSync.added) {
      notify(ctx, `Registered pesap skills in ${GLOBAL_PI_SETTINGS_PATH}.`, "info");
    }

    notify(
      ctx,
      `pesap-agent path: ${paths.root} (preflight=${firstPrinciplesConfig.preflightMode}, postflight=${firstPrinciplesConfig.postflightMode})`,
      "info",
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!agentEnabled) return;
    pendingWorkflow = null;
    await runSessionEndHooks(pi, ctx);
    setAgentEnabledState(ctx, false);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!agentEnabled) return;
    const bootstrap = await getBootstrapPayload(ctx.cwd);
    if (!bootstrap.trim()) return;
    return {
      systemPrompt: `${event.systemPrompt.trimEnd()}\n\n${bootstrap}`,
    };
  });

  pi.on("input", async (event, _ctx) => {
    const text = typeof event.text === "string" ? event.text.trim() : "";
    if (!text) return;

    const preflight = parsePreflightLine(text);
    if (preflight) {
      activePreflight = preflight;
      pi.appendEntry(PREFLIGHT_STATE_TYPE, preflight);
      return;
    }

    const postflight = parsePostflightLine(text);
    if (postflight) {
      latestPostflight = postflight;
      pi.appendEntry(POSTFLIGHT_EVENT_TYPE, postflight);
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!agentEnabled) return;

    const input = event.input as Record<string, unknown>;
    if (!isMutationToolCall(event.toolName, input)) return;

    if (pendingWorkflow) pendingWorkflow.mutationCount += 1;

    const violation = !activePreflight;
    const outcome = modeOutcome(firstPrinciplesConfig.preflightMode, violation);
    const detail = violation
      ? "Missing valid preflight before mutation."
      : `Using ${activePreflight.source} preflight: ${buildPreflightRawLine(activePreflight)}`;

    addPolicyEvent(pi, {
      at: nowIso(),
      phase: "preflight",
      mode: firstPrinciplesConfig.preflightMode,
      outcome,
      detail,
      toolName: event.toolName,
    });

    if (outcome === "warn") {
      const warning = `Policy warning (${event.toolName}): ${detail}`;
      pendingWorkflow?.policyWarnings.push(warning);
      notify(ctx, warning, "warning");
      return;
    }

    if (outcome === "block") {
      return {
        block: true,
        reason: [
          `Policy blocked ${event.toolName}.`,
          "Missing valid preflight before first mutation.",
          "Run:",
          "  /preflight Preflight: skill=<name|none> reason=\"<short>\" clarify=<yes|no>",
          "Remediate and retry.",
        ].join("\n"),
      };
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    const workflow = pendingWorkflow;
    if (!workflow) return;
    pendingWorkflow = null;

    const text = extractLastAssistantText((event as { messages?: unknown }).messages) || "No assistant output captured.";
    await completeWorkflowTracking(pi, ctx, workflow, text);
  });

  pi.registerCommand("start-agent", {
    description: "Initialize pesap-agent context injection for this session",
    handler: async (_args, ctx) => {
      if (agentEnabled) {
        notify(ctx, "pesap-agent is already initialized.", "info");
        return;
      }
      setAgentEnabledState(ctx, true);
      pi.appendEntry(AGENT_STATE_TYPE, { initialized: true, enabled: true, at: nowIso() });
      notify(ctx, "pesap-agent initialized.", "success");
    },
  });

  pi.registerCommand("end-agent", {
    description: "Stop pesap-agent context injection for this session",
    handler: async (_args, ctx) => {
      if (!agentEnabled) {
        return;
      }
      pendingWorkflow = null;
      await runSessionEndHooks(pi, ctx);
      setAgentEnabledState(ctx, false);
      pi.appendEntry(AGENT_STATE_TYPE, { initialized: false, enabled: false, at: nowIso() });
    },
  });
  pi.registerCommand("approve-risk", {
    description: "Record checker approval for one high-risk command",
    handler: async (args, ctx) => {
      const parsed = parseApproveRiskArgs(args ?? "");
      if (parsed.error) {
        notify(ctx, parsed.error, "error");
        return;
      }

      const approvedAt = nowIso();
      const expiresAt = new Date(Date.now() + parsed.ttlMinutes * 60_000).toISOString();
      riskApproval = {
        reason: parsed.reason,
        approvedAt,
        expiresAt,
      };

      pi.appendEntry(RISK_APPROVAL_TYPE, {
        approved: true,
        reason: parsed.reason,
        approvedAt,
        expiresAt,
      });

      notify(ctx, `Risk approval recorded until ${expiresAt}.`, "success");
    },
  });
  pi.registerCommand("preflight", {
    description: "Set mutation intent line for first-principles gate",
    handler: async (args, ctx) => {
      const parsed = parsePreflightArgs(args ?? "");
      if (parsed.error || !parsed.record) {
        notify(ctx, parsed.error ?? "Invalid preflight.", "error");
        return;
      }
      activePreflight = parsed.record;
      pi.appendEntry(PREFLIGHT_STATE_TYPE, parsed.record);
      notify(ctx, `Preflight recorded (${parsed.record.skill}).`, "success");
    },
  });

  pi.registerCommand("postflight", {
    description: "Record verification evidence line for first-principles gate",
    handler: async (args, ctx) => {
      const parsed = parsePostflightArgs(args ?? "");
      if (parsed.error || !parsed.record) {
        notify(ctx, parsed.error ?? "Invalid postflight.", "error");
        return;
      }
      latestPostflight = parsed.record;
      pi.appendEntry(POSTFLIGHT_EVENT_TYPE, parsed.record);
      notify(ctx, `Postflight recorded (${parsed.record.result}).`, "success");
    },
  });

  pi.registerCommand("debug", {
    description: "Run the pesap debug workflow",
    handler: async (args, ctx) => {
      await handleDebug(pi, args ?? "", ctx);
    },
  });

  pi.registerCommand("feature", {
    description: "Run the pesap feature workflow",
    handler: async (args, ctx) => {
      await handleFeature(pi, args ?? "", ctx);
    },
  });

  pi.registerCommand("review", {
    description: "Run the pesap code review workflow (adapted from pi-review)",
    handler: async (args, ctx) => {
      await handleReview(pi, args ?? "", ctx);
    },
  });

  pi.registerCommand("git-review", {
    description: "Run git history diagnostics before reading code",
    handler: async (args, ctx) => {
      await handleGitReview(pi, args ?? "", ctx);
    },
  });

  pi.registerCommand("simplify", {
    description: "Run the pesap code simplification workflow",
    handler: async (args, ctx) => {
      await handleSimplify(pi, args ?? "", ctx);
    },
  });

  pi.registerCommand("reaview", {
    description: "Alias for /review",
    handler: async (args, ctx) => {
      await handleReview(pi, args ?? "", ctx);
    },
  });

  pi.registerCommand("learn-skill", {
    description: "Create and refine a reusable skill",
    handler: async (args, ctx) => {
      await handleLearnSkill(pi, args ?? "", ctx);
    },
  });
}
