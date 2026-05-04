import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import registerSubagentExtension from "pi-subagents/index.ts";
import { promisify } from "node:util";
import registerSubagentNotifyExtension from "pi-subagents/notify.ts";
import { createAgentCommandHandlers } from "./commands/agent";
import { createComplianceCommandHandlers } from "./commands/compliance";
import {
  buildReviewTarget,
  buildSimplifyTarget,
  buildSkillTemplate,
  parseAddressOpenIssuesArgs,
  parseApproveRiskArgs,
  parseComplianceArgs,
  parseDebugArgs,
  parsePlanArgs,
  parseFeatureArgs,
  parseLearnSkillArgs,
  parseKhalaMemoryRemoveArgs,
  parseKhalaMemoryRestartArgs,
  parseKhalaMemorySetupArgs,
  parseGsdArgs,
  parsePostflightArgs,
  parsePreflightArgs,
  parseRemoveSlopArgs,
  parseReviewArgs,
  parseTddArgs,
  parseTriageIssueArgs,
  type WorkflowFlags,
} from "./commands/parsers";
import { registerCommands } from "./commands/register";
import { createWorkflowCommandHandlers } from "./commands/workflow-handlers";
import {
  ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
  PLAN_COMMAND_SOURCE,
  GIT_REVIEW_COMMAND_SOURCE,
  LEARNING_VERSION,
  MEMORY_TAIL_LINES,
  POSTFLIGHT_INSTRUCTION,
  PROMOTION_IMPROVEMENT_THRESHOLD,
  PROMOTION_MIN_OBSERVATIONS,
  PROMOTION_SUCCESS_THRESHOLD,
  REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
  REVIEW_COMMAND_SOURCE,
  SIMPLIFY_COMMAND_SOURCE,
  TDD_COMMAND_SOURCE,
  TRIAGE_ISSUE_COMMAND_SOURCE,
} from "./lib/constants";
import { appendLine, exists, readText } from "./lib/io";
import { normalizeWhitespace, slugify, summarizeEvidence } from "./lib/text";
import { makeId, nowIso } from "./lib/time";
import { DEFAULT_HOOK_CONFIG, loadHooksConfig, type HookConfig } from "./hooks/config";
import {
  ensureLearningStore,
  loadProjectReviewGuidelines,
  maybeEmitPromotionHint,
  type LearningObservation,
  type LearningPaths,
} from "./learning/store";
import {
  extractPostflightFromAssistantText,
  isMutationToolCall,
  modeOutcome,
  parsePostflightLine,
  parsePreflightLine,
  type PreflightRecord,
} from "./policy/first-principles";
import { evaluateMutationPreflightPolicy, evaluateSpawnPolicy } from "./policy/pipeline";
import {
  createRuntimeState,
  hasValidRiskApproval,
  setAgentEnabled,
  type PolicyEvent,
} from "./state/runtime";
import {
  appendAgentStateEntry,
  appendComplianceModeEntry,
  appendPolicyEvent,
  appendPostflightEntry,
  appendPreflightEntry,
  appendRiskApprovalEntry,
  getAgentEnabledFromSession,
  getComplianceModeFromSession,
  getPreflightFromSession,
  getRiskApprovalFromSession,
} from "./state/session";
import {
  beginWorkflowTracking as beginTrackedWorkflow,
  completeWorkflowTracking as completeTrackedWorkflow,
  enqueueWorkflow as enqueueWorkflowMessage,
  ensureWorkflowSlotAvailable as ensureWorkflowSlotAvailableForCommand,
} from "./workflows/engine";
import { notifyWorkflowStarted } from "./workflows/notifications";
import {
  extractLastAssistantText,
  inferOutcomeFromText,
  type WorkflowOutcome,
} from "./runtime/assistant";
import {
  createWorkflowReaders,
  getBootstrapPayload,
  loadFirstPrinciplesConfig,
} from "./runtime/bootstrap";
import {
  runSessionEndHooks,
  type LowConfidenceEvent,
} from "./runtime/lifecycle";
import { RUNTIME_PATHS } from "./runtime/paths";
import {
  cloneRuntimeProfile,
  DEFAULT_RUNTIME_PROFILE,
  getWorkflowConfig,
  loadRuntimeProfile,
  validateRuntimeProfile,
  type RuntimeProfile,
  type WorkflowType,
} from "./runtime/profile";
import { notify, setKhalaStatus } from "./runtime/ui";
type PreflightClarify = PreflightRecord["clarify"];
type PreflightSource = PreflightRecord["source"];

