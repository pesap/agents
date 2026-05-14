import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import registerFffExtension from "@ff-labs/pi-fff/src/index.ts";
import path from "node:path";
import registerSubagentExtension from "pi-subagents/index.ts";
import registerSubagentNotifyExtension from "pi-subagents/notify.ts";
import { createAgentCommandHandlers } from "./commands/agent";
import { createComplianceCommandHandlers } from "./commands/compliance";
import { createCuratorCommandHandlers } from "./commands/curator";
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
  parsePostflightArgs,
  parsePreflightArgs,
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
  PROMOTION_IMPROVEMENT_THRESHOLD,
  PROMOTION_MIN_OBSERVATIONS,
  PROMOTION_SUCCESS_THRESHOLD,
  POSTFLIGHT_INSTRUCTION,
  REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
  REVIEW_COMMAND_SOURCE,
  SHIP_COMMAND_SOURCE,
  SIMPLIFY_COMMAND_SOURCE,
  TDD_COMMAND_SOURCE,
  TRIAGE_ISSUE_COMMAND_SOURCE,
} from "./lib/constants";
import { appendLine, exists, readText } from "./lib/io";
import { normalizeWhitespace, slugify, summarizeEvidence } from "./lib/text";
import { makeId, nowIso } from "./lib/time";
import {
  DEFAULT_HOOK_CONFIG,
  loadHooksConfig,
  type HookConfig,
} from "./hooks/config";
import { refreshCuratorReport } from "./learning/curator";
import {
  KhalaAssessLearningParams,
  KhalaLearnParams,
  assessLearning,
  persistKhalaLearningRecord,
  readRecentKhalaLearningRecords,
  type KhalaLearningAssessment,
  type KhalaLearningRecord,
} from "./learning/khala-learn";
import {
  ensureLearningStore,
  getActiveLearningLessonsTail,
  getLearningMemoryTail,
  loadProjectReviewGuidelines,
  maybeEmitPromotionHint,
  type LearningLesson,
  type LearningObservation,
  type LearningPaths,
} from "./learning/store";
import {
  ensureLearnedSkillLayout,
  readLearnedSkillMetadata,
  touchLearnedSkillUsage,
} from "./learning/skills";
import { validateGeneratedSkillDir } from "./learning/skill-guard";
import {
  extractPostflightFromAssistantText,
  isMutationToolCall,
  modeOutcome,
  parsePostflightLine,
  parsePreflightLine,
  type PreflightRecord,
} from "./policy/first-principles";
import {
  evaluateMutationPreflightPolicy,
  evaluateSpawnPolicy,
} from "./policy/pipeline";
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
  extractLastUserText,
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
let memoryReadThisTurn = false;

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const int = Math.floor(value);
  return Math.max(1, Math.min(max, int));
}
let sessionFirstPrinciplesDefaults = { ...runtimeState.firstPrinciplesConfig };

