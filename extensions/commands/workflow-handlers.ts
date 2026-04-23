import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import path from "node:path";

type NotifyType = "info" | "error" | "warning" | "success";
type CommandHandler = (args: string | undefined, ctx: ExtensionCommandContext) => Promise<void>;
type WorkflowType =
  | "debug"
  | "feature"
  | "review"
  | "git-review"
  | "simplify"
  | "learn-skill"
  | "remove-slop"
  | "domain-model"
  | "to-prd"
  | "to-issues"
  | "triage-issue"
  | "tdd"
  | "address-open-issues";

type WorkflowFlags = Record<string, string | number | boolean | null | string[]>;

type ReviewArgsResult =
  | { mode: "uncommitted"; extraInstruction?: string }
  | { mode: "branch"; branch: string; extraInstruction?: string }
  | { mode: "commit"; commit: string; extraInstruction?: string }
  | { mode: "pr"; pr: string; extraInstruction?: string }
  | { mode: "folder"; paths: string[]; extraInstruction?: string }
  | { error: string };

interface ScopedTarget {
  summary: string;
  instruction: string;
  flags: WorkflowFlags;
}

interface WorkflowRuntimeConfig {
  promptFile: string;
  workflowFile: string;
  entryType: string;
}

const WORKFLOW_RUNTIME: Record<WorkflowType, WorkflowRuntimeConfig> = {
  debug: {
    promptFile: "debug-workflow.md",
    workflowFile: "debug-workflow.yaml",
    entryType: "pesap-debug-command",
  },
  feature: {
    promptFile: "feature-workflow.md",
    workflowFile: "feature-workflow.yaml",
    entryType: "pesap-feature-command",
  },
  review: {
    promptFile: "review-workflow.md",
    workflowFile: "review-workflow.yaml",
    entryType: "pesap-review-command",
  },
  "git-review": {
    promptFile: "git-review-workflow.md",
    workflowFile: "git-review-workflow.yaml",
    entryType: "pesap-git-review-command",
  },
  simplify: {
    promptFile: "simplify-workflow.md",
    workflowFile: "simplify-workflow.yaml",
    entryType: "pesap-simplify-command",
  },
  "remove-slop": {
    promptFile: "remove-slop-workflow.md",
    workflowFile: "remove-slop-workflow.yaml",
    entryType: "pesap-remove-slop-command",
  },
  "domain-model": {
    promptFile: "domain-model-workflow.md",
    workflowFile: "domain-model-workflow.yaml",
    entryType: "pesap-domain-model-command",
  },
  "to-prd": {
    promptFile: "to-prd-workflow.md",
    workflowFile: "to-prd-workflow.yaml",
    entryType: "pesap-to-prd-command",
  },
  "to-issues": {
    promptFile: "to-issues-workflow.md",
    workflowFile: "to-issues-workflow.yaml",
    entryType: "pesap-to-issues-command",
  },
  "triage-issue": {
    promptFile: "triage-issue-workflow.md",
    workflowFile: "triage-issue-workflow.yaml",
    entryType: "pesap-triage-issue-command",
  },
  tdd: {
    promptFile: "tdd-workflow.md",
    workflowFile: "tdd-workflow.yaml",
    entryType: "pesap-tdd-command",
  },
  "address-open-issues": {
    promptFile: "address-open-issues-workflow.md",
    workflowFile: "address-open-issues-workflow.yaml",
    entryType: "pesap-address-open-issues-command",
  },
  "learn-skill": {
    promptFile: "learn-skill-workflow.md",
    workflowFile: "learn-skill-workflow.yaml",
    entryType: "pesap-learn-skill-command",
  },
};

interface RunWorkflowCommandParams {
  ctx: ExtensionCommandContext;
  type: WorkflowType;
  input: string;
  flags: WorkflowFlags;
  sections: string[];
  entry: Record<string, string | number | boolean | null | string[]>;
  startedMessage: string;
  subagentAvailable?: boolean;
  subagentCommandName?: string;
}

