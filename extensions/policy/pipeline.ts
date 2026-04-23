import { getBlockedCommandMessage } from "./blocked-commands";
import { buildPreflightRawLine, modeOutcome, type PolicyMode, type PolicyOutcome, type PreflightRecord } from "./first-principles";
import { evaluateRiskPolicy, type RiskPolicyEvent, type RiskPolicyHookConfig } from "./risk";

export interface SpawnPolicyResult {
  blockedMessage: string | null;
  riskEvent: RiskPolicyEvent | null;
  consumeRiskApproval: boolean;
}

export function evaluateSpawnPolicy(command: string, options: {
  hookConfig: RiskPolicyHookConfig;
  hasValidRiskApproval: boolean;
  nowIso: () => string;
}): SpawnPolicyResult {
  const blockedMessage = getBlockedCommandMessage(command);
  if (blockedMessage) {
    return {
      blockedMessage,
      riskEvent: null,
      consumeRiskApproval: false,
    };
  }

  const riskResult = evaluateRiskPolicy(command, options);
  return {
    blockedMessage: riskResult.blockedMessage,
    riskEvent: riskResult.event,
    consumeRiskApproval: riskResult.consumeApproval,
  };
}

export interface MutationPreflightDecision {
  outcome: PolicyOutcome;
  detail: string;
  warningMessage?: string;
  blockReason?: string;
}

export function evaluateMutationPreflightPolicy(options: {
  preflightMode: PolicyMode;
  preflight: PreflightRecord | null;
  toolName: string;
}): MutationPreflightDecision {
  const violation = !options.preflight;
  const outcome = modeOutcome(options.preflightMode, violation);
  const detail = violation
    ? "Missing valid preflight before mutation."
    : `Using ${options.preflight.source} preflight: ${buildPreflightRawLine(options.preflight)}`;

  if (outcome === "warn") {
    return {
      outcome,
      detail,
      warningMessage: `Policy warning (${options.toolName}): ${detail}`,
    };
  }

  if (outcome === "block") {
    return {
      outcome,
      detail,
      blockReason: [
        `Policy blocked ${options.toolName}.`,
        "Missing valid preflight before first mutation.",
        "Run:",
        "  /preflight Preflight: skill=<name|none> reason=\"<short>\" clarify=<yes|no>",
        "Remediate and retry.",
      ].join("\n"),
    };
  }

  return {
    outcome,
    detail,
  };
}