const workflowReaders = createWorkflowReaders({
  skillflowsDir: RUNTIME_PATHS.skillflowsDir,
  commandsDir: RUNTIME_PATHS.commandsDir,
  packageSkillsPath: RUNTIME_PATHS.packageSkillsPath,
});
const USER_CORRECTION_PATTERN =
  /\b(wrong|not working|stalling|stalled|do not|don't|instead|actually|stop planning|implement it)\b/i;

function prependInterceptedCommandsPath(command: string): string {
  const escapedInterceptedPath = RUNTIME_PATHS.interceptedCommandsDir.replace(
    /"/g,
    '\\"',
  );
  const escapedPackageBinPath = path
    .join(RUNTIME_PATHS.packageRoot, "node_modules", ".bin")
    .replace(/"/g, '\\"');
  return `export PATH="${escapedInterceptedPath}:${escapedPackageBinPath}:$PATH"\n${command}`;
}

function warnBundledExtensionLoadFailure(
  ctx: Pick<ExtensionContext, "hasUI" | "ui"> | undefined,
  extensionName: string,
  error: unknown,
): void {
  const message = `Failed to load bundled ${extensionName}: ${error instanceof Error ? error.message : String(error)}`;
  if (ctx) {
    notify(ctx, message, "warning");
    return;
  }
  console.warn(message);
}

function registerBundledExtension(
  ctx: Pick<ExtensionContext, "hasUI" | "ui"> | undefined,
  extensionName: string,
  register: () => void,
): void {
  try {
    register();
  } catch (error) {
    warnBundledExtensionLoadFailure(ctx, extensionName, error);
  }
}

function shouldConsiderKhalaLearning(params: {
  userText: string;
  assistantText: string;
  workflow: PendingWorkflow | null;
}): boolean {
  const combined = normalizeWhitespace(
    `${params.userText} ${params.assistantText}`,
  );
  if (params.workflow !== null) return true;
  if (combined.length >= 40) return true;
  return /\b(wrong|not working|stalling|stalled|do not|don't|instead|actually|stop planning|implement it|unsigned commit|duplicate pr|stale branch|preflight|postflight)\b/i.test(
    combined,
  );
}

async function maybeAssessAndLearn(params: {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  workflow: PendingWorkflow | null;
  userText: string;
  assistantText: string;
}): Promise<KhalaLearningAssessment | null> {
  if (!runtimeState.agentEnabled) return null;
  if (
    !shouldConsiderKhalaLearning({
      userText: params.userText,
      assistantText: params.assistantText,
      workflow: params.workflow,
    })
  ) {
    return null;
  }

  const paths = await ensureLearningStore(params.ctx.cwd, learningPathCache);
  const recents = await readRecentKhalaLearningRecords(paths, 20);
  const assessment = assessLearning(
    {
      taskSummary: params.userText,
      assistantSummary: params.assistantText,
      workflowType: params.workflow?.type,
      workflowId: params.workflow?.id,
      mutationCount: params.workflow?.mutationCount ?? 0,
      loadedSkills: params.workflow?.loadedSkills ?? [],
      policyWarnings: params.workflow?.policyWarnings ?? [],
      userCorrection: USER_CORRECTION_PATTERN.test(params.userText),
    },
    recents,
  );

  params.pi.appendEntry("khala-learning-assessment", {
    at: nowIso(),
    workflowId: params.workflow?.id ?? null,
    workflowType: params.workflow?.type ?? null,
    score: assessment.score,
    confidence: assessment.confidence,
    shouldLearn: assessment.shouldLearn,
    reason: assessment.reason,
    trigger: assessment.trigger,
    lesson: assessment.lesson,
  });

  if (!assessment.shouldLearn) return assessment;

  const record: KhalaLearningRecord = {
    version: LEARNING_VERSION,
    id: makeId("khala-learn"),
    timestamp: nowIso(),
    source: "auto",
    workflowType: params.workflow?.type,
    workflowId: params.workflow?.id,
    actionTaken: [],
    ...assessment,
  };
  await persistKhalaLearningRecord(paths, record);

  notify(
    params.ctx,
    `khala learned: ${record.trigger} (score=${record.score.toFixed(2)})`,
    "info",
  );
  return assessment;
}

function shouldRunActiveLearningReview(workflow: PendingWorkflow): boolean {
  return (
    workflow.type !== "learn-skill" &&
    (workflow.mutationCount > 0 ||
      workflow.loadedSkills.length > 0 ||
      workflow.type === "debug" ||
      workflow.type === "feature" ||
      workflow.type === "review" ||
      workflow.type === "simplify" ||
      workflow.type === "tdd" ||
      workflow.type === "plan")
  );
}

function inferSkillPatchSignal(text: string): boolean {
  return /\b(?:workaround|manual step|missing step|stale|incomplete|pitfall|had to)\b/i.test(
    text,
  );
}

async function appendCuratorReportEntry(params: {
  cwd: string;
  workflow: PendingWorkflow;
  assistantText: string;
}): Promise<void> {
  if (!shouldRunActiveLearningReview(params.workflow)) return;

  const paths = await ensureLearningStore(params.cwd, learningPathCache);
  const touched: string[] = [];
  const recommendations: string[] = [];
  const reviewAt = nowIso();

  for (const skillName of params.workflow.loadedSkills) {
    const record = await touchLearnedSkillUsage({
      paths,
      skillName,
      nowIso: reviewAt,
    });
    if (!record) continue;
    touched.push(
      `${skillName} (${record.metadata.provenance}, uses=${record.metadata.useCount})`,
    );

    if (inferSkillPatchSignal(params.assistantText)) {
      recommendations.push(
        record.metadata.provenance === "agent-authored" ||
          record.metadata.provenance === "background-review-authored"
          ? `Patch learned skill \`${skillName}\` from workflow ${params.workflow.id}.`
          : `Propose a patch for read-only learned skill \`${skillName}\` from workflow ${params.workflow.id}.`,
      );
    }
  }

  if (touched.length === 0 && recommendations.length === 0) return;

  const entry = [
    `## ${reviewAt} ${params.workflow.type}/${params.workflow.id}`,
    touched.length > 0 ? `- Loaded learned skills: ${touched.join(", ")}` : "",
    recommendations.length > 0
      ? `- Recommendations: ${recommendations.join(" ")}`
      : "",
    `- Evidence: ${summarizeEvidence(params.assistantText, 220)}`,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  await appendLine(paths.curatorReport, entry);
}

function ensureBundledExtensions(
  pi: ExtensionAPI,
  ctx?: Pick<ExtensionContext, "hasUI" | "ui">,
): void {
  if (bundledExtensionsInitialized) return;
  bundledExtensionsInitialized = true;

  registerBundledExtension(ctx, "pi-subagents", () => {
    registerSubagentExtension(pi);
    registerSubagentNotifyExtension(pi);
  });

  registerBundledExtension(ctx, "@ff-labs/pi-fff", () =>
    registerFffExtension(pi),
  );
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
): Promise<{ loadedSkills: string[] }> {
  return enqueueWorkflowMessage({
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
    appendLine,
    ensureLearningStore: (cwd) => ensureLearningStore(cwd, learningPathCache),
    maybeEmitPromotionHint: (paths, observation, context) =>
      maybeEmitPromotionHint({
        paths,
        observation: observation as LearningObservation<
          WorkflowType,
          WorkflowOutcome
        >,
        ctx: context,
        promotionMinObservations: PROMOTION_MIN_OBSERVATIONS,
        promotionSuccessThreshold: PROMOTION_SUCCESS_THRESHOLD,
        promotionImprovementThreshold: PROMOTION_IMPROVEMENT_THRESHOLD,
        nowIso,
        summarizeEvidence,
        notify,
      }),
    notify,
    onLowConfidence: (event) => {
      lowConfidenceEvents.push(event);
    },
  });
  try {
    await appendCuratorReportEntry({
      cwd: ctx.cwd,
      workflow,
      assistantText,
    });
    const paths = await ensureLearningStore(ctx.cwd, learningPathCache);
    await refreshCuratorReport({
      paths,
      nowIso: nowIso(),
    });
  } catch (error) {
    notify(
      ctx,
      `Active-learning review failed: ${error instanceof Error ? error.message : String(error)}`,
      "warning",
    );
  }
}

export default function khalaExtension(pi: ExtensionAPI): void {
  ensureBundledExtensions(pi);

  pi.registerTool({
    name: "khala_assess_learning",
    label: "Khala Assess Learning",
    description:
      "Assess whether a task produced a reusable, non-sensitive lesson worth storing for khala.",
    parameters: KhalaAssessLearningParams,
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const paths = await ensureLearningStore(ctx.cwd, learningPathCache);
      const recents = await readRecentKhalaLearningRecords(paths, 20);
      const assessment = assessLearning(params, recents);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(assessment, null, 2),
          },
        ],
        details: assessment,
      };
    },
  });

  pi.registerTool({
    name: "khala_read_memory",
    label: "Khala Read Memory",
    description:
      "Read current khala memory context (active lessons, recent learnings, and memory tail) before tool use.",
    parameters: Type.Object({
      tailLines: Type.Optional(
        Type.Number({
          description: "Number of tail lines to include from memory/lessons (default 8, max 50)",
        }),
      ),
      recentLimit: Type.Optional(
        Type.Number({
          description: "Number of recent khala learned records to include (default 8, max 50)",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const tailLines = clampPositiveInt(params.tailLines, 8, 50);
      const recentLimit = clampPositiveInt(params.recentLimit, 8, 50);
      const paths = await ensureLearningStore(ctx.cwd, learningPathCache);
      const [memoryTail, activeLessons, recentRecords] = await Promise.all([
        getLearningMemoryTail(ctx.cwd, learningPathCache, tailLines),
        getActiveLearningLessonsTail(ctx.cwd, learningPathCache, tailLines),
        readRecentKhalaLearningRecords(paths, recentLimit),
      ]);

      memoryReadThisTurn = true;

      const payload = {
        storeRoot: paths.root,
        memoryTail,
        activeLessons,
        recentLearnings: recentRecords.map((record) => ({
          timestamp: record.timestamp,
          trigger: record.trigger,
          lesson: record.lesson,
          score: record.score,
          confidence: record.confidence,
          kind: record.kind,
          workflowType: record.workflowType ?? null,
        })),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
        details: payload,
      };
    },
  });

  pi.registerTool({
    name: "khala_learn",
    label: "Khala Learn",
    description:
      "Persist a structured khala learning record when an assessment says it is worth storing.",
    parameters: KhalaLearnParams,
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const kind =
        params.kind === "workflow_correction" ||
        params.kind === "preference" ||
        params.kind === "tool_rule" ||
        params.kind === "project_fact"
          ? (params.kind as LearningLesson["type"])
          : "workflow_correction";
      const scope =
        params.scope === "global" || params.scope === "repo"
          ? (params.scope as LearningLesson["scope"])
          : "repo";
      const paths = await ensureLearningStore(ctx.cwd, learningPathCache);
      const record: KhalaLearningRecord = {
        version: LEARNING_VERSION,
        id: makeId("khala-learn"),
        timestamp: nowIso(),
        source: params.source === "manual" ? "manual" : "auto",
        workflowType: params.workflowType,
        workflowId: params.workflowId,
        actionTaken: params.actionTaken,
        shouldLearn: true,
        score: params.score,
        confidence: params.confidence,
        kind,
        scope,
        trigger: params.trigger,
        lesson: params.lesson,
        reason: "Stored by khala_learn tool.",
        evidence: [],
        evidenceSnippet: params.evidenceSnippet,
        promotable: params.promotable ?? false,
        sensitive: false,
        components: {
          reusability: 1,
          evidenceStrength: 1,
          impact: 1,
          novelty: 1,
          clarity: 1,
        },
      };
      await persistKhalaLearningRecord(paths, record);
      return {
        content: [
          {
            type: "text",
            text: `Stored khala learning: ${record.trigger} (score=${record.score.toFixed(2)}, confidence=${record.confidence.toFixed(2)})`,
          },
        ],
        details: record,
      };
    },
  });

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
    const [hookConfig, profileLoad] = await Promise.all([
      loadHooksConfig(RUNTIME_PATHS.hooksConfigPath, DEFAULT_HOOK_CONFIG),
      loadRuntimeProfile(RUNTIME_PATHS.profileConfigPath).catch((error) => ({
        profile: cloneRuntimeProfile(DEFAULT_RUNTIME_PROFILE),
        warnings: [
          `runtime/profile.yaml load error (${error instanceof Error ? error.message : String(error)}); using defaults.`,
        ],
      })),
    ]);

    const profileValidation = await validateRuntimeProfile(
      profileLoad.profile,
      {
        commandsDir: RUNTIME_PATHS.commandsDir,
        skillflowsDir: RUNTIME_PATHS.skillflowsDir,
      },
    );

    const gateConfig = await loadFirstPrinciplesConfig(
      RUNTIME_PATHS.firstPrinciplesConfigPath,
      profileValidation.profile.firstPrinciplesDefaults,
    );

    activeHookConfig = hookConfig.config;
    activeRuntimeProfile = profileValidation.profile;
    sessionFirstPrinciplesDefaults = { ...gateConfig.config };

    const complianceOverride = getComplianceModeFromSession(ctx);
    runtimeState.firstPrinciplesConfig =
      complianceOverride ?? gateConfig.config;

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
    runtimeState.activePreflight = getPreflightFromSession(ctx, {
      isPreflightClarify,
      isPreflightSource,
    });
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
    memoryReadThisTurn = false;
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
      return;
    }

    if (!runtimeState.agentEnabled) return;
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!runtimeState.agentEnabled) return;

    if (event.toolName === "khala_read_memory") {
      memoryReadThisTurn = true;
    } else if (!memoryReadThisTurn) {
      return {
        block: true,
        reason:
          "MEMORY READ REQUIRED\n\nCall khala_read_memory before any other tool call in this turn.",
      };
    }

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
    const text =
      extractLastAssistantText(event.messages) ||
      "No assistant output captured.";
    const userText = extractLastUserText(event.messages);

    if (workflow &&
      runtimeState.firstPrinciplesConfig.responseComplianceMode === "enforce"
    ) {
      const resultMatch = text.match(
        /^\s*Result:\s*(success|partial|failed)\s*$/im,
      );
      const confidenceMatch = text.match(/^\s*Confidence:\s*([\d.]+)\s*$/im);
      const confidenceValue = confidenceMatch
        ? parseFloat(confidenceMatch[1])
        : null;
      const hasResult = resultMatch !== null;
      const hasConfidence =
        confidenceValue !== null &&
        confidenceValue >= 0 &&
        confidenceValue <= 1;
      if (!hasResult || !hasConfidence) {
        return {
          block: true,
          reason: [
            "HARNESS COMPLIANCE FAILED",
            "",
            hasResult
              ? ""
              : "Missing or invalid: Result: success|partial|failed",
            hasConfidence
              ? ""
              : confidenceMatch
                ? "Invalid: Confidence must be 0..1"
                : "Missing: Confidence: 0..1",
            "",
            "Add these lines to your response and retry.",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }
    }

    if (workflow && workflow.type === "learn-skill" && workflow.flags.dryRun !== true) {
      const targetSkill =
        typeof workflow.flags.targetSkill === "string"
          ? workflow.flags.targetSkill
          : null;
      if (targetSkill) {
        const paths = await ensureLearningStore(ctx.cwd, learningPathCache);
        const record = await readLearnedSkillMetadata(paths, targetSkill);
        if (record) {
          const guard = await validateGeneratedSkillDir(record.dir);
          if (!guard.ok) {
            return {
              block: true,
              reason: [
                "LEARNED SKILL SAFETY CHECK FAILED",
                "",
                ...guard.issues.map((issue) => `- ${issue.file}: ${issue.reason}`),
                "",
                "Remove the unsafe content and retry.",
              ].join("\n"),
            };
          }
        }
      }
    }

    try {
      if (workflow) {
        await completeWorkflowTracking(pi, ctx, workflow, text);
      }
      await maybeAssessAndLearn({
        pi,
        ctx,
        workflow,
        userText,
        assistantText: text,
      });
    } finally {
      pendingWorkflow = null;
    }
  });

  const agentHandlers = createAgentCommandHandlers({
    runtimeState,
    setAgentEnabledState,
    appendAgentStateEntry: (enabled) =>
      appendAgentStateEntry(pi, enabled, nowIso()),
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
    parsePreflightArgs: (args) =>
      parsePreflightArgs(args, (line) => parsePreflightLine(line, nowIso)),
    parsePostflightArgs: (args) =>
      parsePostflightArgs(args, (line) => parsePostflightLine(line, nowIso)),
    nowIso,
    getDefaultFirstPrinciplesConfig: () => sessionFirstPrinciplesDefaults,
    appendComplianceModeEntry: (record) =>
      appendComplianceModeEntry(pi, record),
    appendRiskApprovalEntry: (approval) =>
      appendRiskApprovalEntry(pi, approval),
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
    resolveWorkflowConfig: (type) =>
      getWorkflowConfig(activeRuntimeProfile, type),
    beginWorkflowTracking,
    enqueueWorkflow,
    notifyWorkflowStarted,
    parseDebugArgs,
    parseFeatureArgs,
    parseReviewArgs,
    buildReviewTarget,
    loadProjectReviewGuidelines,
    parsePlanArgs,
    parseTriageIssueArgs,
    parseTddArgs,
    parseAddressOpenIssuesArgs,
    parseLearnSkillArgs,
    ensureLearningStore: (cwd) => ensureLearningStore(cwd, learningPathCache),
    ensureLearnedSkillLayout: async (cwd, skillName, sourceRunId) => {
      const paths = await ensureLearningStore(cwd, learningPathCache);
      return ensureLearnedSkillLayout({
        paths,
        skillName,
        nowIso: nowIso(),
        provenance: "agent-authored",
        sourceRunId,
      });
    },
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
      SHIP_COMMAND_SOURCE,
      TRIAGE_ISSUE_COMMAND_SOURCE,
      TDD_COMMAND_SOURCE,
      ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
    },
  });

  const curatorHandlers = createCuratorCommandHandlers({
    ensureLearningStore: (cwd) => ensureLearningStore(cwd, learningPathCache),
    nowIso,
    notify,
  });

  const khala = async (
    args: string | undefined,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    if (!runtimeState.agentEnabled) {
      setAgentEnabledState(ctx, true);
      appendAgentStateEntry(pi, true, nowIso(), "khala");
      notify(ctx, "khala initialized. End-of-turn learning assessment is now active.", "success");
    }

    const compliancePreset = normalizeWhitespace(args ?? "") || "warn";
    await complianceHandlers.compliance(compliancePreset, ctx);
  };

  const { compliance: _unusedComplianceHandler, ...complianceGateHandlers } =
    complianceHandlers;

  registerCommands({
    pi,
    handlers: {
      ...complianceGateHandlers,
      ...workflowHandlers,
      ...curatorHandlers,
      endAgent: agentHandlers.endAgent,
      khala,
    },
  });
}
