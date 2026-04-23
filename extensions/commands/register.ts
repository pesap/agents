import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

type CommandHandler = (args: string | undefined, ctx: ExtensionCommandContext) => Promise<void>;

export interface CommandRegistrarDeps {
  pi: ExtensionAPI;
  handlers: {
    startAgent: CommandHandler;
    endAgent: CommandHandler;
    compliance: CommandHandler;
    approveRisk: CommandHandler;
    preflight: CommandHandler;
    postflight: CommandHandler;
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
  };
}

export function registerCommands({ pi, handlers }: CommandRegistrarDeps): void {
  const commands = [
    { name: "start-agent", description: "Initialize pesap-agent context injection for this session", handler: handlers.startAgent },
    { name: "end-agent", description: "Stop pesap-agent context injection for this session", handler: handlers.endAgent },
    { name: "compliance", description: "Show or change first-principles compliance modes for this session", handler: handlers.compliance },
    { name: "approve-risk", description: "Record checker approval for one high-risk command", handler: handlers.approveRisk },
    { name: "preflight", description: "Set mutation intent line for first-principles gate", handler: handlers.preflight },
    { name: "postflight", description: "Record verification evidence line for first-principles gate", handler: handlers.postflight },
    { name: "debug", description: "Run the pesap debug workflow", handler: handlers.debug },
    { name: "feature", description: "Run the pesap feature workflow", handler: handlers.feature },
    { name: "review", description: "Run the pesap code review workflow (adapted from pi-review)", handler: handlers.review },
    { name: "git-review", description: "Run git history diagnostics before reading code", handler: handlers.gitReview },
    { name: "simplify", description: "Run the pesap code simplification workflow", handler: handlers.simplify },
    { name: "remove-slop", description: "Run the pesap cleanup and code-quality workflow", handler: handlers.removeSlop },
    { name: "domain-model", description: "Run domain-model grilling and context/ADR update workflow", handler: handlers.domainModel },
    { name: "to-prd", description: "Convert current context into a PRD and file a GitHub issue", handler: handlers.toPrd },
    { name: "to-issues", description: "Break a plan/PRD into dependency-aware GitHub issues", handler: handlers.toIssues },
    { name: "triage-issue", description: "Investigate a bug and create a TDD fix-plan issue", handler: handlers.triageIssue },
    { name: "tdd", description: "Run a strict red-green-refactor workflow", handler: handlers.tdd },
    { name: "address-open-issues", description: "Sweep open issues authored by you through triage, TDD, review, and remediation", handler: handlers.addressOpenIssues },
    { name: "learn-skill", description: "Create and refine a reusable skill", handler: handlers.learnSkill },
  ] as const;

  for (const command of commands) {
    pi.registerCommand(command.name, {
      description: command.description,
      handler: command.handler,
    });
  }
}
