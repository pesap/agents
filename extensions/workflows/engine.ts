import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { load as loadYaml } from "js-yaml";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isRecord } from "../lib/io";
import type { PostflightRecord, PreflightRecord } from "../policy/first-principles";
import type { RuntimeState } from "../state/runtime";

export type NotifyType = "info" | "error" | "warning" | "success";

export interface PendingWorkflow<TWorkflowType extends string = string, TWorkflowFlags = Record<string, unknown>> {
  id: string;
  type: TWorkflowType;
  input: string;
  flags: TWorkflowFlags;
  startedAt: string;
  runFile: string;
  mutationCount: number;
  policyWarnings: string[];
}

export interface LearningPathsLike {
  runsDir: string;
  learningJsonl: string;
  memoryMd: string;
}

export interface WorkflowInference<TWorkflowOutcome extends string = string> {
  outcome: TWorkflowOutcome;
  confidence: number;
  strictViolation?: string;
}

export function ensureWorkflowSlotAvailable<TWorkflowType extends string>(
  ctx: ExtensionCommandContext,
  pendingWorkflow: PendingWorkflow<TWorkflowType, unknown> | null,
  notify: (ctx: ExtensionCommandContext, message: string, type: NotifyType) => void,
): boolean {
  if (!pendingWorkflow) return true;
  notify(ctx, `Workflow already running (${pendingWorkflow.type}). Wait for completion before starting another.`, "error");
  return false;
}

function normalizeSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const validSkills = raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry));
  return [...new Set(validSkills)];
}

function parseWorkflowSkills(rawWorkflowYaml: string): string[] {
  try {
    const parsed = loadYaml(rawWorkflowYaml);
    if (!isRecord(parsed)) return [];
    return normalizeSkills(parsed.skills);
  } catch {
    return [];
  }
}

function parsePromptFrontmatter(rawPrompt: string): { template: string; skills: string[] } {
  const frontmatterMatch = rawPrompt.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    return { template: rawPrompt, skills: [] };
  }

  const [, frontmatter] = frontmatterMatch;
  try {
    const parsed = loadYaml(frontmatter);
    const skills = isRecord(parsed) ? normalizeSkills(parsed.skills) : [];
    return {
      template: rawPrompt.slice(frontmatterMatch[0].length),
      skills,
    };
  } catch {
    return { template: rawPrompt, skills: [] };
  }
}

