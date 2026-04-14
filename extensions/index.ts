import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = path.join(PACKAGE_ROOT, "pesap-agent");
const SKILLFLOWS_DIR = path.join(AGENT_DIR, "skillflows");
const COMMANDS_DIR = path.join(PACKAGE_ROOT, "commands");

const BOOTSTRAP_MARKER = "pesap-bootstrap-injected";
const AGENT_STATE_TYPE = "pesap-agent-state";

const DEFAULT_DEBUG_PARALLEL = 3;
const DEFAULT_FEATURE_PARALLEL = 2;

const LEARNING_STORE_DIRNAME = "pesap-agent";
const LEARNING_VERSION = 1;
const MEMORY_TAIL_LINES = 20;
const PROMOTION_MIN_OBSERVATIONS = 3;
const PROMOTION_SUCCESS_THRESHOLD = 0.75;
const PROMOTION_IMPROVEMENT_THRESHOLD = 0.4;

type WorkflowType = "debug" | "feature" | "learn-skill";
type WorkflowOutcome = "success" | "partial" | "failed";

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
let agentEnabled = true;
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

function hasCustomMarker(ctx: ExtensionContext, customType: string): boolean {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "custom") continue;
    if ((entry as { customType?: string }).customType === customType) return true;
  }
  return false;
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

function setStatus(ctx: Pick<ExtensionContext, "hasUI" | "ui">, label: string): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("pesap", `🧠 ${label}`);
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

  setStatus(ctx, `${type} running`);
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

  setStatus(ctx, "pesap-agent ready");
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

  await beginWorkflowTracking(pi, ctx, "feature", parsed.request, {
    parallel: parsed.parallel,
    ship: parsed.ship,
  });

  await enqueueWorkflow(pi, "feature-workflow.md", "feature-workflow.yaml", [
    `Feature request: ${parsed.request}`,
    `Parallel subagents target: ${parsed.parallel}`,
    `Ship mode: ${parsed.ship ? "yes" : "no"}`,
    "",
    "Instruction: Use parallel subagents for implementation/tests/docs when that reduces delivery time or risk.",
    "Instruction: End your final response with `Result: success|partial|failed` and `Confidence: <0..1>`.",
  ]);

  pi.appendEntry("pesap-feature-command", {
    request: parsed.request,
    parallel: parsed.parallel,
    ship: parsed.ship,
    at: nowIso(),
  });

  notify(ctx, `Started feature workflow (parallel=${parsed.parallel}, ship=${parsed.ship ? "on" : "off"}).`, "info");
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
    setStatus(ctx, "pesap-agent ready");
    notify(ctx, `Pesap learning store: ${paths.root}`, "info");
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (hasCustomMarker(ctx, BOOTSTRAP_MARKER)) return;

    const bootstrap = await getBootstrapPayload(ctx.cwd);
    if (!bootstrap.trim()) return;

    pi.appendEntry(BOOTSTRAP_MARKER, { at: nowIso() });

    return {
      message: {
        customType: "pesap-bootstrap",
        content: bootstrap,
        display: false,
        details: { source: AGENT_DIR },
      },
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    const workflow = pendingWorkflow;
    if (!workflow) return;
    pendingWorkflow = null;

    const text = extractLastAssistantText((event as { messages?: unknown }).messages) || "Result: partial\nConfidence: 0.3\nNo assistant output captured.";
    await completeWorkflowTracking(pi, ctx, workflow, text);
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

  pi.registerCommand("learn-skill", {
    description: "Create and refine a reusable skill",
    handler: async (args, ctx) => {
      await handleLearnSkill(pi, args ?? "", ctx);
    },
  });
}
