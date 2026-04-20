import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { PostflightRecord, PreflightRecord } from "../policy/first-principles";
import type { RuntimeState } from "../state/runtime";

type NotifyType = "info" | "error" | "warning" | "success";
type CommandHandler = (args: string | undefined, ctx: ExtensionCommandContext) => Promise<void>;

export function createComplianceCommandHandlers(params: {
  runtimeState: RuntimeState;
  notify: (ctx: Pick<ExtensionCommandContext, "hasUI" | "ui">, message: string, type: NotifyType) => void;
  parseApproveRiskArgs: (args: string) => { reason: string; ttlMinutes: number; error?: string };
  parsePreflightArgs: (args: string) => { record?: PreflightRecord; error?: string };
  parsePostflightArgs: (args: string) => { record?: PostflightRecord; error?: string };
  nowIso: () => string;
  appendRiskApprovalEntry: (approval: { reason: string; approvedAt: string; expiresAt: string }) => void;
  appendPreflightEntry: (record: PreflightRecord) => void;
  appendPostflightEntry: (record: PostflightRecord) => void;
}): {
  approveRisk: CommandHandler;
  preflight: CommandHandler;
  postflight: CommandHandler;
} {
  return {
    approveRisk: async (args, ctx) => {
      const parsed = params.parseApproveRiskArgs(args ?? "");
      if (parsed.error) {
        params.notify(ctx, parsed.error, "error");
        return;
      }

      const approvedAt = params.nowIso();
      const expiresAt = new Date(Date.now() + parsed.ttlMinutes * 60_000).toISOString();
      params.runtimeState.riskApproval = {
        reason: parsed.reason,
        approvedAt,
        expiresAt,
      };

      params.appendRiskApprovalEntry(params.runtimeState.riskApproval);
      params.notify(ctx, `Risk approval recorded until ${expiresAt}.`, "success");
    },

    preflight: async (args, ctx) => {
      const parsed = params.parsePreflightArgs(args ?? "");
      if (parsed.error || !parsed.record) {
        params.notify(ctx, parsed.error ?? "Invalid preflight.", "error");
        return;
      }
      params.runtimeState.activePreflight = parsed.record;
      params.appendPreflightEntry(parsed.record);
      params.notify(ctx, `Preflight recorded (${parsed.record.skill}).`, "success");
    },

    postflight: async (args, ctx) => {
      const parsed = params.parsePostflightArgs(args ?? "");
      if (parsed.error || !parsed.record) {
        params.notify(ctx, parsed.error ?? "Invalid postflight.", "error");
        return;
      }
      params.runtimeState.latestPostflight = parsed.record;
      params.appendPostflightEntry(parsed.record);
      params.notify(ctx, `Postflight recorded (${parsed.record.result}).`, "success");
    },
  };
}