type PendingWorkflow = import("./workflows/engine").PendingWorkflow<
  WorkflowType,
  WorkflowFlags
>;

let pendingWorkflow: PendingWorkflow | null = null;
const learningPathCache = new Map<string, LearningPaths>();
let activeHookConfig: HookConfig = DEFAULT_HOOK_CONFIG;
let activeRuntimeProfile: RuntimeProfile = DEFAULT_RUNTIME_PROFILE;
let lowConfidenceEvents: LowConfidenceEvent[] = [];
let bundledExtensionsInitialized = false;
const runtimeState = createRuntimeState();
let sessionFirstPrinciplesDefaults = { ...runtimeState.firstPrinciplesConfig };

const SUBAGENT_TOOL_NAMES = new Set(["subagent", "subagent_status"]);

const workflowReaders = createWorkflowReaders({
  skillflowsDir: RUNTIME_PATHS.skillflowsDir,
  commandsDir: RUNTIME_PATHS.commandsDir,
  packageSkillsPath: RUNTIME_PATHS.packageSkillsPath,
});
const execFileAsync = promisify(execFile);

function prependInterceptedCommandsPath(command: string): string {
  const escapedPath = RUNTIME_PATHS.interceptedCommandsDir.replace(/"/g, '\\"');
  return `export PATH="${escapedPath}:$PATH"\n${command}`;
}

function hasAnyRegisteredTool(pi: ExtensionAPI, names: Set<string>): boolean {
  return pi.getAllTools().some((tool) => names.has(tool.name));
}

function ensureBundledExtensions(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
): void {
  if (bundledExtensionsInitialized) return;
  bundledExtensionsInitialized = true;

  if (!hasAnyRegisteredTool(pi, SUBAGENT_TOOL_NAMES)) {
    try {
      registerSubagentExtension(pi);
      registerSubagentNotifyExtension(pi);
    } catch (error) {
      notify(
        ctx,
        `Failed to load bundled pi-subagents: ${error instanceof Error ? error.message : String(error)}`,
        "warning",
      );
    }
  }
}

function isPreflightClarify(value: unknown): value is PreflightClarify {
  return value === "yes" || value === "no";
}

function isPreflightSource(value: unknown): value is PreflightSource {
  return value === "manual" || value === "auto";
}

function setAgentEnabledState(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  enabled: boolean,
): void {
  setAgentEnabled(runtimeState, enabled);
  setKhalaStatus(ctx, enabled ? "🔷 khala enabled" : undefined);
}

function ensureAgentEnabledForCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  source: WorkflowType,
): void {
  if (runtimeState.agentEnabled) return;
  setAgentEnabledState(ctx, true);
  appendAgentStateEntry(pi, true, nowIso(), source);
  notify(ctx, `khala initialized automatically for /${source}.`, "info");
}

function addPolicyEvent(pi: ExtensionAPI, event: PolicyEvent): void {
  appendPolicyEvent(pi, runtimeState, event);
}

function ensureWorkflowSlotAvailable(ctx: ExtensionCommandContext): boolean {
  return ensureWorkflowSlotAvailableForCommand(ctx, pendingWorkflow, notify);
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
    readCommandPrompt: workflowReaders.readCommandPrompt,
    readWorkflow: workflowReaders.readWorkflow,
    readSkill: workflowReaders.readSkill,
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
    lowConfidenceThreshold: activeRuntimeProfile.lowConfidenceThreshold,
    runtimeState,
    inferOutcomeFromText,
    nowIso,
    extractPostflightFromAssistantText,
    modeOutcome,
    addPolicyEvent,
    appendPostflightEntry,
    summarizeEvidence,
    notify,
    onLowConfidence: (event) => {
      lowConfidenceEvents.push(event);
    },
  });
}

