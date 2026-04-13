/**
 * pi-gitagent
 *
 * Pi extension that loads any gitagent agent into the current session.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { resolveAgent, resolveDir, listAgentsInDir } from "./resolve.js";
import { loadAgent, mapModel, type LoadedAgent } from "./loader.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRuntimeState } from "./state.js";
import {
  appendToMemory,
  extractText,
  getLastAssistantText,
  getLastUserText,
  saveAgentMemoryEntry,
  todayIsoDate,
} from "./memory.js";
import { decideToolPolicy, formatPolicySummary, getRuntimePolicy } from "./policy.js";
import { formatDoctorReport, runDoctor } from "./doctor.js";
import { formatRecommendations, recommendAgents } from "./recommend.js";

const MEMORY_DIR = join(homedir(), ".pitagent", "memory");
const ARCHITECT_REF = "gh:shreyas-lyzr/architect";
const SKILL_ENFORCEMENT_MAX_STREAK = 2;

const USAGE = [
  "Usage:",
  "  /gitagent load <ref>         Load an agent into this session",
  "  /gitagent new <prompt>       Create a new agent via the architect",
  "  /gitagent list [ref]         List available agents",
  "  /gitagent recommend <task>   Recommend the best agent for a task",
  "  /gitagent doctor [ref]       Run diagnostics on the current or target agent",
  "  /gitagent policy             Show runtime policy for the loaded agent",
  "  /gitagent info               Show loaded agent",
  "  /gitagent refresh            Re-pull and reload",
  "  /gitagent unload            Remove agent context",
].join("\n");

interface UiContext {
  ui: {
    notify: (msg: string, type: string) => void;
    setStatus: (key: string, text: string | undefined) => void;
    confirm: (title: string, message: string) => Promise<boolean>;
  };
  cwd: string;
  hasUI?: boolean;
  sessionManager?: {
    getEntries: () => unknown[];
    getBranch: () => unknown[];
    getSessionFile?: () => string | undefined;
  };
  modelRegistry: {
    find: (provider: string, modelId: string) => unknown;
  };
}

export default function piGitagent(pi: ExtensionAPI) {
  const state = createRuntimeState();
  const unsafePi = pi as unknown as {
    on: (...args: unknown[]) => unknown;
    registerTool: (definition: unknown) => unknown;
    registerCommand: (name: string, options: unknown) => unknown;
  };

  function setAgentStatus(
    ui: { setStatus: (key: string, text: string | undefined) => void },
    agent: LoadedAgent | null,
  ): void {
    if (!agent) {
      ui.setStatus("gitagent", undefined);
      return;
    }
    const policy = getRuntimePolicy(agent);
    ui.setStatus("gitagent", `🤖 ${agent.manifest.name} [${policy.mode}]`);
  }

  function getFeedbackHookConfig(agent: LoadedAgent): {
    enabled: boolean;
    minConfidence: number;
    maxChars: number;
    redactSensitive: boolean;
  } {
    const raw = agent.manifest.metadata?.feedback_memory_hook;

    const minConfidence =
      typeof raw?.min_confidence === "number" && raw.min_confidence >= 0 && raw.min_confidence <= 1
        ? raw.min_confidence
        : 0.9;
    const maxChars =
      typeof raw?.max_chars === "number" && raw.max_chars >= 80 && raw.max_chars <= 500
        ? Math.floor(raw.max_chars)
        : 220;

    return {
      enabled: raw?.enabled === true,
      minConfidence,
      maxChars,
      redactSensitive: raw?.redact_sensitive !== false,
    };
  }

  function inferSentiment(feedback: string): "positive" | "negative" | "neutral" {
    const lower = feedback.toLowerCase();
    if (/(great|nice|love|perfect|thanks|good job|awesome)/.test(lower)) return "positive";
    if (/(bad|wrong|hate|not good|broken|annoying|doesn't work|does not work|regression)/.test(lower)) {
      return "negative";
    }
    return "neutral";
  }

  function formatFeedbackEntry(params: {
    feedback: string;
    topic?: string;
    source?: string;
    sentiment?: "positive" | "negative" | "neutral";
  }): string {
    const topic = (params.topic ?? "general").trim() || "general";
    const source = (params.source ?? "user").trim() || "user";
    const sentiment = params.sentiment ?? inferSentiment(params.feedback);
    return `- ${todayIsoDate()}: [feedback/${topic}/${sentiment}] ${params.feedback.trim()} (source: ${source})`;
  }

  function redactPotentialSensitiveText(text: string): string {
    const patterns: Array<[RegExp, string]> = [
      [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
      [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, "[redacted-api-key]"],
      [/\bghp_[A-Za-z0-9]{20,}\b/g, "[redacted-github-token]"],
      [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-aws-key]"],
      [/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-number]"],
    ];

    return patterns.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
  }

  function normalizeFeedbackText(feedback: string, maxChars: number): string {
    const compact = feedback.replace(/\s+/g, " ").trim();
    if (compact.length <= maxChars) return compact;

    const sentence = compact.match(/^(.{1,500}?[.!?])(?:\s|$)/);
    const candidate = sentence?.[1]?.trim() ?? compact;
    if (candidate.length <= maxChars) return candidate;

    return `${candidate.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }

  function inferFeedbackTopic(feedback: string): string {
    const lower = feedback.toLowerCase();
    if (/(style|format|tone|concise|verbosity|wording|response)/.test(lower)) {
      return "communication";
    }
    if (/(memory|remember|feedback|preference)/.test(lower)) {
      return "memory";
    }
    if (/(performance|speed|fast|slow|latency)/.test(lower)) {
      return "performance";
    }
    if (/(test|lint|clippy|quality|bug|error handling)/.test(lower)) {
      return "quality";
    }
    if (/(agent|skill|hook|tool|policy)/.test(lower)) {
      return "agent-behavior";
    }
    return "general";
  }

  function parseAutoFeedback(text: string): {
    feedback: string;
    topic: string;
    signal: string;
    confidence: number;
  } | null {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length < 16) return null;

    const lower = normalized.toLowerCase();
    const hasPreference =
      /\bi\s+(?:prefer|want|need|expect|like|love|hate|do not want|don't want)\b/.test(lower) ||
      /\b(?:from now on|next time)\b/.test(lower);
    const hasCorrection =
      /\b(?:wrong|incorrect|not what i asked|you missed|that's not|that is not|instead)\b/.test(
        lower,
      );
    const hasPraise = /\b(?:great|nice|good|perfect|awesome|thanks|thank you)\b/.test(lower);
    const hasMeta =
      /\b(?:agent|response|answer|format|style|tone|memory|remember|manual|automatic|hook|tool|skill|policy)\b/.test(
        lower,
      );

    const shouldCapture = hasCorrection || hasPreference || (hasPraise && hasMeta);
    if (!shouldCapture) return null;

    const signal = hasCorrection ? "correction" : hasPreference ? "preference" : "praise";

    let confidence = 0.6;
    if (hasMeta) confidence += 0.2;
    if (hasCorrection || hasPreference) confidence += 0.2;
    if (confidence > 1) confidence = 1;

    return {
      feedback: normalized,
      topic: inferFeedbackTopic(normalized),
      signal,
      confidence,
    };
  }

  function auditAutoFeedback(ctx: UiContext): void {
    if (!state.currentAgent) return;

    const cfg = getFeedbackHookConfig(state.currentAgent);
    if (!cfg.enabled) return;

    const userText = getLastUserText(ctx);
    if (!userText) return;

    const parsed = parseAutoFeedback(userText);
    if (!parsed) return;
    if (parsed.confidence < cfg.minConfidence) return;

    const sanitized = cfg.redactSensitive ? redactPotentialSensitiveText(parsed.feedback) : parsed.feedback;
    const concise = normalizeFeedbackText(sanitized, cfg.maxChars);
    if (concise.length < 12) return;

    const fingerprint = `${state.currentAgent.manifest.name}:${concise.slice(-220)}`;
    if (fingerprint === state.lastFeedbackFingerprint) return;
    state.lastFeedbackFingerprint = fingerprint;

    const entry = formatFeedbackEntry({
      feedback: concise,
      topic: parsed.topic,
      source: "user-auto",
    });
    saveAgentMemoryEntry(state, state.currentAgent, entry);

    pi.appendEntry("gitagent-feedback-captured", {
      agent: state.currentAgent.manifest.name,
      mode: "auto-inferred",
      topic: parsed.topic,
      signal: parsed.signal,
      confidence: parsed.confidence,
      min_confidence: cfg.minConfidence,
      at: new Date().toISOString(),
    });

    ctx.ui.notify(
      `📝 Auto-saved user feedback to ${state.currentAgent.manifest.name} memory (${parsed.signal}).`,
      "info",
    );
  }

  function verifySkillSection(
    agent: LoadedAgent,
    assistantText: string,
  ): { ok: boolean; reason: string; matchedSkills: string[] } {
    if (agent.skills.length === 0) {
      return { ok: true, reason: "no_skills", matchedSkills: [] };
    }

    const hasSkillsSection =
      /(?:^|\n)#{1,6}\s*skills?\s*(?:used|applied|check|activation)\b/i.test(assistantText) ||
      /skills?\s*(?:used|applied|check|activation)\s*:/i.test(assistantText);

    if (!hasSkillsSection) {
      return {
        ok: false,
        reason: "missing_skills_used_section",
        matchedSkills: [],
      };
    }

    const lower = assistantText.toLowerCase();
    const matchedSkills = agent.skills
      .filter((skill) => lower.includes(skill.name.toLowerCase()))
      .map((skill) => skill.name);

    const explicitlyNone =
      /skills?\s*(?:used|applied|check|activation)[^\n]*none/i.test(assistantText) ||
      /no\s+applicable\s+skill/i.test(assistantText);

    if (matchedSkills.length === 0 && !explicitlyNone) {
      return {
        ok: false,
        reason: "skills_section_without_known_skill_or_none",
        matchedSkills: [],
      };
    }

    return { ok: true, reason: "ok", matchedSkills };
  }

  function auditSkillUsage(
    ctx: UiContext,
  ): { checked: boolean; result?: { ok: boolean; reason: string; matchedSkills: string[] } } {
    if (!state.currentAgent || state.currentAgent.skills.length === 0) {
      state.skillEnforcementStreak = 0;
      return { checked: false };
    }

    const assistantText = getLastAssistantText(ctx);
    if (!assistantText) return { checked: false };

    const fingerprint = `${state.currentAgent.manifest.name}:${assistantText.slice(-160)}`;
    if (fingerprint === state.lastSkillAuditFingerprint) return { checked: false };
    state.lastSkillAuditFingerprint = fingerprint;

    const result = verifySkillSection(state.currentAgent, assistantText);
    pi.appendEntry("gitagent-skill-check", {
      agent: state.currentAgent.manifest.name,
      ok: result.ok,
      reason: result.reason,
      matchedSkills: result.matchedSkills,
      at: new Date().toISOString(),
    });

    if (!result.ok) {
      ctx.ui.notify(
        `⚠️ Skill hook: ${state.currentAgent.manifest.name} is missing a valid Skills Used section (${result.reason}).`,
        "info",
      );

      if (state.skillEnforcementStreak < SKILL_ENFORCEMENT_MAX_STREAK) {
        state.skillEnforcementStreak += 1;
        const enforcementPrompt = [
          "Your previous response failed the skill verification hook.",
          "Please restate your answer and include a `Skills Used` section.",
          "List at least one loaded skill by name with one-line evidence, or write `Skills Used: none` with a reason.",
          "Do not change conclusions unless you found an actual error.",
        ].join(" ");

        pi.appendEntry("gitagent-skill-enforcement", {
          agent: state.currentAgent.manifest.name,
          reason: result.reason,
          streak: state.skillEnforcementStreak,
          at: new Date().toISOString(),
        });
        pi.sendUserMessage(enforcementPrompt, { deliverAs: "followUp" });
        ctx.ui.notify(
          `🧰 Skill hook enforcement queued (${state.skillEnforcementStreak}/${SKILL_ENFORCEMENT_MAX_STREAK}).`,
          "info",
        );
      } else {
        ctx.ui.notify(
          `🛑 Skill hook reached max enforcement streak (${SKILL_ENFORCEMENT_MAX_STREAK}).`,
          "info",
        );
      }
    } else {
      state.skillEnforcementStreak = 0;
    }

    return { checked: true, result };
  }

  function resolveAndLoad(ref: string, cwd: string): LoadedAgent {
    const resolved = resolveAgent(ref, { cwd });
    const opts = resolved.remote ? { memoryBaseDir: MEMORY_DIR } : {};
    return loadAgent(resolved.dir, opts);
  }

  function activateAgent(
    agent: LoadedAgent,
    ref: string,
    ctx: { ui: { setStatus: (key: string, text: string | undefined) => void } },
  ): void {
    state.currentAgent = agent;
    state.currentRef = ref;
    state.rememberedThisSession = false;
    state.lastSkillAuditFingerprint = null;
    state.lastFeedbackFingerprint = null;
    state.skillEnforcementStreak = 0;
    pi.appendEntry("gitagent-loaded", { ref });
    setAgentStatus(ctx.ui, agent);
  }

  async function switchModel(
    agent: LoadedAgent,
    ctx: { modelRegistry: { find: (provider: string, modelId: string) => unknown } },
  ): Promise<boolean> {
    const modelPref = agent.manifest.model?.preferred;
    if (!modelPref) return false;
    const mapped = mapModel(modelPref);
    const model = ctx.modelRegistry.find(mapped.provider, mapped.modelId);
    return model
      ? await pi.setModel(model as Parameters<ExtensionAPI["setModel"]>[0])
      : false;
  }

  function buildAgentInfo(agent: LoadedAgent) {
    const feedbackCfg = getFeedbackHookConfig(agent);
    return {
      name: agent.manifest.name,
      version: agent.manifest.version,
      description: agent.manifest.description,
      model: agent.manifest.model?.preferred ?? "default",
      skills: agent.skills.map((s) => s.name),
      memory: agent.memory ? "has content" : "empty",
      memory_mode: agent.memoryIsLocal ? "local repo memory" : "centralized ~/.pitagent memory",
      source: agent.dir,
      policy: formatPolicySummary(agent),
      skill_verification_hook:
        agent.skills.length > 0
          ? `active (strict mode: auto follow-up enforcement, max streak ${SKILL_ENFORCEMENT_MAX_STREAK})`
          : "inactive (no skills loaded)",
      feedback_memory_hook: feedbackCfg.enabled
        ? `active (min_confidence=${feedbackCfg.minConfidence}, max_chars=${feedbackCfg.maxChars}, redact_sensitive=${feedbackCfg.redactSensitive})`
        : "inactive (set metadata.feedback_memory_hook.enabled=true in agent.yaml)",
    };
  }

  function showAgentInfo(
    ctx: { ui: { notify: (msg: string, type: string) => void } },
    agent: LoadedAgent,
  ) {
    const info = buildAgentInfo(agent);
    const lines = Object.entries(info).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.join(" | ") || "none"}`;
      return `${k}: ${v}`;
    });
    ctx.ui.notify(lines.join("\n"), "info");
  }

  function getAgentList(ref: string, cwd: string): string[] {
    const dir = ref === cwd ? cwd : resolveDir(ref, { cwd });
    const subs = listAgentsInDir(dir);
    const agents: string[] = [];
    try {
      loadAgent(dir);
      agents.push(". (root agent)");
    } catch {
      // directory is a collection, not an agent root
    }
    agents.push(...subs);
    return agents;
  }

  function handleList(
    ctx: { ui: { notify: (msg: string, type: string) => void }; cwd: string },
    ref?: string,
  ) {
    try {
      const agents = getAgentList(ref ?? ctx.cwd, ctx.cwd);
      if (agents.length === 0) {
        ctx.ui.notify("No agents found", "info");
        return;
      }
      ctx.ui.notify(`Available agents:\n${agents.map((agent) => `  ${agent}`).join("\n")}`, "info");
    } catch (error) {
      ctx.ui.notify(`${(error as Error).message}`, "error");
    }
  }

  function handleNew(piApi: ExtensionAPI, ctx: UiContext, prompt: string) {
    try {
      state.pendingRestore = { agent: state.currentAgent, ref: state.currentRef };
      state.currentAgent = resolveAndLoad(ARCHITECT_REF, ctx.cwd);
      state.currentRef = null;
      setAgentStatus(ctx.ui, state.currentAgent);
      ctx.ui.notify("Loaded architect agent. Creating your agent...", "info");
      piApi.sendUserMessage(prompt);
    } catch (error) {
      state.pendingRestore = null;
      ctx.ui.notify(`Failed to load architect: ${(error as Error).message}`, "error");
    }
  }

  function logPolicyDecision(payload: Record<string, unknown>): void {
    pi.appendEntry("gitagent-policy-decision", {
      ...payload,
      at: new Date().toISOString(),
    });
  }

  // ── Restore state from session entries ───────────────────────────────

  unsafePi.on("session_start", async (_event: unknown, ctx: UiContext) => {
    const entries = ctx.sessionManager?.getEntries() ?? [];
    let lastRef: string | null = null;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as {
        type?: string;
        customType?: string;
        data?: { ref?: string | null };
      };
      if (entry.type !== "custom") continue;
      if (entry.customType === "gitagent-loaded") {
        lastRef = entry.data?.ref ?? null;
        break;
      }
      if (entry.customType === "gitagent-unloaded") {
        break;
      }
    }

    if (!lastRef) return;

    try {
      const agent = resolveAndLoad(lastRef, ctx.cwd);
      activateAgent(agent, lastRef, ctx);
    } catch {
      state.currentAgent = null;
      state.currentRef = null;
      setAgentStatus(ctx.ui, null);
    }
  });

  // ── Policy enforcement ───────────────────────────────────────────────

  unsafePi.on("tool_call", async (event: { toolName: string; input: unknown }, ctx: UiContext) => {
    if (!state.currentAgent) return;

    const decision = decideToolPolicy(state.currentAgent, event.toolName, event.input);
    const basePayload = {
      agent: state.currentAgent.manifest.name,
      toolName: event.toolName,
      summary: decision.classification.summary,
      classification: decision.classification.risk,
      matchedRule: decision.classification.matchedRule,
      policyMode: getRuntimePolicy(state.currentAgent).mode,
      reason: decision.reason,
    };

    if (decision.outcome === "allow") {
      if (decision.classification.risk !== "safe") {
        logPolicyDecision({ ...basePayload, outcome: "auto-allow" });
      }
      return;
    }

    if (decision.outcome === "block") {
      logPolicyDecision({ ...basePayload, outcome: "blocked" });
      ctx.ui.notify(
        `Blocked ${event.toolName} for ${state.currentAgent.manifest.name}: ${decision.reason}`,
        "info",
      );
      return { block: true, reason: `Blocked by gitagent policy: ${decision.reason}` };
    }

    if (!ctx.hasUI) {
      logPolicyDecision({ ...basePayload, outcome: "blocked-no-ui" });
      return {
        block: true,
        reason: `Approval required for ${event.toolName}, but no interactive UI is available`,
      };
    }

    const approved = await ctx.ui.confirm(
      `Approve ${event.toolName}?`,
      `${state.currentAgent.manifest.name} wants to run: ${decision.classification.summary}\n\nPolicy reason: ${decision.reason}\n\nAllow this action once?`,
    );

    logPolicyDecision({
      ...basePayload,
      outcome: approved ? "approved" : "denied",
    });

    if (!approved) {
      return { block: true, reason: `Denied by policy approval prompt: ${decision.reason}` };
    }

    ctx.ui.notify(`Approved ${event.toolName} for ${state.currentAgent.manifest.name}.`, "info");
    return;
  });

  // ── LLM-callable tools ────────────────────────────────────────────────

  unsafePi.registerTool({
    name: "gitagent_load",
    label: "Load Agent",
    description:
      "Load a gitagent agent into the session. The agent's identity, rules, and skills are injected into the system prompt on the next turn. Use followUp to queue a task that runs with the agent's context active.",
    promptSnippet:
      "Load a gitagent agent (local path, gh:owner/repo/agent, or full GitHub URL). Use followUp to queue work that runs under the agent's identity.",
    promptGuidelines: [
      "When the user asks to 'load agent X and do Y', call gitagent_load with ref=X and followUp=Y so Y runs with the agent's context.",
      "When the user just says 'load agent X', call gitagent_load with ref=X and no followUp.",
    ],
    parameters: Type.Object({
      ref: Type.String({
        description:
          "Agent reference: local name (code-reviewer), gh: shorthand (gh:owner/repo/agent), or full GitHub URL",
      }),
      followUp: Type.Optional(
        Type.String({
          description:
            "Task to execute after loading. Queued as a follow-up message so it runs with the agent's soul active in the system prompt.",
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { ref: string; followUp?: string },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: UiContext,
    ) {
      try {
        const agent = resolveAndLoad(params.ref, ctx.cwd);
        activateAgent(agent, params.ref, ctx);

        const switched = await switchModel(agent, ctx);
        const modelName = agent.manifest.model?.preferred ?? "default";
        const skillNames = agent.skills.map((skill) => skill.name).join(", ") || "none";
        const policyMode = getRuntimePolicy(agent).mode;

        if (params.followUp) {
          pi.sendUserMessage(params.followUp, { deliverAs: "followUp" });
        }

        const lines = [
          `Loaded ${agent.manifest.name} (model: ${modelName}, skills: ${skillNames}, policy: ${policyMode}).`,
          switched ? `Model switched to ${modelName}.` : "",
          params.followUp
            ? `Follow-up task queued: "${params.followUp}" — it will run with ${agent.manifest.name}'s context active.`
            : "Agent context will be active on the next message.",
        ].filter(Boolean);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            agent: agent.manifest.name,
            ref: params.ref,
            followUp: params.followUp ?? null,
            policyMode,
          },
        };
      } catch (error) {
        throw new Error(`Failed to load agent "${params.ref}": ${(error as Error).message}`);
      }
    },
  });

  unsafePi.registerTool({
    name: "gitagent_unload",
    label: "Unload Agent",
    description: "Remove the currently loaded gitagent agent from the session.",
    promptSnippet: "Unload the current gitagent agent from the session.",
    parameters: Type.Object({}),
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: UiContext,
    ) {
      if (!state.currentAgent) {
        return {
          content: [{ type: "text", text: "No agent loaded." }],
          details: {},
        };
      }
      const name = state.currentAgent.manifest.name;
      state.currentAgent = null;
      state.currentRef = null;
      state.lastFeedbackFingerprint = null;
      pi.appendEntry("gitagent-unloaded", {});
      setAgentStatus(ctx.ui, null);
      return {
        content: [{ type: "text", text: `Unloaded ${name}. Agent context removed.` }],
        details: { unloaded: name },
      };
    },
  });

  unsafePi.registerTool({
    name: "gitagent_info",
    label: "Agent Info",
    description: "Show information about the currently loaded gitagent agent.",
    promptSnippet:
      "Show the currently loaded gitagent agent's name, model, skills, and memory status.",
    parameters: Type.Object({}),
    async execute() {
      if (!state.currentAgent) {
        return {
          content: [{ type: "text", text: "No agent loaded." }],
          details: {},
        };
      }
      const info = buildAgentInfo(state.currentAgent);
      const text = Object.entries(info)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" | ") || "none" : value}`)
        .join("\n");
      return {
        content: [{ type: "text", text }],
        details: info,
      };
    },
  });

  unsafePi.registerTool({
    name: "gitagent_list",
    label: "List Agents",
    description: "List available gitagent agents in a directory or GitHub repo.",
    promptSnippet: "List available gitagent agents in a local directory or GitHub repo.",
    parameters: Type.Object({
      ref: Type.Optional(
        Type.String({
          description: "Directory or GitHub reference to list. Defaults to current working directory.",
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { ref?: string },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: UiContext,
    ) {
      try {
        const agents = getAgentList(params.ref ?? ctx.cwd, ctx.cwd);
        if (agents.length === 0) {
          return {
            content: [{ type: "text", text: "No agents found" }],
            details: {},
          };
        }
        return {
          content: [{ type: "text", text: `Available agents:\n${agents.map((agent) => `  ${agent}`).join("\n")}` }],
          details: { agents },
        };
      } catch (error) {
        throw new Error(`Failed to list agents: ${(error as Error).message}`);
      }
    },
  });

  unsafePi.registerTool({
    name: "gitagent_remember",
    label: "Remember",
    description:
      "Save a learning to the loaded agent's persistent memory. Use this whenever you discover something worth remembering across sessions.",
    promptSnippet: "Save a learning to the agent's persistent memory file.",
    promptGuidelines: [
      "Call gitagent_remember when you learn something important: project conventions, user preferences, decision rationale, discovered patterns, or useful context for future sessions.",
      "Keep entries concise. One learning per call. The memory file has a 200-line cap, oldest entries are trimmed.",
    ],
    parameters: Type.Object({
      learning: Type.String({
        description: "The learning to save. Be concise, one fact or pattern per entry.",
      }),
    }),
    async execute(_toolCallId: string, params: { learning: string }) {
      if (!state.currentAgent) {
        throw new Error("No agent loaded. Load an agent first with gitagent_load.");
      }
      const entry = `- ${todayIsoDate()}: ${params.learning}`;
      saveAgentMemoryEntry(state, state.currentAgent, entry);
      return {
        content: [{ type: "text", text: `Saved to ${state.currentAgent.manifest.name}'s memory.` }],
        details: { agent: state.currentAgent.manifest.name, entry },
      };
    },
  });

  // ── /gitagent command ────────────────────────────────────────────────

  unsafePi.registerCommand("gitagent", {
    description: "Load a gitagent agent into this session",
    handler: async (args: string | undefined, ctx: UiContext) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const subcommand = parts[0] || "";
      const rest = parts.slice(1).join(" ").trim();

      switch (subcommand) {
        case "load": {
          if (!rest) {
            ctx.ui.notify("Usage: /gitagent load <ref>", "error");
            return;
          }
          try {
            const agent = resolveAndLoad(rest, ctx.cwd);
            activateAgent(agent, rest, ctx);
            const switched = await switchModel(agent, ctx);
            const modelName = agent.manifest.model?.preferred ?? "default";
            const skillNames = agent.skills.map((skill) => skill.name).join(", ") || "none";
            const policyMode = getRuntimePolicy(agent).mode;
            ctx.ui.notify(
              `Loaded ${agent.manifest.name} (model: ${modelName}, skills: ${skillNames}, policy: ${policyMode})`,
              "info",
            );
            if (switched) {
              ctx.ui.notify(`Switched model to ${modelName}`, "info");
            }
          } catch (error) {
            ctx.ui.notify(`${(error as Error).message}`, "error");
          }
          return;
        }

        case "new": {
          if (!rest) {
            ctx.ui.notify("Usage: /gitagent new <prompt describing the agent to create>", "error");
            return;
          }
          handleNew(pi, ctx, rest);
          return;
        }

        case "list": {
          handleList(ctx, rest || undefined);
          return;
        }

        case "recommend": {
          if (!rest) {
            ctx.ui.notify("Usage: /gitagent recommend <task description>", "error");
            return;
          }
          try {
            const recommendations = recommendAgents(rest, ctx.cwd);
            ctx.ui.notify(formatRecommendations(recommendations), "info");
          } catch (error) {
            ctx.ui.notify(`Recommendation failed: ${(error as Error).message}`, "error");
          }
          return;
        }

        case "doctor": {
          try {
            const agent = rest ? resolveAndLoad(rest, ctx.cwd) : state.currentAgent;
            if (!agent) {
              ctx.ui.notify("No agent loaded. Use /gitagent doctor <ref> or load an agent first.", "error");
              return;
            }
            const report = runDoctor(agent, ctx.modelRegistry, mapModel);
            ctx.ui.notify(formatDoctorReport(report), report.ok ? "info" : "error");
          } catch (error) {
            ctx.ui.notify(`Doctor failed: ${(error as Error).message}`, "error");
          }
          return;
        }

        case "policy": {
          if (!state.currentAgent) {
            ctx.ui.notify("No agent loaded.", "info");
            return;
          }
          ctx.ui.notify(
            [
              `Runtime policy for ${state.currentAgent.manifest.name}:`,
              ...formatPolicySummary(state.currentAgent).map((line) => `  ${line}`),
            ].join("\n"),
            "info",
          );
          return;
        }

        case "info": {
          if (state.currentAgent) {
            showAgentInfo(ctx, state.currentAgent);
          } else {
            ctx.ui.notify("No agent loaded.", "info");
          }
          return;
        }

        case "refresh": {
          if (!state.currentAgent || !state.currentRef) {
            ctx.ui.notify("No agent loaded.", "info");
            return;
          }
          try {
            resolveAgent(state.currentRef, { refresh: true, cwd: ctx.cwd });
            state.currentAgent = resolveAndLoad(state.currentRef, ctx.cwd);
            setAgentStatus(ctx.ui, state.currentAgent);
            ctx.ui.notify(
              `Refreshed ${state.currentAgent.manifest.name}. Takes effect on next prompt.`,
              "info",
            );
          } catch (error) {
            ctx.ui.notify(`Refresh failed: ${(error as Error).message}`, "error");
          }
          return;
        }

        case "unload": {
          if (state.currentAgent) {
            const name = state.currentAgent.manifest.name;
            state.currentAgent = null;
            state.currentRef = null;
            state.lastFeedbackFingerprint = null;
            pi.appendEntry("gitagent-unloaded", {});
            setAgentStatus(ctx.ui, null);
            ctx.ui.notify(`Unloaded ${name}. Takes effect on next prompt.`, "info");
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

  // ── Architect restore and audits ─────────────────────────────────────

  unsafePi.on("agent_end", async (_event: unknown, ctx: UiContext) => {
    if (!state.pendingRestore) {
      auditAutoFeedback(ctx);
      auditSkillUsage(ctx);
      return;
    }

    const restore = state.pendingRestore;
    state.pendingRestore = null;

    state.currentAgent = restore.agent;
    state.currentRef = restore.ref;
    state.lastSkillAuditFingerprint = null;
    state.lastFeedbackFingerprint = null;
    state.skillEnforcementStreak = 0;

    setAgentStatus(ctx.ui, state.currentAgent);
    if (state.currentAgent) {
      ctx.ui.notify(`Architect finished. Restored ${state.currentAgent.manifest.name}.`, "info");
    } else {
      ctx.ui.notify("Architect finished. No previous agent to restore.", "info");
    }
  });

  // ── Auto-save session context to memory on shutdown ──────────────────

  unsafePi.on("session_shutdown", async (_event: unknown, ctx: UiContext) => {
    if (!state.currentAgent) return;
    if (state.rememberedThisSession) return;

    const entries = ctx.sessionManager?.getBranch() ?? [];
    const userMessages: string[] = [];
    for (const rawEntry of entries) {
      const entry = rawEntry as { type?: string; message?: { role?: string; content?: unknown } };
      if (entry.type !== "message") continue;
      if (entry.message?.role !== "user") continue;
      const text = extractText(entry.message.content);
      if (text) userMessages.push(text);
    }

    if (userMessages.length < 2) return;

    appendToMemory(
      state.currentAgent,
      `- ${todayIsoDate()}: [auto] Session ended without explicit memory save. Topic: "${userMessages[0]?.slice(0, 120) ?? ""}"`,
    );
  });

  // ── System prompt injection ──────────────────────────────────────────

  unsafePi.on("before_agent_start", async (event: { systemPrompt: string }) => {
    if (!state.currentAgent) return undefined;
    return {
      systemPrompt: event.systemPrompt + "\n\n" + state.currentAgent.systemPromptAppend,
    };
  });
}