export async function enqueueWorkflow(params: {
  pi: ExtensionAPI;
  workflowPromptName: string;
  workflowFileName: string;
  sections: string[];
  readCommandPrompt: (name: string) => Promise<string>;
  readWorkflow: (name: string) => Promise<string>;
  readSkill?: (name: string) => Promise<string>;
}): Promise<void> {
  const [promptTemplateRaw, workflowSpec] = await Promise.all([
    params.readCommandPrompt(params.workflowPromptName),
    params.readWorkflow(params.workflowFileName),
  ]);

  const prompt = parsePromptFrontmatter(promptTemplateRaw);
  const workflowSkills = prompt.skills.length > 0 ? prompt.skills : parseWorkflowSkills(workflowSpec);
  const skillSections = await Promise.all(
    workflowSkills.map(async (skillName) => {
      if (!params.readSkill) {
        return `[SKILL:${skillName}]\n(Skill loading unavailable in this runtime)`;
      }
      const content = (await params.readSkill(skillName)).trim();
      if (!content) {
        throw new Error(`Workflow prompt ${params.workflowPromptName} requires missing skill: ${skillName}`);
      }
      return `[SKILL:${skillName}]\n${content}`;
    }),
  );

  const payload = [
    prompt.template.trim(),
    "",
    skillSections.length > 0 ? "Workflow skills context:" : "",
    ...skillSections.map((section) => ["```markdown", section, "```"].join("\n")),
    skillSections.length > 0 ? "" : "",
    "Workflow spec:",
    "```yaml",
    workflowSpec.trim(),
    "```",
    "",
    ...params.sections,
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  params.pi.sendUserMessage(payload);
}

export async function beginWorkflowTracking<TWorkflowType extends string, TWorkflowFlags>(params: {
  pi: ExtensionAPI;
  ctx: ExtensionCommandContext;
  type: TWorkflowType;
  input: string;
  flags: TWorkflowFlags;
  learningVersion: number;
  ensureLearningStore: (cwd: string) => Promise<LearningPathsLike>;
  makeId: (prefix: string) => string;
  nowIso: () => string;
  summarizeEvidence: (text: string, max?: number) => string;
  runtimeState: RuntimeState;
  appendPreflightEntry: (pi: ExtensionAPI, record: PreflightRecord) => void;
}): Promise<PendingWorkflow<TWorkflowType, TWorkflowFlags>> {
  const paths = await params.ensureLearningStore(params.ctx.cwd);
  const id = params.makeId(params.type);
  const startedAt = params.nowIso();
  const runFile = path.join(paths.runsDir, `${id}.json`);

  const record = {
    version: params.learningVersion,
    id,
    type: params.type,
    input: params.input,
    flags: params.flags,
    status: "started",
    startedAt,
  };

  await fs.writeFile(runFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  params.pi.appendEntry("khala-workflow-start", { id, type: params.type, input: params.input, flags: params.flags, startedAt });

  const pending: PendingWorkflow<TWorkflowType, TWorkflowFlags> = {
    id,
    type: params.type,
    input: params.input,
    flags: params.flags,
    startedAt,
    runFile,
    mutationCount: 0,
    policyWarnings: [],
  };

  params.runtimeState.latestPostflight = null;

  const autoPreflightReason = params.summarizeEvidence(params.input, 120).replace(/"/g, "'") || "workflow requested";
  params.runtimeState.activePreflight = {
    at: startedAt,
    skill: params.type,
    reason: autoPreflightReason,
    clarify: "no",
    raw: `Preflight: skill=${params.type} reason="${autoPreflightReason}" clarify=no`,
    source: "auto",
    workflowId: id,
  };
  params.appendPreflightEntry(params.pi, params.runtimeState.activePreflight);

  return pending;
}

export async function completeWorkflowTracking<TWorkflowType extends string, TWorkflowFlags, TWorkflowOutcome extends string>(params: {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  workflow: PendingWorkflow<TWorkflowType, TWorkflowFlags>;
  assistantText: string;
  learningVersion: number;
  lowConfidenceThreshold: number;
  runtimeState: RuntimeState;
  inferOutcomeFromText: (text: string) => WorkflowInference<TWorkflowOutcome>;
  nowIso: () => string;
  extractPostflightFromAssistantText: (text: string, nowIso: () => string) => PostflightRecord | null;
  modeOutcome: (mode: RuntimeState["firstPrinciplesConfig"]["postflightMode"], violation: boolean) => RuntimeState["policyEvents"][number]["outcome"];
  addPolicyEvent: (pi: ExtensionAPI, event: RuntimeState["policyEvents"][number]) => void;
  appendPostflightEntry: (pi: ExtensionAPI, record: PostflightRecord) => void;
  summarizeEvidence: (text: string, max?: number) => string;
  notify: (ctx: ExtensionContext, message: string, type: NotifyType) => void;
  onLowConfidence: (event: {
    at: string;
    workflowId: string;
    workflowType: TWorkflowType;
    confidence: number;
    outcome: TWorkflowOutcome;
  }) => void;
}): Promise<void> {
  const inference = params.inferOutcomeFromText(params.assistantText);
  const finishedAt = params.nowIso();

  const postflightFromOutput = params.extractPostflightFromAssistantText(params.assistantText, params.nowIso) ?? params.runtimeState.latestPostflight;
  const postflightMissing = params.workflow.mutationCount > 0 && !postflightFromOutput;
  const postflightDecision = params.modeOutcome(params.runtimeState.firstPrinciplesConfig.postflightMode, postflightMissing);

  params.addPolicyEvent(params.pi, {
    at: finishedAt,
    phase: "postflight",
    mode: params.runtimeState.firstPrinciplesConfig.postflightMode,
    outcome: postflightDecision,
    detail: postflightMissing
      ? "Missing postflight evidence after mutation."
      : `Postflight evidence present (${postflightFromOutput?.result ?? "unknown"}).`,
  });

  if (postflightDecision === "warn") {
    const warning = "Policy warning: Missing postflight evidence after mutation.";
    params.workflow.policyWarnings.push(warning);
    params.notify(params.ctx, warning, "warning");
  }

  if (postflightFromOutput) {
    params.runtimeState.latestPostflight = postflightFromOutput;
    params.appendPostflightEntry(params.pi, postflightFromOutput);
  }

  const hasPreflightWarning = params.workflow.policyWarnings.some((line) => line.includes("Missing valid preflight"));
  const qualityScore = Math.max(0, 100 - (hasPreflightWarning ? 50 : 0) - (postflightMissing ? 20 : 0));

  const strictViolations: string[] = [];
  if (inference.strictViolation) strictViolations.push(inference.strictViolation);
  if (postflightMissing && params.runtimeState.firstPrinciplesConfig.postflightMode === "enforce") {
    strictViolations.push("Missing required postflight evidence.");
  }

  const strictViolation = strictViolations.length > 0 ? strictViolations.join(" ") : null;
  const outcome = (strictViolation ? "failed" : inference.outcome) as TWorkflowOutcome;
  const confidence = inference.confidence;

  const evidenceSnippet = strictViolation
    ? params.summarizeEvidence(`${strictViolation} ${params.assistantText}`)
    : params.summarizeEvidence(params.assistantText);

  const runRecord = {
    version: params.learningVersion,
    id: params.workflow.id,
    type: params.workflow.type,
    input: params.workflow.input,
    flags: params.workflow.flags,
    startedAt: params.workflow.startedAt,
    finishedAt,
    outcome,
    confidence,
    strictViolation,
    evidenceSnippet,
    policy: {
      preflightMode: params.runtimeState.firstPrinciplesConfig.preflightMode,
      postflightMode: params.runtimeState.firstPrinciplesConfig.postflightMode,
      mutationCount: params.workflow.mutationCount,
      warnings: params.workflow.policyWarnings,
      postflightMissing,
      qualityScore,
      postflight: postflightFromOutput,
    },
  };

  await fs.writeFile(params.workflow.runFile, `${JSON.stringify(runRecord, null, 2)}\n`, "utf8");

  params.pi.appendEntry("khala-workflow-complete", {
    id: params.workflow.id,
    type: params.workflow.type,
    outcome,
    confidence,
    strictViolation,
    qualityScore,
    mutationCount: params.workflow.mutationCount,
    postflightMissing,
    at: finishedAt,
  });

  if (confidence < params.lowConfidenceThreshold) {
    params.onLowConfidence({
      at: finishedAt,
      workflowId: params.workflow.id,
      workflowType: params.workflow.type,
      confidence,
      outcome,
    });
  }

  params.notify(
    params.ctx,
    strictViolation
      ? `Workflow ${params.workflow.type} completed with strict-output violation (${strictViolation}). Marked failed.`
      : `Workflow ${params.workflow.type} completed (${outcome}, confidence=${confidence.toFixed(2)}, q=${qualityScore}).`,
    strictViolation ? "error" : "info",
  );

  if (params.workflow.mutationCount > 0) {
    params.runtimeState.activePreflight = null;
    params.runtimeState.latestPostflight = null;
  }
}
