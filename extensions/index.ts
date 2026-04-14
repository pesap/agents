import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = resolveAgentDir(PACKAGE_ROOT);
const SKILLFLOWS_DIR = path.join(AGENT_DIR, "skillflows");
const COMMANDS_DIR = path.join(PACKAGE_ROOT, "commands");

const AGENT_STATE_TYPE = "pesap-agent-state";

const DEFAULT_DEBUG_PARALLEL = 3;
const DEFAULT_FEATURE_PARALLEL = 2;

const LEARNING_STORE_DIRNAME = "pesap-agent";
const LEARNING_VERSION = 1;
const MEMORY_TAIL_LINES = 20;
const PROMOTION_MIN_OBSERVATIONS = 3;
const PROMOTION_SUCCESS_THRESHOLD = 0.75;
const PROMOTION_IMPROVEMENT_THRESHOLD = 0.4;

type WorkflowType = "debug" | "feature" | "review" | "simplify" | "learn-skill";
type WorkflowOutcome = "success" | "partial" | "failed";

const REVIEW_COMMAND_SOURCE = "https://github.com/earendil-works/pi-review";
const SIMPLIFY_COMMAND_SOURCE = "https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md";

type ReviewMode = "uncommitted" | "branch" | "commit" | "pr" | "folder";

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

let pendingWorkflow: PendingWorkflow | null = null;
let agentEnabled = false;
const learningPathCache = new Map<string, LearningPaths>();

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
  const fromFile = fromFileResult.match?.[2];

  const fromUrlResult = removeFlag(rest, /(^|\s)--from-url\s+(\S+)(\s|$)/);
  rest = fromUrlResult.value;
  const fromUrl = fromUrlResult.match?.[2];

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

function parseReviewArgs(args: string, commandName = "review"): ParsedReviewArgs {
  const usage = `Usage: /${commandName} [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>] [--extra "focus"]`;
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

  if (mode === "folder") {
    const paths = rest.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    if (paths.length === 0) {
      return { mode: "folder", error: `Usage: /${commandName} folder <path ...> [--extra "focus"]` };
    }
    return { mode: "folder", paths, extraInstruction };
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
      summary: `folders ${paths.join(", ")}`,
      instruction: `Snapshot review only for paths: ${paths.join(", ")}. Read files directly, do not assume git diff context.`,
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
      summary: `folders ${paths.join(", ")}`,
      instruction: `Simplify code only in paths: ${paths.join(", ")}. Read files directly, do not assume git diff context.`,
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

function inferOutcomeFromText(text: string): { outcome: WorkflowOutcome; confidence: number } {
  const resultMatch = text.match(/(?:^|\n)\s*Result\s*:\s*(success|partial|failed)\b/i);
  const confidenceMatch = text.match(/(?:^|\n)\s*Confidence\s*:\s*([0-9]{1,3}(?:\.[0-9]+)?%?)/i);

  let outcome: WorkflowOutcome;
  if (resultMatch) {
    outcome = resultMatch[1].toLowerCase() as WorkflowOutcome;
  } else if (/(\bfailed\b|\berror\b|\bunable\b|\bcannot\b|\bcan't\b)/i.test(text)) {
    outcome = "failed";
  } else if (/(\bpartial\b|\bincomplete\b|\bfollow-up\b)/i.test(text)) {
    outcome = "partial";
  } else {
    outcome = "success";
  }

  let confidence = outcome === "success" ? 0.65 : outcome === "partial" ? 0.5 : 0.35;
  if (confidenceMatch) {
    const raw = confidenceMatch[1] ?? "";
    if (raw.endsWith("%")) {
      confidence = Number(raw.slice(0, -1)) / 100;
    } else {
      const numeric = Number(raw);
      confidence = numeric > 1 ? numeric / 100 : numeric;
    }
  }

  return { outcome, confidence: clampConfidence(confidence) };
}

function summarizeEvidence(text: string, max = 280): string {
  const compact = normalizeWhitespace(text);
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
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
  const [soul, rules, instructions, memoryTail, learnedSkills] = await Promise.all([
    readTextIfExists(path.join(AGENT_DIR, "SOUL.md")),
    readTextIfExists(path.join(AGENT_DIR, "RULES.md")),
    readTextIfExists(path.join(AGENT_DIR, "INSTRUCTIONS.md")),
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
    "",
    "[INSTRUCTIONS]",
    instructions.trim(),
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

  const pending: PendingWorkflow = { id, type, input, flags, startedAt, runFile };
  pendingWorkflow = pending;

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
  const { outcome, confidence } = inferOutcomeFromText(assistantText);
  const paths = await ensureLearningStore(ctx.cwd);
  const finishedAt = nowIso();

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
    evidenceSnippet: summarizeEvidence(assistantText),
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
    `- ${finishedAt.slice(0, 10)} [${workflow.type}/${outcome}] ${summarizeEvidence(workflow.input, 180)} (confidence=${confidence.toFixed(2)})`,
  );

  pi.appendEntry("pesap-workflow-complete", {
    id: workflow.id,
    type: workflow.type,
    outcome,
    confidence,
    at: finishedAt,
  });

  await maybeEmitPromotionHint(paths, observation, ctx);

  notify(ctx, `Workflow ${workflow.type} completed (${outcome}, confidence=${confidence.toFixed(2)}).`, "info");
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

  await beginWorkflowTracking(pi, ctx, "debug", parsed.problem, {
    parallel: parsed.parallel,
    fix: parsed.fix,
  });

  await enqueueWorkflow(pi, "debug-workflow.md", "debug-workflow.yaml", [
    `User problem: ${parsed.problem}`,
    `Parallel subagents target: ${parsed.parallel}`,
    `Apply fix: ${parsed.fix ? "yes" : "no"}`,
    "",
    "Instruction: If the subagent tool is available, run parallel hypothesis investigations and synthesize findings before selecting a fix.",
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`.",
  ]);

  pi.appendEntry("pesap-debug-command", {
    problem: parsed.problem,
    parallel: parsed.parallel,
    fix: parsed.fix,
    at: nowIso(),
  });

  notify(ctx, `Started debug workflow (parallel=${parsed.parallel}, fix=${parsed.fix ? "on" : "off"}).`, "info");
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
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`.",
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
  const parsed = parseReviewArgs(args);
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
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`.",
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

async function handleSimplify(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parsed = parseReviewArgs(args, "simplify");
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
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`.",
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
    notify(ctx, "Usage: /learn-skill <topic> [--from-file path] [--from-url url] [--dry-run]", "error");
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
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`.",
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
  pi.on("session_start", async (_event, ctx) => {
    const paths = await ensureLearningStore(ctx.cwd);
    agentEnabled = getAgentEnabledFromSession(ctx);
    setAgentEnabledState(ctx, agentEnabled);
    notify(ctx, `pesap-agent path: ${paths.root}`, "info");
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!agentEnabled) return;
    const bootstrap = await getBootstrapPayload(ctx.cwd);
    if (!bootstrap.trim()) return;
    return {
      systemPrompt: `${event.systemPrompt.trimEnd()}\n\n${bootstrap}`,
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    const workflow = pendingWorkflow;
    if (!workflow) return;
    pendingWorkflow = null;

    const text = extractLastAssistantText((event as { messages?: unknown }).messages) || "Result: partial\nConfidence: 0.3\nNo assistant output captured.";
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
      setAgentEnabledState(ctx, false);
      pi.appendEntry(AGENT_STATE_TYPE, { initialized: false, enabled: false, at: nowIso() });
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
