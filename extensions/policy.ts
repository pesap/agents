import type { LoadedAgent } from "./loader.js";

export type PolicyMode = "read-only" | "supervised" | "semi-auto" | "full-auto";
export type ApprovalMode = "allow" | "ask" | "block";
export type ToolRisk = "safe" | "network" | "destructive" | "file-write";

export interface RuntimePolicy {
  mode: PolicyMode;
  approvals: {
    fileWrite: ApprovalMode;
    bashDestructive: ApprovalMode;
    network: ApprovalMode;
  };
  allowTools: string[];
  denyPatterns: Partial<Record<"bash" | "write" | "edit", string[]>>;
  source: string[];
}

export interface ToolClassification {
  risk: ToolRisk;
  summary: string;
  matchedRule?: string;
}

export interface PolicyDecision {
  outcome: "allow" | "ask" | "block";
  reason: string;
  classification: ToolClassification;
}

interface RuntimePolicyMetadata {
  mode?: string;
  approvals?: Record<string, unknown>;
  allow_tools?: unknown;
  deny_patterns?: Record<string, unknown>;
}

const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brm\s+-rf\b/, label: "rm -rf" },
  { pattern: /\bsudo\b/, label: "sudo" },
  { pattern: /\bgit\s+reset\s+--hard\b/, label: "git reset --hard" },
  { pattern: /\bgit\s+push\b/, label: "git push" },
  { pattern: /\bterraform\s+apply\b/, label: "terraform apply" },
  { pattern: /\bkubectl\s+delete\b/, label: "kubectl delete" },
  { pattern: /\bchmod\b/, label: "chmod" },
  { pattern: /\bchown\b/, label: "chown" },
  { pattern: /\bdd\b/, label: "dd" },
  { pattern: /\bmv\b/, label: "mv" },
];

const NETWORK_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcurl\b/, label: "curl" },
  { pattern: /\bwget\b/, label: "wget" },
  { pattern: /\bssh\b/, label: "ssh" },
  { pattern: /\bscp\b/, label: "scp" },
  { pattern: /\brsync\b/, label: "rsync" },
  { pattern: /\bnc\b|\bncat\b/, label: "netcat" },
  { pattern: /\bftp\b/, label: "ftp" },
  { pattern: /\bgh\s+api\b/, label: "gh api" },
];

function normalizePolicyMode(value: unknown): PolicyMode | undefined {
  switch (value) {
    case "read-only":
    case "supervised":
    case "semi-auto":
    case "full-auto":
      return value;
    default:
      return undefined;
  }
}