export function createWorkflowCommandHandlers(params: {
  pi: ExtensionAPI;
  notify: (ctx: ExtensionCommandContext, message: string, type: NotifyType) => void;
  nowIso: () => string;
  slugify: (value: string) => string;
  normalizeWhitespace: (value: string) => string;
  ensureWorkflowSlotAvailable: (ctx: ExtensionCommandContext) => boolean;
  ensureAgentEnabledForCommand: (pi: ExtensionAPI, ctx: ExtensionCommandContext, source: WorkflowType) => void;
  hasSubagentTool: (pi: ExtensionAPI) => boolean;
  beginWorkflowTracking: (
    pi: ExtensionAPI,
    ctx: ExtensionCommandContext,
    type: WorkflowType,
    input: string,
    flags: WorkflowFlags,
  ) => Promise<unknown>;
  enqueueWorkflow: (pi: ExtensionAPI, workflowPromptName: string, workflowFileName: string, sections: string[]) => Promise<void>;
  notifySubagentUnavailable: (
    ctx: ExtensionCommandContext,
    commandName: string,
    notify: (ctx: ExtensionCommandContext, message: string, type: NotifyType) => void,
  ) => void;
  notifyWorkflowStarted: (ctx: ExtensionCommandContext, message: string, notify: (ctx: ExtensionCommandContext, message: string, type: NotifyType) => void) => void;
  parseDebugArgs: (args: string) => { problem: string; parallel: number; fix: boolean };
  parseFeatureArgs: (args: string) => { request: string; parallel: number; ship: boolean };
  parseReviewArgs: (args: string, cwd: string, commandName?: string) => ReviewArgsResult;
  buildReviewTarget: (parsed: Exclude<ReviewArgsResult, { error: string }>) => ScopedTarget;
  loadProjectReviewGuidelines: (cwd: string) => Promise<string | null>;
  parseRemoveSlopArgs: (args: string) => { scope: string; parallel: number };
  parseDomainModelArgs: (args: string) => { plan: string };
  parseToPrdArgs: (args: string) => { context: string };
  parseToIssuesArgs: (args: string) => { source: string };
  parseTriageIssueArgs: (args: string) => { problem: string };
  parseTddArgs: (args: string) => { goal: string; language: string };
  parseAddressOpenIssuesArgs: (args: string) => { limit: number; repo: string };
  parseLearnSkillArgs: (args: string) => { topic: string; fromFile?: string; fromUrl?: string; dryRun: boolean };
  ensureLearningStore: (cwd: string) => Promise<{ skillsDir: string }>;
  exists: (filePath: string) => Promise<boolean>;
  readText: (filePath: string) => Promise<string>;
  buildSkillTemplate: (skillName: string, topic: string) => string;
  buildSimplifyTarget: (parsed: Exclude<ReviewArgsResult, { error: string }>) => ScopedTarget;
  constants: {
    POSTFLIGHT_INSTRUCTION: string;
    REQUIRED_WORKFLOW_FOOTER_INSTRUCTION: string;
    REVIEW_COMMAND_SOURCE: string;
    GIT_REVIEW_COMMAND_SOURCE: string;
    SIMPLIFY_COMMAND_SOURCE: string;
    DOMAIN_MODEL_COMMAND_SOURCE: string;
    TO_PRD_COMMAND_SOURCE: string;
    TO_ISSUES_COMMAND_SOURCE: string;
    TRIAGE_ISSUE_COMMAND_SOURCE: string;
    TDD_COMMAND_SOURCE: string;
    ADDRESS_OPEN_ISSUES_COMMAND_SOURCE: string;
  };
}): {
  debug: CommandHandler;
  feature: CommandHandler;
  review: CommandHandler;
  gitReview: CommandHandler;
  simplify: CommandHandler;
  removeSlop: CommandHandler;
  domainModel: CommandHandler;
  toPrd: CommandHandler;
  toIssues: CommandHandler;
  triageIssue: CommandHandler;
  tdd: CommandHandler;
  addressOpenIssues: CommandHandler;
  learnSkill: CommandHandler;
} {
  const {
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
    ensureLearningStore,
    exists,
    readText,
    buildSkillTemplate,
    buildSimplifyTarget,
    constants,
  } = params;

  async function runWorkflowCommand(config: RunWorkflowCommandParams): Promise<void> {
    const runtime = WORKFLOW_RUNTIME[config.type];

    ensureAgentEnabledForCommand(pi, config.ctx, config.type);
    await beginWorkflowTracking(pi, config.ctx, config.type, config.input, config.flags);
    await enqueueWorkflow(pi, runtime.promptFile, runtime.workflowFile, config.sections);

    pi.appendEntry(runtime.entryType, {
      ...config.entry,
      at: nowIso(),
    });

    if (config.subagentCommandName && config.subagentAvailable === false) {
      notifySubagentUnavailable(config.ctx, config.subagentCommandName, notify);
    }

    notifyWorkflowStarted(config.ctx, config.startedMessage, notify);
  }

  return {
    debug: async (args, ctx) => {
      const parsed = parseDebugArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.problem) {
        notify(ctx, "Usage: /debug <problem> [--parallel N] [--fix]", "error");
        return;
      }

      const subagentAvailable = hasSubagentTool(pi);
      const parallelTarget = subagentAvailable ? parsed.parallel : 1;
      const applyFixMode = parsed.fix ? "yes" : "no";

      await runWorkflowCommand({
        ctx,
        type: "debug",
        input: parsed.problem,
        flags: {
          parallel: parallelTarget,
          fix: parsed.fix,
          subagentAvailable,
        },
        sections: [
          `User problem: ${parsed.problem}`,
          `Parallel subagents target: ${parallelTarget}`,
          `Apply fix: ${applyFixMode}`,
          "",
          subagentAvailable
            ? "Instruction: If the subagent tool is available, run parallel hypothesis investigations and synthesize findings before selecting a fix."
            : "Instruction: pi-subagents is not installed in this session, run hypothesis investigations sequentially without subagent delegation.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          problem: parsed.problem,
          parallel: parallelTarget,
          fix: parsed.fix,
          subagentAvailable,
        },
        subagentAvailable,
        subagentCommandName: "debug",
        startedMessage: `Started debug workflow (parallel=${parallelTarget}, fix=${parsed.fix ? "on" : "off"}, subagents=${subagentAvailable ? "on" : "off"}).`,
      });
    },

    feature: async (args, ctx) => {
      const parsed = parseFeatureArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.request) {
        notify(ctx, "Usage: /feature <request> [--parallel N] [--ship]", "error");
        return;
      }

      const subagentAvailable = hasSubagentTool(pi);
      const parallelTarget = subagentAvailable ? parsed.parallel : 1;

      await runWorkflowCommand({
        ctx,
        type: "feature",
        input: parsed.request,
        flags: {
          parallel: parallelTarget,
          ship: parsed.ship,
          subagentAvailable,
        },
        sections: [
          `Feature request: ${parsed.request}`,
          `Parallel subagents target: ${parallelTarget}`,
          `Ship mode: ${parsed.ship ? "yes" : "no"}`,
          "",
          subagentAvailable
            ? "Instruction: Use parallel subagents for implementation/tests/docs when that reduces delivery time or risk."
            : "Instruction: pi-subagents is not installed in this session, run implementation/tests/docs sequentially without subagent delegation.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          request: parsed.request,
          parallel: parallelTarget,
          ship: parsed.ship,
          subagentAvailable,
        },
        subagentAvailable,
        subagentCommandName: "feature",
        startedMessage: `Started feature workflow (parallel=${parallelTarget}, ship=${parsed.ship ? "on" : "off"}, subagents=${subagentAvailable ? "on" : "off"}).`,
      });
    },

    review: async (args, ctx) => {
      const parsed = parseReviewArgs(args ?? "", ctx.cwd);
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      if ("error" in parsed) {
        notify(ctx, parsed.error, "error");
        return;
      }

      const target = buildReviewTarget(parsed);
      const projectGuidelines = await loadProjectReviewGuidelines(ctx.cwd);

      await runWorkflowCommand({
        ctx,
        type: "review",
        input: target.summary,
        flags: {
          ...target.flags,
          extraInstruction: parsed.extraInstruction ?? null,
          source: constants.REVIEW_COMMAND_SOURCE,
        },
        sections: [
          `Review target: ${target.summary}`,
          `Target mode: ${parsed.mode}`,
          `Source reference: ${constants.REVIEW_COMMAND_SOURCE}`,
          "",
          `Instruction: ${target.instruction}`,
          parsed.extraInstruction ? `Additional focus: ${parsed.extraInstruction}` : "",
          projectGuidelines
            ? ["", "Project review guidelines (REVIEW_GUIDELINES.md):", "```markdown", projectGuidelines, "```"].join("\n")
            : "",
          "Instruction: Prioritize correctness, security, performance, and maintainability findings with concrete evidence.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          mode: parsed.mode,
          ...target.flags,
          extraInstruction: parsed.extraInstruction ?? null,
          source: constants.REVIEW_COMMAND_SOURCE,
        },
        startedMessage: `Started review workflow (${target.summary}).`,
      });
    },

    gitReview: async (args, ctx) => {
      const extraFocus = normalizeWhitespace(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      const summary = extraFocus ? `current repository (${extraFocus})` : "current repository";

      await runWorkflowCommand({
        ctx,
        type: "git-review",
        input: summary,
        flags: {
          extraFocus: extraFocus || null,
          source: constants.GIT_REVIEW_COMMAND_SOURCE,
        },
        sections: [
          "Repository scope: current working tree",
          `Source reference: ${constants.GIT_REVIEW_COMMAND_SOURCE}`,
          "",
          "Instruction: Run the git diagnostics from the prompt before reading code.",
          extraFocus ? `Additional focus: ${extraFocus}` : "",
          "Instruction: Compare churn, authorship, bug clusters, velocity, and firefighting signals.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          extraFocus: extraFocus || null,
          source: constants.GIT_REVIEW_COMMAND_SOURCE,
        },
        startedMessage: `Started git-review workflow${extraFocus ? ` (${extraFocus})` : ""}.`,
      });
    },

    simplify: async (args, ctx) => {
      const parsed = parseReviewArgs(args ?? "", ctx.cwd, "simplify");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      if ("error" in parsed) {
        notify(ctx, parsed.error, "error");
        return;
      }

      const target = buildSimplifyTarget(parsed);

      await runWorkflowCommand({
        ctx,
        type: "simplify",
        input: target.summary,
        flags: {
          ...target.flags,
          extraInstruction: parsed.extraInstruction ?? null,
          source: constants.SIMPLIFY_COMMAND_SOURCE,
        },
        sections: [
          `Simplify target: ${target.summary}`,
          `Target mode: ${parsed.mode}`,
          `Source reference: ${constants.SIMPLIFY_COMMAND_SOURCE}`,
          "",
          `Instruction: ${target.instruction}`,
          parsed.extraInstruction ? `Additional focus: ${parsed.extraInstruction}` : "",
          "Instruction: Preserve exact behavior, API shape, and outputs. Ask before any semantic change.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          mode: parsed.mode,
          ...target.flags,
          extraInstruction: parsed.extraInstruction ?? null,
          source: constants.SIMPLIFY_COMMAND_SOURCE,
        },
        startedMessage: `Started simplify workflow (${target.summary}).`,
      });
    },

    removeSlop: async (args, ctx) => {
      const parsed = parseRemoveSlopArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      const subagentAvailable = hasSubagentTool(pi);
      const parallelTarget = subagentAvailable ? parsed.parallel : 1;

      await runWorkflowCommand({
        ctx,
        type: "remove-slop",
        input: parsed.scope,
        flags: {
          scope: parsed.scope,
          parallel: parallelTarget,
          subagentAvailable,
        },
        sections: [
          `Cleanup scope: ${parsed.scope}`,
          `Parallel subagents target: ${parallelTarget}`,
          "",
          subagentAvailable
            ? "Instruction: Run 8 analysis tracks in parallel, then implement approved items sequentially."
            : "Instruction: pi-subagents is not installed in this session, run the 8 analysis tracks sequentially.",
          "Instruction: Select language-aware skills based on the codebase stack. Mention missing useful skills if any.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          scope: parsed.scope,
          parallel: parallelTarget,
          subagentAvailable,
        },
        subagentAvailable,
        subagentCommandName: "remove-slop",
        startedMessage: `Started remove-slop workflow (scope=${parsed.scope}, parallel=${parallelTarget}, subagents=${subagentAvailable ? "on" : "off"}).`,
      });
    },

    domainModel: async (args, ctx) => {
      const parsed = parseDomainModelArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.plan) {
        notify(ctx, "Usage: /domain-model <plan_or_topic>", "error");
        return;
      }

      await runWorkflowCommand({
        ctx,
        type: "domain-model",
        input: parsed.plan,
        flags: {
          source: constants.DOMAIN_MODEL_COMMAND_SOURCE,
        },
        sections: [
          `Domain plan/topic: ${parsed.plan}`,
          `Source reference: ${constants.DOMAIN_MODEL_COMMAND_SOURCE}`,
          "",
          "Instruction: Ask one question at a time and wait for user feedback before continuing.",
          "Instruction: If a question can be answered from code/docs, inspect first and continue with the next unresolved question.",
          "Instruction: Update CONTEXT.md/ADR docs lazily and only when terms/decisions are resolved.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          plan: parsed.plan,
          source: constants.DOMAIN_MODEL_COMMAND_SOURCE,
        },
        startedMessage: `Started domain-model workflow (${parsed.plan}).`,
      });
    },

    toPrd: async (args, ctx) => {
      const parsed = parseToPrdArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      await runWorkflowCommand({
        ctx,
        type: "to-prd",
        input: parsed.context,
        flags: {
          source: constants.TO_PRD_COMMAND_SOURCE,
        },
        sections: [
          `PRD source context: ${parsed.context}`,
          `Source reference: ${constants.TO_PRD_COMMAND_SOURCE}`,
          "",
          "Instruction: Synthesize from current conversation and repository context. Do not run a long interview.",
          "Instruction: Create a GitHub issue with the PRD when possible; otherwise provide markdown fallback and reason.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          context: parsed.context,
          source: constants.TO_PRD_COMMAND_SOURCE,
        },
        startedMessage: `Started to-prd workflow (${parsed.context}).`,
      });
    },

    toIssues: async (args, ctx) => {
      const parsed = parseToIssuesArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      await runWorkflowCommand({
        ctx,
        type: "to-issues",
        input: parsed.source,
        flags: {
          source: constants.TO_ISSUES_COMMAND_SOURCE,
        },
        sections: [
          `Issue source plan: ${parsed.source}`,
          `Source reference: ${constants.TO_ISSUES_COMMAND_SOURCE}`,
          "",
          "Instruction: Break work into thin vertical slices with AFK/HITL labels and dependency ordering.",
          "Instruction: Review slice breakdown with the user once before creating issues.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          sourceInput: parsed.source,
          source: constants.TO_ISSUES_COMMAND_SOURCE,
        },
        startedMessage: `Started to-issues workflow (${parsed.source}).`,
      });
    },

    triageIssue: async (args, ctx) => {
      const parsed = parseTriageIssueArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.problem) {
        notify(ctx, "Usage: /triage-issue <problem_statement>", "error");
        return;
      }

      await runWorkflowCommand({
        ctx,
        type: "triage-issue",
        input: parsed.problem,
        flags: {
          source: constants.TRIAGE_ISSUE_COMMAND_SOURCE,
        },
        sections: [
          `Problem statement: ${parsed.problem}`,
          `Source reference: ${constants.TRIAGE_ISSUE_COMMAND_SOURCE}`,
          "",
          "Instruction: Ask at most one initial clarification question if needed, then investigate immediately.",
          "Instruction: Create a GitHub issue with durable root-cause analysis and RED/GREEN TDD fix plan.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          problem: parsed.problem,
          source: constants.TRIAGE_ISSUE_COMMAND_SOURCE,
        },
        startedMessage: `Started triage-issue workflow (${parsed.problem}).`,
      });
    },

    tdd: async (args, ctx) => {
      const parsed = parseTddArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.goal) {
        notify(ctx, "Usage: /tdd <goal> [--lang auto|python|rust|c]", "error");
        return;
      }

      await runWorkflowCommand({
        ctx,
        type: "tdd",
        input: parsed.goal,
        flags: {
          language: parsed.language,
          source: constants.TDD_COMMAND_SOURCE,
        },
        sections: [
          `TDD goal: ${parsed.goal}`,
          `Language hint: ${parsed.language}`,
          `Source reference: ${constants.TDD_COMMAND_SOURCE}`,
          "",
          "Instruction: Use tdd-core doctrine and select language-specific adapter skill as needed.",
          "Instruction: Execute strict red-green-refactor in vertical slices only.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          goal: parsed.goal,
          language: parsed.language,
          source: constants.TDD_COMMAND_SOURCE,
        },
        startedMessage: `Started tdd workflow (goal=${parsed.goal}, lang=${parsed.language}).`,
      });
    },

    addressOpenIssues: async (args, ctx) => {
      const parsed = parseAddressOpenIssuesArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      await runWorkflowCommand({
        ctx,
        type: "address-open-issues",
        input: `open issues by me (limit=${parsed.limit})`,
        flags: {
          limit: parsed.limit,
          repo: parsed.repo || null,
          source: constants.ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
        },
        sections: [
          "Issue query: author:@me state:open",
          `Limit: ${parsed.limit}`,
          `Repo override: ${parsed.repo || "(current repo)"}`,
          `Source reference: ${constants.ADDRESS_OPEN_ISSUES_COMMAND_SOURCE}`,
          "",
          "Instruction: Skip issues labeled blocked (or equivalent blocked label) and mark them skipped-blocked.",
          "Instruction: If an issue description is unclear/incomplete, post a clarification comment tagging the issue creator and abort remaining stages for that issue.",
          "Instruction: For well-described issues, run stages in order: triage-issue -> tdd -> review -> simplify -> review -> address review findings.",
          "Instruction: Re-review after remediation up to 2 loops per issue, then mark blocked if unresolved.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          limit: parsed.limit,
          repo: parsed.repo || null,
          source: constants.ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
        },
        startedMessage: `Started address-open-issues workflow (limit=${parsed.limit}, repo=${parsed.repo || "current"}).`,
      });
    },

    learnSkill: async (args, ctx) => {
      const parsed = parseLearnSkillArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.topic && !parsed.fromFile && !parsed.fromUrl) {
        notify(ctx, "Usage: /learn-skill <topic> [--from <path|url>] [--from-file path] [--from-url url] [--dry-run]", "error");
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

      await runWorkflowCommand({
        ctx,
        type: "learn-skill",
        input: parsed.topic || skillHint,
        flags: {
          fromFile: parsed.fromFile ?? null,
          fromUrl: parsed.fromUrl ?? null,
          dryRun: parsed.dryRun,
          targetSkill: skillName,
          targetFile: skillFile,
        },
        sections: [
          `Topic: ${parsed.topic || "(derived from source)"}`,
          `Target skill: ${skillName}`,
          `Target file: ${skillFile}`,
          `Dry run: ${parsed.dryRun ? "yes" : "no"}`,
          parsed.fromFile ? `Source file: ${path.resolve(ctx.cwd, parsed.fromFile)}` : "",
          parsed.fromUrl ? `Source URL: ${parsed.fromUrl}` : "",
          sourceExcerpt ? ["", "Source excerpt:", "```text", sourceExcerpt, "```"].join("\n") : "",
          "",
          "Instruction: Keep the skill concise and include explicit 'Use when' and 'Avoid when' sections.",
          constants.POSTFLIGHT_INSTRUCTION,
          constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
        ],
        entry: {
          topic: parsed.topic || null,
          fromFile: parsed.fromFile ?? null,
          fromUrl: parsed.fromUrl ?? null,
          dryRun: parsed.dryRun,
          targetSkill: skillName,
          targetFile: skillFile,
        },
        startedMessage: parsed.dryRun
          ? `Started learn-skill dry run for ${skillName}.`
          : `Started learn-skill workflow for ${skillName} (${skillFile}).`,
      });
    },
  };
}