export default function khalaExtension(pi: ExtensionAPI): void {
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: (spawnContext) => {
      if (!runtimeState.agentEnabled) return spawnContext;

      const policy = evaluateSpawnPolicy(spawnContext.command, {
        hookConfig: activeHookConfig,
        hasValidRiskApproval: hasValidRiskApproval(runtimeState),
        nowIso,
      });

      if (policy.riskEvent) {
        runtimeState.riskEvents.push(policy.riskEvent);
      }

      if (policy.consumeRiskApproval) {
        runtimeState.riskApproval = null;
      }

      if (policy.blockedMessage) {
        throw new Error(policy.blockedMessage);
      }

      return {
        ...spawnContext,
        command: prependInterceptedCommandsPath(spawnContext.command),
      };
    },
  });

  pi.registerTool(bashTool);
  pi.on("session_start", async (_event, ctx) => {
    ensureBundledExtensions(pi, ctx);

    const [hookConfig, profileLoad] = await Promise.all([
      loadHooksConfig(RUNTIME_PATHS.hooksConfigPath, DEFAULT_HOOK_CONFIG),
      loadRuntimeProfile(RUNTIME_PATHS.profileConfigPath).catch((error) => ({
        profile: cloneRuntimeProfile(DEFAULT_RUNTIME_PROFILE),
        warnings: [`runtime/profile.yaml load error (${error instanceof Error ? error.message : String(error)}); using defaults.`],
      })),
    ]);

    const profileValidation = await validateRuntimeProfile(profileLoad.profile, {
      commandsDir: RUNTIME_PATHS.commandsDir,
      skillflowsDir: RUNTIME_PATHS.skillflowsDir,
    });

    const gateConfig = await loadFirstPrinciplesConfig(
      RUNTIME_PATHS.firstPrinciplesConfigPath,
      profileValidation.profile.firstPrinciplesDefaults,
    );

    activeHookConfig = hookConfig.config;
    activeRuntimeProfile = profileValidation.profile;
    sessionFirstPrinciplesDefaults = { ...gateConfig.config };

    const complianceOverride = getComplianceModeFromSession(ctx);
    runtimeState.firstPrinciplesConfig = complianceOverride ?? gateConfig.config;

    for (const warning of profileLoad.warnings) {
      notify(ctx, `Profile warning: ${warning}`, "warning");
    }
    for (const warning of profileValidation.warnings) {
      notify(ctx, `Profile validation warning: ${warning}`, "warning");
    }
    for (const warning of hookConfig.warnings) {
      notify(ctx, `Hook config warning: ${warning}`, "warning");
    }
    for (const warning of gateConfig.warnings) {
      notify(ctx, `Gate config warning: ${warning}`, "warning");
    }

    runtimeState.riskApproval = getRiskApprovalFromSession(ctx);
    runtimeState.activePreflight = getPreflightFromSession(ctx, { isPreflightClarify, isPreflightSource });
    setAgentEnabledState(ctx, getAgentEnabledFromSession(ctx));

    if (runtimeState.agentEnabled) {
      notify(
        ctx,
        `khala resumed (workflows=${profileValidation.enabledWorkflowCount}/${Object.keys(activeRuntimeProfile.workflows).length}, low-confidence=${activeRuntimeProfile.lowConfidenceThreshold.toFixed(2)}, preflight=${runtimeState.firstPrinciplesConfig.preflightMode}, postflight=${runtimeState.firstPrinciplesConfig.postflightMode}, response=${runtimeState.firstPrinciplesConfig.responseComplianceMode})`,
        "info",
      );
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!runtimeState.agentEnabled) return;
    pendingWorkflow = null;
    await runSessionEndHooks({
      pi,
      ctx,
      activeHookConfig,
      hooksDir: RUNTIME_PATHS.hooksDir,
      runtimeDailyLogPath: RUNTIME_PATHS.runtimeDailyLogPath,
      runtimeState,
      lowConfidenceEvents,
      notify,
      nowIso,
    });
    lowConfidenceEvents = [];
    setAgentEnabledState(ctx, false);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!runtimeState.agentEnabled) return;
    const bootstrap = await getBootstrapPayload({
      cwd: ctx.cwd,
      runtimeDir: RUNTIME_PATHS.runtimeDir,
      hooksDir: RUNTIME_PATHS.hooksDir,
      activeHookConfig,
      learningPathCache,
      memoryTailLines: MEMORY_TAIL_LINES,
    });
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
      const scopedPreflight = pendingWorkflow
        ? { ...preflight, workflowId: pendingWorkflow.id }
        : preflight;
      runtimeState.activePreflight = scopedPreflight;
      appendPreflightEntry(pi, scopedPreflight);
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

    const decision = evaluateMutationPreflightPolicy({
      preflightMode: runtimeState.firstPrinciplesConfig.preflightMode,
      preflight: runtimeState.activePreflight,
      toolName: event.toolName,
      activeWorkflowId: pendingWorkflow?.id ?? null,
    });

    addPolicyEvent(pi, {
      at: nowIso(),
      phase: "preflight",
      mode: runtimeState.firstPrinciplesConfig.preflightMode,
      outcome: decision.outcome,
      detail: decision.detail,
      toolName: event.toolName,
    });

    if (decision.warningMessage) {
      pendingWorkflow?.policyWarnings.push(decision.warningMessage);
      notify(ctx, decision.warningMessage, "warning");
      return;
    }

    if (decision.blockReason) {
      return {
        block: true,
        reason: decision.blockReason,
      };
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    const workflow = pendingWorkflow;
    if (!workflow) return;

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

    try {
      await completeWorkflowTracking(pi, ctx, workflow, text);
    } finally {
      pendingWorkflow = null;
    }
  });

  const agentHandlers = createAgentCommandHandlers({
    runtimeState,
    setAgentEnabledState,
    appendAgentStateEntry: (enabled) => appendAgentStateEntry(pi, enabled, nowIso()),
    clearPendingWorkflow: () => {
      pendingWorkflow = null;
    },
    runSessionEndHooks: async (ctx) => {
      await runSessionEndHooks({
        pi,
        ctx,
        activeHookConfig,
        hooksDir: RUNTIME_PATHS.hooksDir,
        runtimeDailyLogPath: RUNTIME_PATHS.runtimeDailyLogPath,
        runtimeState,
        lowConfidenceEvents,
        notify,
        nowIso,
      });
      lowConfidenceEvents = [];
    },
    notify,
  });

  const complianceHandlers = createComplianceCommandHandlers({
    runtimeState,
    notify,
    parseComplianceArgs,
    parseApproveRiskArgs,
    parsePreflightArgs: (args) => parsePreflightArgs(args, (line) => parsePreflightLine(line, nowIso)),
    parsePostflightArgs: (args) => parsePostflightArgs(args, (line) => parsePostflightLine(line, nowIso)),
    nowIso,
    getDefaultFirstPrinciplesConfig: () => sessionFirstPrinciplesDefaults,
    appendComplianceModeEntry: (record) => appendComplianceModeEntry(pi, record),
    appendRiskApprovalEntry: (approval) => appendRiskApprovalEntry(pi, approval),
    appendPreflightEntry: (record) => appendPreflightEntry(pi, record),
    appendPostflightEntry: (record) => appendPostflightEntry(pi, record),
    getActiveWorkflowId: () => pendingWorkflow?.id ?? null,
  });

  const workflowHandlers = createWorkflowCommandHandlers({
    pi,
    notify,
    nowIso,
    slugify,
    normalizeWhitespace,
    ensureWorkflowSlotAvailable,
    ensureAgentEnabledForCommand,
    resolveWorkflowConfig: (type) => getWorkflowConfig(activeRuntimeProfile, type),
    beginWorkflowTracking,
    enqueueWorkflow,
    notifyWorkflowStarted,
    parseDebugArgs,
    parseFeatureArgs,
    parseReviewArgs,
    buildReviewTarget,
    loadProjectReviewGuidelines,
    parseRemoveSlopArgs,
    parsePlanArgs,
    parseTriageIssueArgs,
    parseTddArgs,
    parseAddressOpenIssuesArgs,
    parseLearnSkillArgs,
    parseGsdArgs,
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
      PLAN_COMMAND_SOURCE,
      TRIAGE_ISSUE_COMMAND_SOURCE,
      TDD_COMMAND_SOURCE,
      ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
    },
  });

  const khala = async (args: string | undefined, ctx: ExtensionCommandContext): Promise<void> => {
    if (!runtimeState.agentEnabled) {
      setAgentEnabledState(ctx, true);
      appendAgentStateEntry(pi, true, nowIso(), "khala");
      notify(ctx, "khala initialized.", "success");
    }

    const compliancePreset = normalizeWhitespace(args ?? "") || "warn";
    await complianceHandlers.compliance(compliancePreset, ctx);
  };

  const khalaMemorySetup = async (args: string | undefined, ctx: ExtensionCommandContext): Promise<void> => {
    const parsed = parseKhalaMemorySetupArgs(args ?? "");
    if (parsed.error) {
      notify(ctx, parsed.error, "error");
      return;
    }

    const installTargetFlag = parsed.scope === "global" ? "--global" : "--project";

    try {
      await execFileAsync("uv", ["tool", "install", "graphifyy"], { cwd: ctx.cwd });
      await execFileAsync("graphify", ["install", "--platform", "pi"], { cwd: ctx.cwd });

      try {
        await execFileAsync("graphify", ["pi", "install", installTargetFlag], { cwd: ctx.cwd });
      } catch {
        await execFileAsync("graphify", ["pi", "install"], { cwd: ctx.cwd });
      }

      const version = await execFileAsync("graphify", ["--version"], { cwd: ctx.cwd });
      notify(
        ctx,
        `Graphify memory setup complete (${parsed.scope}). ${version.stdout.trim() || "graphify installed"}`,
        "success",
      );
    } catch (error) {
      notify(
        ctx,
        `Graphify setup failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  };

  const khalaMemoryRestart = async (args: string | undefined, ctx: ExtensionCommandContext): Promise<void> => {
    const parsed = parseKhalaMemoryRestartArgs(args ?? "");
    if (parsed.error) {
      notify(ctx, parsed.error, "error");
      return;
    }

    const installTargetFlag = parsed.scope === "global" ? "--global" : "--project";

    try {
      try {
        await execFileAsync("graphify", ["pi", "restart", installTargetFlag], { cwd: ctx.cwd });
      } catch {
        try {
          await execFileAsync("graphify", ["pi", "restart"], { cwd: ctx.cwd });
        } catch {
          await execFileAsync("graphify", ["restart"], { cwd: ctx.cwd });
        }
      }

      notify(ctx, `Graphify memory restarted (${parsed.scope}).`, "success");
    } catch (error) {
      notify(
        ctx,
        `Graphify restart failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  };

  const khalaMemoryRemove = async (args: string | undefined, ctx: ExtensionCommandContext): Promise<void> => {
    const parsed = parseKhalaMemoryRemoveArgs(args ?? "");
    if (parsed.error) {
      notify(ctx, parsed.error, "error");
      return;
    }

    const installTargetFlag = parsed.scope === "global" ? "--global" : "--project";

    try {
      try {
        await execFileAsync("graphify", ["pi", "uninstall", installTargetFlag], { cwd: ctx.cwd });
      } catch {
        await execFileAsync("graphify", ["pi", "uninstall"], { cwd: ctx.cwd });
      }
    } catch {
      // best effort uninstall before uv removal
    }

    try {
      await execFileAsync("uv", ["tool", "uninstall", "graphifyy"], { cwd: ctx.cwd });
      notify(ctx, `Graphify memory removed (${parsed.scope}).`, "success");
    } catch (error) {
      notify(
        ctx,
        `Graphify remove failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  };

  const { compliance: _unusedComplianceHandler, ...complianceGateHandlers } = complianceHandlers;

  registerCommands({
    pi,
    handlers: {
      ...complianceGateHandlers,
      ...workflowHandlers,
      endAgent: agentHandlers.endAgent,
      khala,
      khalaMemorySetup,
      khalaMemoryRestart,
      khalaMemoryRemove,
    },
  });
}
