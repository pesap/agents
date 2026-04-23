import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export type NotifyType = "info" | "error" | "warning" | "success";

export function setPesapStatus(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  label?: string,
): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("pesap", label);
}

export function notify(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  type: NotifyType,
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, type === "success" ? "info" : type);
    return;
  }

  const line = `[pesap-agent/${type}] ${message}`;
  if (type === "error" || type === "warning") {
    console.error(line);
    return;
  }

  console.log(line);
}
