/**
 * pi-gitagent
 *
 * Pi extension that loads any gitagent agent into the current session.
 *
 * Commands:
 *   /gitagent install <ref>   Load an agent's soul into this session
 *   /gitagent list [ref]      List available agents (local or remote)
 *   /gitagent info            Show the currently loaded agent
 *   /gitagent refresh         Re-pull and reload the current agent
 *   /gitagent unload          Remove the loaded agent context
 *
 * Agent references:
 *   /gitagent install code-reviewer
 *   /gitagent install pesap/pesap-agents/code-reviewer
 *   /gitagent install https://github.com/pesap/pesap-agents/tree/main/code-reviewer
 *
 * Install:
 *   pi install https://github.com/pesap/pesap-agents
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolveAgent, resolveDir, listAgentsInDir } from "./resolve.js";
import { loadAgent, mapModel, type LoadedAgent } from "./loader.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const USAGE = [
  "Usage:",
  "  /gitagent install <ref>   Load an agent",
  "  /gitagent list [ref]      List available agents",
  "  /gitagent info            Show loaded agent",
  "  /gitagent refresh         Re-pull and reload",
  "  /gitagent unload          Remove agent context",
].join("\n");

export default function piGitagent(pi: ExtensionAPI) {
  let currentAgent: LoadedAgent | null = null;

  // ── /gitagent command ──────────────────────────────────────────────────

  pi.registerCommand("gitagent", {
    description: "Load a gitagent agent into this session",
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const subcommand = parts[0] || "";
      const rest = parts.slice(1).join(" ").trim();

      switch (subcommand) {
        case "install": {
          if (!rest) {
            ctx.ui.notify("Usage: /gitagent install <ref>", "error");
            return;
          }
          await handleInstall(pi, ctx, rest);
          return;
        }

        case "list": {
          handleList(ctx, rest || undefined);
          return;
        }

        case "info": {
          if (currentAgent) {
            showAgentInfo(ctx, currentAgent);
          } else {
            ctx.ui.notify("No agent loaded.", "info");
          }
          return;
        }

        case "refresh": {
          if (!currentAgent) {
            ctx.ui.notify("No agent loaded.", "info");
            return;
          }
          try {
            const resolved = resolveAgent(currentAgent.dir, { refresh: true, cwd: ctx.cwd });
            currentAgent = loadAgent(resolved.dir);
            ctx.ui.notify(`Refreshed ${currentAgent.manifest.name}. Takes effect on next prompt.`, "info");
          } catch (err) {
            ctx.ui.notify(`Refresh failed: ${(err as Error).message}`, "error");
          }
          return;
        }

        case "unload": {
          if (currentAgent) {
            const name = currentAgent.manifest.name;
            currentAgent = null;
            ctx.ui.notify(`Unloaded ${name}. Takes effect on next prompt.`, "info");
            ctx.ui.setStatus("gitagent", undefined);
          } else {
            ctx.ui.notify("No agent loaded.", "info");
          }
          return;
        }

        default: {
          ctx.ui.notify(USAGE, "info");
          return;
        }
      }
    },
  });

  // ── Install handler ─────────────────────────────────────────────────

  async function handleInstall(
    pi: ExtensionAPI,
    ctx: { ui: { notify: (msg: string, type: string) => void; setStatus: (key: string, text: string | undefined) => void }; cwd: string; modelRegistry: { find: (provider: string, modelId: string) => any } },
    ref: string,
  ) {
    try {
      const resolved = resolveAgent(ref, { cwd: ctx.cwd });
      currentAgent = loadAgent(resolved.dir);

      const modelName = currentAgent.manifest.model?.preferred ?? "default";
      const skillNames = currentAgent.skills.map((s) => s.name).join(", ") || "none";

      ctx.ui.notify(
        `Loaded ${currentAgent.manifest.name} (model: ${modelName}, skills: ${skillNames})`,
        "info"
      );
      ctx.ui.setStatus("gitagent", `🤖 ${currentAgent.manifest.name}`);

      // Switch to the agent's preferred model
      const modelPref = currentAgent.manifest.model?.preferred;
      if (modelPref) {
        const mapped = mapModel(modelPref);
        const model = ctx.modelRegistry.find(mapped.provider, mapped.modelId);
        if (model) {
          const success = await pi.setModel(model);
          if (success) {
            ctx.ui.notify(`Switched model to ${modelPref}`, "info");
          }
        }
      }
    } catch (err) {
      ctx.ui.notify(`${(err as Error).message}`, "error");
    }
  }

  // ── System prompt injection ────────────────────────────────────────────

  pi.on("before_agent_start", async (event) => {
    if (!currentAgent) return undefined;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + currentAgent.systemPromptAppend,
    };
  });

  // ── Status line on session restore ─────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (currentAgent) {
      ctx.ui.setStatus("gitagent", `🤖 ${currentAgent.manifest.name}`);
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────

  function showAgentInfo(ctx: { ui: { notify: (msg: string, type: string) => void } }, agent: LoadedAgent) {
    const lines = [
      `Agent: ${agent.manifest.name} v${agent.manifest.version}`,
      `Description: ${agent.manifest.description}`,
      `Model: ${agent.manifest.model?.preferred ?? "default"}`,
      `Skills: ${agent.skills.map((s) => s.name).join(", ") || "none"}`,
      `Memory: ${agent.memory ? "has content" : "empty"}`,
      `Source: ${agent.dir}`,
    ];
    ctx.ui.notify(lines.join("\n"), "info");
  }

  function handleList(ctx: { ui: { notify: (msg: string, type: string) => void }; cwd: string }, ref?: string) {
    try {
      const dir = ref ? resolveDir(ref, { cwd: ctx.cwd }) : ctx.cwd;
      const isRoot = existsSync(join(dir, "agent.yaml"));
      const subs = listAgentsInDir(dir);

      if (!isRoot && subs.length === 0) {
        ctx.ui.notify(`No agents found in ${dir}`, "info");
        return;
      }

      const lines: string[] = ["Available agents:"];
      if (isRoot) lines.push("  . (root agent)");
      for (const a of subs) lines.push(`  ${a}`);
      ctx.ui.notify(lines.join("\n"), "info");
    } catch (err) {
      ctx.ui.notify(`${(err as Error).message}`, "error");
    }
  }
}
