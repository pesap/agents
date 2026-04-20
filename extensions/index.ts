import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentCommandHandlers } from "./commands/agent";
import { createComplianceCommandHandlers } from "./commands/compliance";
import {
  buildReviewTarget,
  buildSimplifyTarget,
  buildSkillTemplate,
  hasSubagentTool,
  parseAddressOpenIssuesArgs,
  parseApproveRiskArgs,
  parseDebugArgs,
  parseDomainModelArgs,
  parseFeatureArgs,
  parseLearnSkillArgs,
  parsePostflightArgs,
  parsePreflightArgs,
  parseRemoveSlopArgs,
  parseReviewArgs,
  parseTddArgs,
  parseToIssuesArgs,
  parseToPrdArgs,
  parseTriageIssueArgs,
  type WorkflowFlags,
} from "./commands/parsers";
import { registerCommands } from "./commands/register";
import { createWorkflowCommandHandlers } from "./commands/workflow-handlers";
import {
  ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
  DOMAIN_MODEL_COMMAND_SOURCE,
  GIT_REVIEW_COMMAND_SOURCE,
  LEARNING_VERSION,
  LOW_CONFIDENCE_THRESHOLD,
  MEMORY_TAIL_LINES,
  POSTFLIGHT_INSTRUCTION,
  PROMOTION_IMPROVEMENT_THRESHOLD,
  PROMOTION_MIN_OBSERVATIONS,
  PROMOTION_SUCCESS_THRESHOLD,
  REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
  REVIEW_COMMAND_SOURCE,
  SIMPLIFY_COMMAND_SOURCE,
  TDD_COMMAND_SOURCE,
  TO_ISSUES_COMMAND_SOURCE,
  TO_PRD_COMMAND_SOURCE,
  TRIAGE_ISSUE_COMMAND_SOURCE,
} from "./lib/constants";
import { appendLine, exists, formatErrorMessage, isRecord, readText, readTextIfExists } from "./lib/io";
import { normalizeWhitespace, slugify, summarizeEvidence } from "./lib/text";
import { makeId, nowIso } from "./lib/time";
import {
  DEFAULT_HOOK_CONFIG,
  buildLifecycleHookMarkdown,
  loadHooksConfig,
  type HookConfig,
} from "./hooks/config";
import {
  ensureLearningStore,
  getLearnedSkillsList,
  getLearningMemoryTail,
  loadProjectReviewGuidelines,
  maybeEmitPromotionHint,
  type LearningObservation,
  type LearningPaths,
} from "./learning/store";
import { getBlockedCommandMessage } from "./policy/blocked-commands";
import {
  buildPreflightRawLine,
  extractPostflightFromAssistantText,
  isMutationToolCall,
  modeOutcome,
  parseFirstPrinciplesConfig,
  parsePostflightLine,
  parsePreflightLine,
  type FirstPrinciplesConfig,
  type PostflightRecord,
  type PreflightRecord,
} from "./policy/first-principles";
import { evaluateRiskPolicy } from "./policy/risk";
import {
  createRuntimeState,
  hasValidRiskApproval,
  resetSessionComplianceState,
  setAgentEnabled,
  type PolicyEvent,
} from "./state/runtime";
import {
  appendAgentStateEntry,
  appendPolicyEvent,
  appendPostflightEntry,
  appendPreflightEntry,
  appendRiskApprovalEntry,
  getAgentEnabledFromSession,
  getPreflightFromSession,
  getRiskApprovalFromSession,
} from "./state/session";
import {
  beginWorkflowTracking as beginTrackedWorkflow,
  completeWorkflowTracking as completeTrackedWorkflow,
  enqueueWorkflow as enqueueWorkflowMessage,
  ensureWorkflowSlotAvailable as ensureWorkflowSlotAvailableForCommand,
} from "./workflows/engine";
import { notifySubagentUnavailable, notifyWorkflowStarted } from "./workflows/notifications";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = path.join(PACKAGE_ROOT, "agent");
const SKILLFLOWS_DIR = path.join(AGENT_DIR, "skillflows");
const COMMANDS_DIR = path.join(PACKAGE_ROOT, "commands");
const INTERCEPTED_COMMANDS_DIR = path.join(PACKAGE_ROOT, "intercepted-commands");
const HOOKS_DIR = path.join(AGENT_DIR, "hooks");
const HOOKS_CONFIG_PATH = path.join(HOOKS_DIR, "hooks.yaml");
const RUNTIME_DAILYLOG_PATH = path.join(AGENT_DIR, "memory", "runtime", "live", "dailylog.md");
const GLOBAL_PI_SETTINGS_PATH = path.join(homedir(), ".pi", "agent", "settings.json");
const PACKAGE_SKILLS_PATH = path.join(PACKAGE_ROOT, "agent", "skills");
const FIRST_PRINCIPLES_CONFIG_PATH = path.join(AGENT_DIR, "compliance", "first-principles-gate.yaml");
type WorkflowType = "debug" | "feature" | "review" | "git-review" | "simplify" | "learn-skill" | "remove-slop" | "domain-model" | "to-prd" | "to-issues" | "triage-issue" | "tdd" | "address-open-issues";
type WorkflowOutcome = "success" | "partial" | "failed";
type PreflightClarify = PreflightRecord["clarify"];
type PreflightSource = PreflightRecord["source"];

