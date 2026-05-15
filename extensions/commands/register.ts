import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

type CommandHandler = (
  args: string | undefined,
  ctx: ExtensionCommandContext,
) => Promise<void>;

export interface CommandRegistrarDeps {
  pi: ExtensionAPI;
  handlers: {
    khala: CommandHandler;
    endAgent: CommandHandler;
    approveRisk: CommandHandler;
    preflight: CommandHandler;
    postflight: CommandHandler;
    debug: CommandHandler;
    feature: CommandHandler;
    review: CommandHandler;
    gitReview: CommandHandler;
    simplify: CommandHandler;
    ship: CommandHandler;
    plan: CommandHandler;
    triageIssue: CommandHandler;
    tdd: CommandHandler;
    addressOpenIssues: CommandHandler;
    learnSkill: CommandHandler;
    skillStatus: CommandHandler;
    skillReport: CommandHandler;
    pinSkill: CommandHandler;
    archiveSkill: CommandHandler;
    restoreSkill: CommandHandler;
  };
}

export function registerCommands({ pi, handlers }: CommandRegistrarDeps): void {
  const commands = [
    { name: "khala", description: "Initialize khala context injection, enable end-of-turn learning assessment, and optionally set compliance mode or memory threshold (/khala warn --learn-tool-limit 15)", handler: handlers.khala },
    { name: "end-agent", description: "Stop khala context injection for this session", handler: handlers.endAgent },
    { name: "approve-risk", description: "Record checker approval for one high-risk command", handler: handlers.approveRisk },
    { name: "preflight", description: "Set mutation intent line for first-principles gate", handler: handlers.preflight },
    { name: "postflight", description: "Record verification evidence line for first-principles gate", handler: handlers.postflight },
    { name: "debug", description: "Run the khala debug workflow", handler: handlers.debug },
    { name: "feature", description: "Run the khala feature workflow", handler: handlers.feature },
    { name: "review", description: "Run the khala code review workflow (adapted from pi-review)", handler: handlers.review },
    { name: "git-review", description: "Run git history diagnostics before reading code", handler: handlers.gitReview },
    { name: "simplify", description: "Run the khala code simplification workflow", handler: handlers.simplify },
    { name: "ship", description: "Simplify, verify, push current branch, and open PR/MR", handler: handlers.ship },
    { name: "plan", description: "Run rigorous planning workflow with edge-case capture and context/ADR updates", handler: handlers.plan },
    { name: "triage-issue", description: "Investigate a bug and create a TDD fix-plan issue", handler: handlers.triageIssue },
    { name: "tdd", description: "Run a strict red-green-refactor workflow", handler: handlers.tdd },
    { name: "address-open-issues", description: "Sweep open issues authored by you through triage, TDD, review, and remediation", handler: handlers.addressOpenIssues },
    { name: "learn-skill", description: "Create and refine a reusable skill", handler: handlers.learnSkill },
    { name: "skill-status", description: "Show learned skill provenance and lifecycle status", handler: handlers.skillStatus },
    { name: "skill-report", description: "Regenerate the learned skill curator report", handler: handlers.skillReport },
    { name: "pin-skill", description: "Pin or unpin a learned skill to exclude it from autonomous curation", handler: handlers.pinSkill },
    { name: "archive-skill", description: "Archive a learned skill without deleting it", handler: handlers.archiveSkill },
    { name: "restore-skill", description: "Restore an archived learned skill", handler: handlers.restoreSkill },
  ] as const;

  for (const command of commands) {
    pi.registerCommand(command.name, {
      description: command.description,
      handler: command.handler,
    });
  }
}
