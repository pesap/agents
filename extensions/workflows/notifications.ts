import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { NotifyType } from "./engine";

export function notifySubagentUnavailable(
  ctx: ExtensionCommandContext,
  commandName: string,
  notify: (ctx: ExtensionCommandContext, message: string, type: NotifyType) => void,
): void {
  notify(ctx, `pi-subagents not detected, running /${commandName} in single-agent mode.`, "warning");
}

export function notifyWorkflowStarted(
  ctx: ExtensionCommandContext,
  message: string,
  notify: (ctx: ExtensionCommandContext, message: string, type: NotifyType) => void,
): void {
  notify(ctx, message, "info");
}