type PendingWorkflow = import("./workflows/engine").PendingWorkflow<WorkflowType, WorkflowFlags>;

interface LowConfidenceEvent {
  at: string;
  workflowId: string;
  workflowType: WorkflowType;
  confidence: number;
  outcome: WorkflowOutcome;
}

let pendingWorkflow: PendingWorkflow | null = null;
const learningPathCache = new Map<string, LearningPaths>();
let activeHookConfig: HookConfig = DEFAULT_HOOK_CONFIG;
let lowConfidenceEvents: LowConfidenceEvent[] = [];
const runtimeState = createRuntimeState();


function prependInterceptedCommandsPath(command: string): string {
  const escapedPath = INTERCEPTED_COMMANDS_DIR.replace(/\"/g, '\\\"');
  return `export PATH="${escapedPath}:$PATH"\n${command}`;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isWorkflowOutcome(value: unknown): value is WorkflowOutcome {
  return value === "success" || value === "partial" || value === "failed";
}

function isPreflightClarify(value: unknown): value is PreflightClarify {
  return value === "yes" || value === "no";
}

function isPreflightSource(value: unknown): value is PreflightSource {
  return value === "manual" || value === "auto";
}

async function ensureSkillPathInSettings(settingsPath: string, skillPath: string): Promise<{ added: boolean; warning?: string }> {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    const raw = await readTextIfExists(settingsPath);
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const settings = isRecord(parsed) ? parsed : {};
    const existingSkills = settings.skills;
    const skills = isStringArray(existingSkills)
      ? existingSkills
      : Array.isArray(existingSkills)
        ? existingSkills.filter((value): value is string => typeof value === "string")
        : [];

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

async function loadFirstPrinciplesConfig(): Promise<{ config: FirstPrinciplesConfig; warnings: string[] }> {
  const raw = await readTextIfExists(FIRST_PRINCIPLES_CONFIG_PATH);
  return parseFirstPrinciplesConfig(raw);
}

function evaluateRiskPolicyMessage(command: string): string | null {
  const evaluation = evaluateRiskPolicy(command, {
    hookConfig: activeHookConfig,
    hasValidRiskApproval: hasValidRiskApproval(runtimeState),
    nowIso,
  });

  if (evaluation.event) {
    runtimeState.riskEvents.push(evaluation.event);
  }

  if (evaluation.consumeApproval) {
    runtimeState.riskApproval = null;
  }

  return evaluation.blockedMessage;
}

async function appendRuntimeDailyLog(line: string): Promise<void> {
  try {
    await appendLine(RUNTIME_DAILYLOG_PATH, line);
  } catch (error) {
    console.warn(`Failed to append runtime log line to ${RUNTIME_DAILYLOG_PATH}: ${formatErrorMessage(error)}`);
  }
}

async function runSessionEndHooks(pi: ExtensionAPI, ctx: Pick<ExtensionContext, "hasUI" | "ui">): Promise<void> {
  const teardownHooks = await buildLifecycleHookMarkdown({
    lifecycle: "on_session_end",
    activeHookConfig,
    hooksDir: HOOKS_DIR,
  });
  const summary = {
    at: nowIso(),
    riskEvents: runtimeState.riskEvents,
    lowConfidenceEvents,
    policyEvents: runtimeState.policyEvents,
    teardownHooksLoaded: Boolean(teardownHooks.trim()),
  };
  pi.appendEntry("pesap-hook-summary", summary);

  const executedHighRisk = runtimeState.riskEvents.filter((event) => event.approved).length;
  const blockedHighRisk = runtimeState.riskEvents.filter((event) => !event.approved).length;
  const blockedPolicy = runtimeState.policyEvents.filter((event) => event.outcome === "block").length;
  const warnedPolicy = runtimeState.policyEvents.filter((event) => event.outcome === "warn").length;
  notify(
    ctx,
    `Hook teardown summary: high-risk approved=${executedHighRisk}, blocked=${blockedHighRisk}, policy(block=${blockedPolicy},warn=${warnedPolicy}), low-confidence=${lowConfidenceEvents.length}.`,
    "info",
  );

  await appendRuntimeDailyLog(
    `- ${summary.at.slice(0, 10)}: hook-summary approved_high_risk=${executedHighRisk} blocked_high_risk=${blockedHighRisk} policy_blocked=${blockedPolicy} policy_warned=${warnedPolicy} low_confidence=${lowConfidenceEvents.length}`,
  );

  lowConfidenceEvents = [];
  resetSessionComplianceState(runtimeState);
}

function setAgentEnabledState(ctx: Pick<ExtensionContext, "hasUI" | "ui">, enabled: boolean): void {
  setAgentEnabled(runtimeState, enabled);
  setStatus(ctx, enabled ? "🐉 pesap-agent enabled" : undefined);
}

function ensureAgentEnabledForCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  source: WorkflowType,
): void {
  if (runtimeState.agentEnabled) return;
  setAgentEnabledState(ctx, true);
  appendAgentStateEntry(pi, true, nowIso(), source);
  notify(ctx, `pesap-agent initialized automatically for /${source}.`, "info");
}

function extractTextFromAssistantContent(content: AssistantMessage["content"]): string {
  const parts = content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text);
  return parts.join("\n").trim();
}

function extractLastAssistantText(messages: AgentEndEvent["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;

    const text = extractTextFromAssistantContent(message.content);
    if (text) return text;
  }
  return "";
}

function inferOutcomeFromText(text: string): { outcome: WorkflowOutcome; confidence: number; strictViolation?: string } {
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

function addPolicyEvent(pi: ExtensionAPI, event: PolicyEvent): void {
  appendPolicyEvent(pi, runtimeState, event);
}

function setStatus(ctx: Pick<ExtensionContext, "hasUI" | "ui">, label?: string): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("pesap", label);
}

function notify(ctx: Pick<ExtensionContext, "hasUI" | "ui">, message: string, type: "info" | "error" | "warning" | "success"): void {
  if (!ctx.hasUI) return;
  ctx.ui.notify(message, type === "success" ? "info" : type);
}

function ensureWorkflowSlotAvailable(ctx: ExtensionCommandContext): boolean {
  return ensureWorkflowSlotAvailableForCommand(ctx, pendingWorkflow, notify);
}

async function readWorkflow(name: string): Promise<string> {
  const filePath = path.join(SKILLFLOWS_DIR, name);
  return readText(filePath);
}

async function readCommandPrompt(name: string): Promise<string> {
  const filePath = path.join(COMMANDS_DIR, name);
  return readText(filePath);
}

async function getBootstrapPayload(cwd: string): Promise<string> {
  const [soul, rules, duties, instructions, complianceProfile, startupHooks, memoryTail, learnedSkills] = await Promise.all([
    readTextIfExists(path.join(AGENT_DIR, "SOUL.md")),
    readTextIfExists(path.join(AGENT_DIR, "RULES.md")),
    readTextIfExists(path.join(AGENT_DIR, "DUTIES.md")),
    readTextIfExists(path.join(AGENT_DIR, "INSTRUCTIONS.md")),
    readTextIfExists(path.join(AGENT_DIR, "compliance", "risk-assessment.md")),
    buildLifecycleHookMarkdown({
      lifecycle: "on_session_start",
      activeHookConfig,
      hooksDir: HOOKS_DIR,
    }),
    getLearningMemoryTail(cwd, learningPathCache, MEMORY_TAIL_LINES),
    getLearnedSkillsList(cwd, learningPathCache),
  ]);
  return [
    "Pesap agent bootstrap context (single-agent runtime):",
    "",
    "[SOUL]",
    soul.trim(),
    "",
    "[RULES]",
    rules.trim(),
    duties.trim() ? "[DUTIES]" : "",
    duties.trim(),
    "",
    "[INSTRUCTIONS]",
    instructions.trim(),
    complianceProfile.trim() ? "[COMPLIANCE PROFILE]" : "",
    complianceProfile.trim(),
    startupHooks.trim() ? "[LIFECYCLE HOOKS: on_session_start]" : "",
    startupHooks.trim(),
    memoryTail ? "[LEARNING MEMORY TAIL]" : "",
    memoryTail,
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
  await enqueueWorkflowMessage({
    pi,
    workflowPromptName,
    workflowFileName,
    sections,
    readCommandPrompt,
    readWorkflow,
  });
}

async function beginWorkflowTracking(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  type: WorkflowType,
  input: string,
  flags: WorkflowFlags,
): Promise<PendingWorkflow> {
  const pending = await beginTrackedWorkflow({
    pi,
    ctx,
    type,
    input,
    flags,
    learningVersion: LEARNING_VERSION,
    ensureLearningStore: (cwd) => ensureLearningStore(cwd, learningPathCache),
    makeId,
    nowIso,
    summarizeEvidence,
    runtimeState,
    appendPreflightEntry,
  });
  pendingWorkflow = pending;
  return pending;
}

async function completeWorkflowTracking(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  workflow: PendingWorkflow,
  assistantText: string,
): Promise<void> {
  await completeTrackedWorkflow({
    pi,
    ctx,
    workflow,
    assistantText,
    learningVersion: LEARNING_VERSION,
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
    runtimeState,
    inferOutcomeFromText,
    ensureLearningStore: (cwd) => ensureLearningStore(cwd, learningPathCache),
    nowIso,
    extractPostflightFromAssistantText,
    modeOutcome,
    addPolicyEvent,
    appendPostflightEntry,
    summarizeEvidence,
    appendLine,
    maybeEmitPromotionHint: (paths, observation, context) => maybeEmitPromotionHint({
      paths,
      observation: observation as LearningObservation<WorkflowType, WorkflowOutcome>,
      ctx: context,
      promotionMinObservations: PROMOTION_MIN_OBSERVATIONS,
      promotionSuccessThreshold: PROMOTION_SUCCESS_THRESHOLD,
      promotionImprovementThreshold: PROMOTION_IMPROVEMENT_THRESHOLD,
      nowIso,
      summarizeEvidence,
      notify,
    }),
    notify,
    makeId,
    onLowConfidence: (event) => {
      lowConfidenceEvents.push(event);
    },
  });
}

export default function pesapExtension(pi: ExtensionAPI): void {
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: (spawnContext) => {
      if (!runtimeState.agentEnabled) return spawnContext;

      const blockedMessage = getBlockedCommandMessage(spawnContext.command);
      if (blockedMessage) {
        throw new Error(blockedMessage);
      }

      const riskPolicyMessage = evaluateRiskPolicyMessage(spawnContext.command);
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
    const paths = await ensureLearningStore(ctx.cwd, learningPathCache);
    const [hookConfig, gateConfig] = await Promise.all([loadHooksConfig(HOOKS_CONFIG_PATH, DEFAULT_HOOK_CONFIG), loadFirstPrinciplesConfig()]);
    activeHookConfig = hookConfig.config;
    runtimeState.firstPrinciplesConfig = gateConfig.config;

    for (const warning of hookConfig.warnings) {
      notify(ctx, `Hook config warning: ${warning}`, "warning");
    }
    for (const warning of gateConfig.warnings) {
      notify(ctx, `Gate config warning: ${warning}`, "warning");
    }

    runtimeState.riskApproval = getRiskApprovalFromSession(ctx);
    runtimeState.activePreflight = getPreflightFromSession(ctx, { isPreflightClarify, isPreflightSource });
    setAgentEnabledState(ctx, getAgentEnabledFromSession(ctx));

    const settingsSync = await ensureSkillPathInSettings(GLOBAL_PI_SETTINGS_PATH, PACKAGE_SKILLS_PATH);
    if (settingsSync.warning) {
      notify(ctx, settingsSync.warning, "warning");
    } else if (settingsSync.added) {
      notify(ctx, `Registered pesap skills in ${GLOBAL_PI_SETTINGS_PATH}.`, "info");
    }

    notify(
      ctx,
      `pesap-agent path: ${paths.root} (preflight=${runtimeState.firstPrinciplesConfig.preflightMode}, postflight=${runtimeState.firstPrinciplesConfig.postflightMode})`,
      "info",
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!runtimeState.agentEnabled) return;
    pendingWorkflow = null;
    await runSessionEndHooks(pi, ctx);
    setAgentEnabledState(ctx, false);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!runtimeState.agentEnabled) return;
    const bootstrap = await getBootstrapPayload(ctx.cwd);
    if (!bootstrap.trim()) return;
    return {
      systemPrompt: `${event.systemPrompt.trimEnd()}\n\n${bootstrap}`,
    };
  });

  pi.on("input", async (event, _ctx) => {
    const text = typeof event.text === "string" ? event.text.trim() : "";
    if (!text) return;

    const preflight = parsePreflightLine(text, nowIso);
    if (preflight) {
      runtimeState.activePreflight = preflight;
      appendPreflightEntry(pi, preflight);
      return;
    }

    const postflight = parsePostflightLine(text, nowIso);
    if (postflight) {
      runtimeState.latestPostflight = postflight;
      appendPostflightEntry(pi, postflight);
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!runtimeState.agentEnabled) return;

    if (!isMutationToolCall(event)) return;

    if (pendingWorkflow) pendingWorkflow.mutationCount += 1;

    const preflight = runtimeState.activePreflight;
    const violation = !preflight;
    const outcome = modeOutcome(runtimeState.firstPrinciplesConfig.preflightMode, violation);
    const detail = violation
      ? "Missing valid preflight before mutation."
      : `Using ${preflight.source} preflight: ${buildPreflightRawLine(preflight)}`;

    addPolicyEvent(pi, {
      at: nowIso(),
      phase: "preflight",
      mode: runtimeState.firstPrinciplesConfig.preflightMode,
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

    const text = extractLastAssistantText(event.messages) || "No assistant output captured.";

    // Harness compliance enforcement (minimal)
    if (runtimeState.firstPrinciplesConfig.responseComplianceMode === "enforce") {
      const resultMatch = text.match(/^\s*Result:\s*(success|partial|failed)\s*$/mi);
      const confidenceMatch = text.match(/^\s*Confidence:\s*([\d.]+)\s*$/mi);
      const confidenceValue = confidenceMatch ? parseFloat(confidenceMatch[1]) : null;
      const hasResult = resultMatch !== null;
      const hasConfidence = confidenceValue !== null && confidenceValue >= 0 && confidenceValue <= 1;
      if (!hasResult || !hasConfidence) {
        return {
          block: true,
          reason: [
            "HARNESS COMPLIANCE FAILED",
            "",
            hasResult ? "" : "Missing or invalid: Result: success|partial|failed",
            hasConfidence ? "" : (confidenceMatch ? "Invalid: Confidence must be 0..1" : "Missing: Confidence: 0..1"),
            "",
            "Add these lines to your response and retry.",
          ].filter(Boolean).join("\n"),
        };
      }
    }

    await completeWorkflowTracking(pi, ctx, workflow, text);
  });

  const agentHandlers = createAgentCommandHandlers({
    runtimeState,
    setAgentEnabledState,
    appendAgentStateEntry: (enabled) => appendAgentStateEntry(pi, enabled, nowIso()),
    clearPendingWorkflow: () => {
      pendingWorkflow = null;
    },
    runSessionEndHooks: async (ctx) => {
      await runSessionEndHooks(pi, ctx);
    },
    notify,
  });

  const complianceHandlers = createComplianceCommandHandlers({
    runtimeState,
    notify,
    parseApproveRiskArgs,
    parsePreflightArgs: (args) => parsePreflightArgs(args, (line) => parsePreflightLine(line, nowIso)),
    parsePostflightArgs: (args) => parsePostflightArgs(args, (line) => parsePostflightLine(line, nowIso)),
    nowIso,
    appendRiskApprovalEntry: (approval) => appendRiskApprovalEntry(pi, approval),
    appendPreflightEntry: (record) => appendPreflightEntry(pi, record),
    appendPostflightEntry: (record) => appendPostflightEntry(pi, record),
  });

  const workflowHandlers = createWorkflowCommandHandlers({
    pi,
    notify,
    nowIso,
    slugify,
    normalizeWhitespace,
    ensureWorkflowSlotAvailable,
    ensureAgentEnabledForCommand,
    hasSubagentTool,
    beginWorkflowTracking,
    enqueueWorkflow,
    notifySubagentUnavailable,
    notifyWorkflowStarted,
    parseDebugArgs,
    parseFeatureArgs,
    parseReviewArgs,
    buildReviewTarget,
    loadProjectReviewGuidelines,
    parseRemoveSlopArgs,
    parseDomainModelArgs,
    parseToPrdArgs,
    parseToIssuesArgs,
    parseTriageIssueArgs,
    parseTddArgs,
    parseAddressOpenIssuesArgs,
    parseLearnSkillArgs,
    ensureLearningStore: (cwd) => ensureLearningStore(cwd, learningPathCache),
    exists,
    readText,
    buildSkillTemplate,
    buildSimplifyTarget,
    constants: {
      POSTFLIGHT_INSTRUCTION,
      REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      REVIEW_COMMAND_SOURCE,
      GIT_REVIEW_COMMAND_SOURCE,
      SIMPLIFY_COMMAND_SOURCE,
      DOMAIN_MODEL_COMMAND_SOURCE,
      TO_PRD_COMMAND_SOURCE,
      TO_ISSUES_COMMAND_SOURCE,
      TRIAGE_ISSUE_COMMAND_SOURCE,
      TDD_COMMAND_SOURCE,
      ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
    },
  });

  registerCommands({
    pi,
    handlers: {
      ...agentHandlers,
      ...complianceHandlers,
      ...workflowHandlers,
    },
  });
}