function normalizeApprovalMode(value: unknown): ApprovalMode | undefined {
  switch (value) {
    case "allow":
    case "ask":
    case "block":
      return value;
    default:
      return undefined;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getMetadataPolicy(agent: LoadedAgent): RuntimePolicyMetadata | undefined {
  const metadata = agent.manifest.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;
  const runtimePolicy = (metadata as Record<string, unknown>).runtime_policy;
  if (!runtimePolicy || typeof runtimePolicy !== "object") return undefined;
  return runtimePolicy as RuntimePolicyMetadata;
}

function getDefaultPolicyForMode(mode: PolicyMode): RuntimePolicy["approvals"] {
  switch (mode) {
    case "read-only":
      return {
        fileWrite: "block",
        bashDestructive: "block",
        network: "ask",
      };
    case "supervised":
      return {
        fileWrite: "ask",
        bashDestructive: "ask",
        network: "ask",
      };
    case "semi-auto":
      return {
        fileWrite: "allow",
        bashDestructive: "ask",
        network: "ask",
      };
    case "full-auto":
      return {
        fileWrite: "allow",
        bashDestructive: "allow",
        network: "allow",
      };
  }
}

function deriveMode(agent: LoadedAgent): { mode: PolicyMode; source: string[] } {
  const metadataPolicy = getMetadataPolicy(agent);
  const explicit = normalizePolicyMode(metadataPolicy?.mode);
  if (explicit) {
    return { mode: explicit, source: ["metadata.runtime_policy.mode"] };
  }

  const hitl = agent.manifest.compliance?.supervision?.human_in_the_loop;
  if (hitl === "always") return { mode: "supervised", source: ["compliance.supervision.human_in_the_loop=always"] };
  if (hitl === "conditional") return { mode: "supervised", source: ["compliance.supervision.human_in_the_loop=conditional"] };

  const riskTier = agent.manifest.compliance?.risk_tier;
  if (riskTier === "high") return { mode: "read-only", source: ["compliance.risk_tier=high"] };
  if (riskTier === "standard") return { mode: "supervised", source: ["compliance.risk_tier=standard"] };

  return { mode: "semi-auto", source: ["default"] };
}

export function getRuntimePolicy(agent: LoadedAgent): RuntimePolicy {
  const metadataPolicy = getMetadataPolicy(agent);
  const derived = deriveMode(agent);
  const approvals = getDefaultPolicyForMode(derived.mode);

  const rawApprovals = metadataPolicy?.approvals ?? {};
  const fileWrite = normalizeApprovalMode(rawApprovals.file_write);
  const bashDestructive = normalizeApprovalMode(rawApprovals.bash_destructive);
  const network = normalizeApprovalMode(rawApprovals.network);

  const denyPatternsRaw = metadataPolicy?.deny_patterns ?? {};
  const allowTools = asStringArray(metadataPolicy?.allow_tools);

  return {
    mode: derived.mode,
    approvals: {
      fileWrite: fileWrite ?? approvals.fileWrite,
      bashDestructive: bashDestructive ?? approvals.bashDestructive,
      network: network ?? approvals.network,
    },
    allowTools,
    denyPatterns: {
      bash: asStringArray(denyPatternsRaw.bash),
      write: asStringArray(denyPatternsRaw.write),
      edit: asStringArray(denyPatternsRaw.edit),
    },
    source: derived.source,
  };
}

function summarizePathInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const path = (input as { path?: unknown }).path;
  if (typeof path === "string") return path;
  return "";
}

function summarizeBashCommand(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const command = (input as { command?: unknown }).command;
  if (typeof command !== "string") return "";
  const compact = command.replace(/\s+/g, " ").trim();
  if (compact.length <= 120) return compact;
  return `${compact.slice(0, 117)}…`;
}

export function classifyToolCall(toolName: string, input: unknown): ToolClassification {
  if (toolName === "write" || toolName === "edit") {
    const path = summarizePathInput(input);
    return {
      risk: "file-write",
      summary: path ? `${toolName} ${path}` : toolName,
    };
  }

  if (toolName === "bash") {
    const command = summarizeBashCommand(input);

    for (const rule of DESTRUCTIVE_PATTERNS) {
      if (rule.pattern.test(command)) {
        return {
          risk: "destructive",
          summary: command || "bash command",
          matchedRule: rule.label,
        };
      }
    }

    for (const rule of NETWORK_PATTERNS) {
      if (rule.pattern.test(command)) {
        return {
          risk: "network",
          summary: command || "bash command",
          matchedRule: rule.label,
        };
      }
    }

    return {
      risk: "safe",
      summary: command || "bash command",
    };
  }

  return {
    risk: "safe",
    summary: toolName,
  };
}

export function decideToolPolicy(
  agent: LoadedAgent,
  toolName: string,
  input: unknown,
): PolicyDecision {
  const policy = getRuntimePolicy(agent);
  const classification = classifyToolCall(toolName, input);

  if (toolName.startsWith("gitagent_")) {
    return {
      outcome: "allow",
      reason: "gitagent runtime tool",
      classification,
    };
  }

  if (policy.allowTools.length > 0 && !policy.allowTools.includes(toolName)) {
    return {
      outcome: "block",
      reason: `tool ${toolName} is not in allow_tools`,
      classification,
    };
  }

  const denyRules = policy.denyPatterns[toolName as keyof RuntimePolicy["denyPatterns"]] ?? [];
  const summary = classification.summary;
  const matchedDenyRule = denyRules.find((rule) => summary.includes(rule));
  if (matchedDenyRule) {
    return {
      outcome: "block",
      reason: `matched deny pattern: ${matchedDenyRule}`,
      classification,
    };
  }

  if (policy.mode === "read-only" && classification.risk === "file-write") {
    return {
      outcome: "block",
      reason: "read-only policy blocks file mutation",
      classification,
    };
  }

  if (classification.risk === "file-write") {
    return {
      outcome: policy.approvals.fileWrite,
      reason: `file write policy is ${policy.approvals.fileWrite}`,
      classification,
    };
  }

  if (classification.risk === "destructive") {
    return {
      outcome: policy.approvals.bashDestructive,
      reason: `destructive bash policy is ${policy.approvals.bashDestructive}`,
      classification,
    };
  }

  if (classification.risk === "network") {
    return {
      outcome: policy.approvals.network,
      reason: `network policy is ${policy.approvals.network}`,
      classification,
    };
  }

  return {
    outcome: "allow",
    reason: "safe tool call",
    classification,
  };
}

export function formatPolicySummary(agent: LoadedAgent): string[] {
  const policy = getRuntimePolicy(agent);
  const allowTools = policy.allowTools.length > 0 ? policy.allowTools.join(", ") : "all active tools";
  const denyRules = Object.entries(policy.denyPatterns)
    .filter(([, rules]) => Array.isArray(rules) && rules.length > 0)
    .map(([tool, rules]) => `${tool}: ${rules?.join(", ")}`);

  const lines = [
    `mode: ${policy.mode}`,
    `source: ${policy.source.join(", ")}`,
    `allow tools: ${allowTools}`,
    `file writes: ${policy.approvals.fileWrite}`,
    `destructive bash: ${policy.approvals.bashDestructive}`,
    `network commands: ${policy.approvals.network}`,
  ];

  if (denyRules.length > 0) {
    lines.push(`deny patterns: ${denyRules.join(" | ")}`);
  }

  return lines;
}
