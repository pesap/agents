import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import path from "node:path";

type NotifyType = "info" | "error" | "warning" | "success";
type CommandHandler = (args: string | undefined, ctx: ExtensionCommandContext) => Promise<void>;
type WorkflowType = "debug" | "feature" | "review" | "git-review" | "simplify" | "learn-skill" | "remove-slop" | "domain-model" | "to-prd" | "to-issues" | "triage-issue" | "tdd" | "address-open-issues";

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
  flags: Record<string, string | number | boolean | null | string[]>;
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
    flags: Record<string, string | number | boolean | null | string[]>,
  ) => Promise<unknown>;
  enqueueWorkflow: (pi: ExtensionAPI, workflowPromptName: string, workflowFileName: string, sections: string[]) => Promise<void>;
  notifySubagentUnavailable: (ctx: ExtensionCommandContext, commandName: string, notify: (ctx: ExtensionCommandContext, message: string, type: NotifyType) => void) => void;
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

  return {
    debug: async (args, ctx) => {
      const parsed = parseDebugArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
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
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);
      pi.appendEntry("pesap-debug-command", {
        problem: parsed.problem,
        parallel: parallelTarget,
        fix: parsed.fix,
        subagentAvailable,
        at: nowIso(),
      });
      if (!subagentAvailable) {
        notifySubagentUnavailable(ctx, "debug", notify);
      }

      notifyWorkflowStarted(ctx, `Started debug workflow (parallel=${parallelTarget}, fix=${fixMode}, subagents=${subagentMode}).`, notify);
    },

    feature: async (args, ctx) => {
      const parsed = parseFeatureArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
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
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);
      pi.appendEntry("pesap-feature-command", {
        request: parsed.request,
        parallel: parallelTarget,
        ship: parsed.ship,
        subagentAvailable,
        at: nowIso(),
      });

      if (!subagentAvailable) {
        notifySubagentUnavailable(ctx, "feature", notify);
      }

      notifyWorkflowStarted(
        ctx,
        `Started feature workflow (parallel=${parallelTarget}, ship=${parsed.ship ? "on" : "off"}, subagents=${subagentAvailable ? "on" : "off"}).`,
        notify,
      );
    },

    review: async (args, ctx) => {
      const parsed = parseReviewArgs(args ?? "", ctx.cwd);
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      if ("error" in parsed) {
        notify(ctx, parsed.error, "error");
        return;
      }

      ensureAgentEnabledForCommand(pi, ctx, "review");

      const target = buildReviewTarget(parsed);
      const projectGuidelines = await loadProjectReviewGuidelines(ctx.cwd);

      await beginWorkflowTracking(pi, ctx, "review", target.summary, {
        ...target.flags,
        extraInstruction: parsed.extraInstruction ?? null,
        source: constants.REVIEW_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "review-workflow.md", "review-workflow.yaml", [
        `Review target: ${target.summary}`,
        `Target mode: ${parsed.mode}`,
        `Source reference: ${constants.REVIEW_COMMAND_SOURCE}`,
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
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-review-command", {
        mode: parsed.mode,
        ...target.flags,
        extraInstruction: parsed.extraInstruction ?? null,
        source: constants.REVIEW_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started review workflow (${target.summary}).`, notify);
    },

    gitReview: async (args, ctx) => {
      const extraFocus = normalizeWhitespace(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      ensureAgentEnabledForCommand(pi, ctx, "git-review");

      const summary = extraFocus ? `current repository (${extraFocus})` : "current repository";
      await beginWorkflowTracking(pi, ctx, "git-review", summary, {
        extraFocus: extraFocus || null,
        source: constants.GIT_REVIEW_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "git-review-workflow.md", "git-review-workflow.yaml", [
        "Repository scope: current working tree",
        `Source reference: ${constants.GIT_REVIEW_COMMAND_SOURCE}`,
        "",
        "Instruction: Run the git diagnostics from the prompt before reading code.",
        extraFocus ? `Additional focus: ${extraFocus}` : "",
        "Instruction: Compare churn, authorship, bug clusters, velocity, and firefighting signals.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-git-review-command", {
        extraFocus: extraFocus || null,
        source: constants.GIT_REVIEW_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started git-review workflow${extraFocus ? ` (${extraFocus})` : ""}.`, notify);
    },

    simplify: async (args, ctx) => {
      const parsed = parseReviewArgs(args ?? "", ctx.cwd, "simplify");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      if ("error" in parsed) {
        notify(ctx, parsed.error, "error");
        return;
      }

      ensureAgentEnabledForCommand(pi, ctx, "simplify");

      const target = buildSimplifyTarget(parsed);

      await beginWorkflowTracking(pi, ctx, "simplify", target.summary, {
        ...target.flags,
        extraInstruction: parsed.extraInstruction ?? null,
        source: constants.SIMPLIFY_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "simplify-workflow.md", "simplify-workflow.yaml", [
        `Simplify target: ${target.summary}`,
        `Target mode: ${parsed.mode}`,
        `Source reference: ${constants.SIMPLIFY_COMMAND_SOURCE}`,
        "",
        `Instruction: ${target.instruction}`,
        parsed.extraInstruction ? `Additional focus: ${parsed.extraInstruction}` : "",
        "Instruction: Preserve exact behavior, API shape, and outputs. Ask before any semantic change.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-simplify-command", {
        mode: parsed.mode,
        ...target.flags,
        extraInstruction: parsed.extraInstruction ?? null,
        source: constants.SIMPLIFY_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started simplify workflow (${target.summary}).`, notify);
    },

    removeSlop: async (args, ctx) => {
      const parsed = parseRemoveSlopArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      ensureAgentEnabledForCommand(pi, ctx, "remove-slop");

      const subagentAvailable = hasSubagentTool(pi);
      const parallelTarget = subagentAvailable ? parsed.parallel : 1;

      await beginWorkflowTracking(pi, ctx, "remove-slop", parsed.scope, {
        scope: parsed.scope,
        parallel: parallelTarget,
        subagentAvailable,
      });

      await enqueueWorkflow(pi, "remove-slop-workflow.md", "remove-slop-workflow.yaml", [
        `Cleanup scope: ${parsed.scope}`,
        `Parallel subagents target: ${parallelTarget}`,
        "",
        subagentAvailable
          ? "Instruction: Run 8 analysis tracks in parallel, then implement approved items sequentially."
          : "Instruction: pi-subagents is not installed in this session, run the 8 analysis tracks sequentially.",
        "Instruction: Select language-aware skills based on the codebase stack. Mention missing useful skills if any.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-remove-slop-command", {
        scope: parsed.scope,
        parallel: parallelTarget,
        subagentAvailable,
        at: nowIso(),
      });

      if (!subagentAvailable) {
        notifySubagentUnavailable(ctx, "remove-slop", notify);
      }

      notifyWorkflowStarted(
        ctx,
        `Started remove-slop workflow (scope=${parsed.scope}, parallel=${parallelTarget}, subagents=${subagentAvailable ? "on" : "off"}).`,
        notify,
      );
    },

    domainModel: async (args, ctx) => {
      const parsed = parseDomainModelArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.plan) {
        notify(ctx, "Usage: /domain-model <plan_or_topic>", "error");
        return;
      }

      ensureAgentEnabledForCommand(pi, ctx, "domain-model");

      await beginWorkflowTracking(pi, ctx, "domain-model", parsed.plan, {
        source: constants.DOMAIN_MODEL_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "domain-model-workflow.md", "domain-model-workflow.yaml", [
        `Domain plan/topic: ${parsed.plan}`,
        `Source reference: ${constants.DOMAIN_MODEL_COMMAND_SOURCE}`,
        "",
        "Instruction: Ask one question at a time and wait for user feedback before continuing.",
        "Instruction: If a question can be answered from code/docs, inspect first and continue with the next unresolved question.",
        "Instruction: Update CONTEXT.md/ADR docs lazily and only when terms/decisions are resolved.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-domain-model-command", {
        plan: parsed.plan,
        source: constants.DOMAIN_MODEL_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started domain-model workflow (${parsed.plan}).`, notify);
    },

    toPrd: async (args, ctx) => {
      const parsed = parseToPrdArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      ensureAgentEnabledForCommand(pi, ctx, "to-prd");

      await beginWorkflowTracking(pi, ctx, "to-prd", parsed.context, {
        source: constants.TO_PRD_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "to-prd-workflow.md", "to-prd-workflow.yaml", [
        `PRD source context: ${parsed.context}`,
        `Source reference: ${constants.TO_PRD_COMMAND_SOURCE}`,
        "",
        "Instruction: Synthesize from current conversation and repository context. Do not run a long interview.",
        "Instruction: Create a GitHub issue with the PRD when possible; otherwise provide markdown fallback and reason.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-to-prd-command", {
        context: parsed.context,
        source: constants.TO_PRD_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started to-prd workflow (${parsed.context}).`, notify);
    },

    toIssues: async (args, ctx) => {
      const parsed = parseToIssuesArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      ensureAgentEnabledForCommand(pi, ctx, "to-issues");

      await beginWorkflowTracking(pi, ctx, "to-issues", parsed.source, {
        source: constants.TO_ISSUES_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "to-issues-workflow.md", "to-issues-workflow.yaml", [
        `Issue source plan: ${parsed.source}`,
        `Source reference: ${constants.TO_ISSUES_COMMAND_SOURCE}`,
        "",
        "Instruction: Break work into thin vertical slices with AFK/HITL labels and dependency ordering.",
        "Instruction: Review slice breakdown with the user once before creating issues.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-to-issues-command", {
        sourceInput: parsed.source,
        source: constants.TO_ISSUES_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started to-issues workflow (${parsed.source}).`, notify);
    },

    triageIssue: async (args, ctx) => {
      const parsed = parseTriageIssueArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.problem) {
        notify(ctx, "Usage: /triage-issue <problem_statement>", "error");
        return;
      }

      ensureAgentEnabledForCommand(pi, ctx, "triage-issue");

      await beginWorkflowTracking(pi, ctx, "triage-issue", parsed.problem, {
        source: constants.TRIAGE_ISSUE_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "triage-issue-workflow.md", "triage-issue-workflow.yaml", [
        `Problem statement: ${parsed.problem}`,
        `Source reference: ${constants.TRIAGE_ISSUE_COMMAND_SOURCE}`,
        "",
        "Instruction: Ask at most one initial clarification question if needed, then investigate immediately.",
        "Instruction: Create a GitHub issue with durable root-cause analysis and RED/GREEN TDD fix plan.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-triage-issue-command", {
        problem: parsed.problem,
        source: constants.TRIAGE_ISSUE_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started triage-issue workflow (${parsed.problem}).`, notify);
    },

    tdd: async (args, ctx) => {
      const parsed = parseTddArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
      if (!parsed.goal) {
        notify(ctx, "Usage: /tdd <goal> [--lang auto|python|rust|c]", "error");
        return;
      }

      ensureAgentEnabledForCommand(pi, ctx, "tdd");

      await beginWorkflowTracking(pi, ctx, "tdd", parsed.goal, {
        language: parsed.language,
        source: constants.TDD_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "tdd-workflow.md", "tdd-workflow.yaml", [
        `TDD goal: ${parsed.goal}`,
        `Language hint: ${parsed.language}`,
        `Source reference: ${constants.TDD_COMMAND_SOURCE}`,
        "",
        "Instruction: Use tdd-core doctrine and select language-specific adapter skill as needed.",
        "Instruction: Execute strict red-green-refactor in vertical slices only.",
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
      ]);

      pi.appendEntry("pesap-tdd-command", {
        goal: parsed.goal,
        language: parsed.language,
        source: constants.TDD_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(ctx, `Started tdd workflow (goal=${parsed.goal}, lang=${parsed.language}).`, notify);
    },

    addressOpenIssues: async (args, ctx) => {
      const parsed = parseAddressOpenIssuesArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;

      ensureAgentEnabledForCommand(pi, ctx, "address-open-issues");

      await beginWorkflowTracking(pi, ctx, "address-open-issues", `open issues by me (limit=${parsed.limit})`, {
        limit: parsed.limit,
        repo: parsed.repo || null,
        source: constants.ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
      });

      await enqueueWorkflow(pi, "address-open-issues-workflow.md", "address-open-issues-workflow.yaml", [
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
      ]);

      pi.appendEntry("pesap-address-open-issues-command", {
        limit: parsed.limit,
        repo: parsed.repo || null,
        source: constants.ADDRESS_OPEN_ISSUES_COMMAND_SOURCE,
        at: nowIso(),
      });

      notifyWorkflowStarted(
        ctx,
        `Started address-open-issues workflow (limit=${parsed.limit}, repo=${parsed.repo || "current"}).`,
        notify,
      );
    },

    learnSkill: async (args, ctx) => {
      const parsed = parseLearnSkillArgs(args ?? "");
      if (!ensureWorkflowSlotAvailable(ctx)) return;
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
        constants.POSTFLIGHT_INSTRUCTION,
        constants.REQUIRED_WORKFLOW_FOOTER_INSTRUCTION,
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

      notifyWorkflowStarted(
        ctx,
        parsed.dryRun
          ? `Started learn-skill dry run for ${skillName}.`
          : `Started learn-skill workflow for ${skillName} (${skillFile}).`,
        notify,
      );
    },
  };
}
