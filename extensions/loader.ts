/**
 * GitAgent Loader
 *
 * Parses a gitagent directory into structures pi can consume:
 * agent.yaml, SOUL.md, RULES.md, PROMPT.md, DUTIES.md, skills/, knowledge/, memory/
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseYaml } from "./yaml.js";

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentManifest {
  spec_version?: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  model?: {
    preferred?: string;
    fallback?: string[];
    constraints?: { temperature?: number; max_tokens?: number; top_p?: number };
  };
  skills?: string[];
  tools?: string[];
  agents?: Record<string, { description?: string; delegation?: { mode?: string; triggers?: string[] } }>;
  delegation?: { mode?: string };
  runtime?: { max_turns?: number; temperature?: number; timeout?: number };
  compliance?: {
    risk_tier?: string;
    supervision?: { human_in_the_loop?: string; escalation_triggers?: Array<Record<string, unknown>> };
    communications?: { fair_balanced?: boolean; no_misleading?: boolean };
    data_governance?: { pii_handling?: string };
    segregation_of_duties?: {
      assignments?: Record<string, string[]>;
      conflicts?: Array<[string, string]>;
      enforcement?: string;
    };
  };
  pi?: { scope?: string; tools?: string };
  tags?: string[];
  metadata?: {
    category?: string;
    beginner_friendly?: boolean;
    mutates_files?: boolean;
    best_for?: string[];
    feedback_memory_hook?: {
      enabled?: boolean;
      min_confidence?: number;
      max_chars?: number;
      redact_sensitive?: boolean;
    };
    runtime_policy?: {
      mode?: string;
      approvals?: Record<string, string>;
      allow_tools?: string[];
      deny_patterns?: Record<string, string[]>;
    };
    accessibility?: {
      plain_language?: boolean;
      show_beginner_hints?: boolean;
    };
    [key: string]: unknown;
  };
}

export interface SkillInfo {
  name: string;
  description: string;
  dir: string;
  skillMdPath: string;
  relativePath: string;
  whenToUse: string;
  instructionChecklist: string[];
}

export interface LoadedAgent {
  manifest: AgentManifest;
  dir: string;
  soul: string;
  rules: string;
  prompt: string;
  duties: string;
  skills: SkillInfo[];
  memory: string;
  /** The directory where this agent's memory file lives */
  memoryDir: string;
  /** True when memory lives alongside the agent (local), false when centralized (cached) */
  memoryIsLocal: boolean;
  /** Combined system prompt text to append */
  systemPromptAppend: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readOpt(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8").trim() : "";
}

function parseSkillFrontmatter(raw: string): { name: string; description: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "", description: "" };
  const fm = parseYaml(match[1]) as Record<string, unknown>;
  return { name: (fm.name as string) ?? "", description: (fm.description as string) ?? "" };
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkdownSection(markdown: string, heading: string): string {
  const regex = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "m");
  const match = markdown.match(regex);
  return match ? match[1].trim() : "";
}

function parseSkillBody(raw: string): { whenToUse: string; instructionChecklist: string[] } {
  const body = stripFrontmatter(raw);
  const whenToUse = extractMarkdownSection(body, "When to Use");
  const instructions = extractMarkdownSection(body, "Instructions");
  const instructionChecklist = instructions
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:\d+\.|-|\*)\s+/.test(line))
    .map((line) => line.replace(/^(?:\d+\.|-|\*)\s+/, "").trim())
    .filter(Boolean);

  return { whenToUse, instructionChecklist };
}

export interface LoadOptions {
  /** Base directory for centralized memory storage. Memory goes to <memoryBaseDir>/<agent-name>/MEMORY.md */
  memoryBaseDir?: string;
}

// ── Main ─────────────────────────────────────────────────────────────────

export function loadAgent(agentDir: string, options?: LoadOptions): LoadedAgent {
  const manifestPath = join(agentDir, "agent.yaml");
  if (!existsSync(manifestPath)) throw new Error(`No agent.yaml in ${agentDir}`);

  const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as unknown as AgentManifest;
  const soul = readOpt(join(agentDir, "SOUL.md"));
  const rules = readOpt(join(agentDir, "RULES.md"));
  const prompt = readOpt(join(agentDir, "PROMPT.md"));
  const duties = readOpt(join(agentDir, "DUTIES.md"));
  // Memory — centralized store keeps learnings safe from cache clears and refreshes
  const memoryDir = options?.memoryBaseDir
    ? join(options.memoryBaseDir, manifest.name)
    : join(agentDir, "memory");
  mkdirSync(memoryDir, { recursive: true });
  const memoryMdPath = join(memoryDir, "MEMORY.md");
  const memory = readOpt(memoryMdPath);

  // Skills
  const skills: SkillInfo[] = [];
  const skillsDir = join(agentDir, "skills");
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;
      const rawSkill = readFileSync(skillMdPath, "utf-8");
      const { name, description } = parseSkillFrontmatter(rawSkill);
      const { whenToUse, instructionChecklist } = parseSkillBody(rawSkill);
      skills.push({
        name: name || entry.name,
        description,
        dir: join(skillsDir, entry.name),
        skillMdPath,
        relativePath: relative(agentDir, skillMdPath),
        whenToUse,
        instructionChecklist,
      });
    }
  }

  // Knowledge (always_load docs)
  const knowledgeParts: string[] = [];
  const indexPath = join(agentDir, "knowledge", "index.yaml");
  if (existsSync(indexPath)) {
    const index = parseYaml(readFileSync(indexPath, "utf-8")) as {
      documents?: Array<{ path: string; always_load?: boolean }>;
    };
    for (const doc of index?.documents?.filter((d) => d.always_load) ?? []) {
      const knowledgePath = join(agentDir, "knowledge", doc.path);
      const content = readOpt(knowledgePath);
      if (!content) continue;
      knowledgeParts.push([
        `## Knowledge: ${doc.path}`,
        `Absolute path: \`${knowledgePath}\``,
        `Path from agent root: \`knowledge/${doc.path}\``,
        "",
        content,
      ].join("\n"));
    }
  }

  // Compliance constraints
  const complianceParts: string[] = [];
  const c = manifest.compliance;
  if (c) {
    if (c.supervision?.human_in_the_loop === "always") complianceParts.push("- All decisions require human approval");
    if (c.communications?.fair_balanced) complianceParts.push("- All communications must be fair and balanced");
    if (c.communications?.no_misleading) complianceParts.push("- Never make misleading or exaggerated statements");
    if (c.data_governance?.pii_handling === "redact") complianceParts.push("- Redact all PII from outputs");
    if (c.segregation_of_duties?.enforcement === "strict") complianceParts.push("- SOD enforcement is STRICT");
  }

  // Memory instructions
  const memoryIsLocal = !options?.memoryBaseDir;
  const memoryCommitHint = memoryIsLocal
    ? "This memory file is local (git-tracked). Commit it when you add important learnings so they're shared with the team."
    : "This memory file is centralized (not in the repo). No need to commit it.";
  const memorySection = [
    "## Memory\n",
    "You have persistent memory across sessions.",
    `Memory file: \`${memoryMdPath}\``,
    memoryCommitHint,
    "",
    "When you learn something important (project conventions, user preferences,",
    "decision rationale, discovered patterns), write it to your memory file.",
    "Keep entries concise and dated. Max 200 lines.",
    "",
    memory ? `### Current Memory\n\n${memory}` : "Memory is currently empty. Start writing learnings as you work.",
  ].join("\n");

  // Compose full system prompt append
  const parts: string[] = [];
  parts.push(`# ${manifest.name} v${manifest.version}\n\n${manifest.description}`);
  if (soul) parts.push(soul);
  if (rules) parts.push(rules);
  if (duties) parts.push(duties);
  if (prompt) parts.push(prompt);
  if (skills.length > 0) {
    parts.push([
      "## Skill Execution Protocol",
      "",
      "When a task arrives, map it against your skills before doing deep work.",
      `Agent root: \`${agentDir}\``,
      "1. Pick the most relevant skill(s) for the task.",
      "2. Follow each skill checklist while executing.",
      "3. If you need to read a skill file with a tool, use the absolute path shown below, or resolve any relative path against the agent root.",
      "4. In your final response, include a short `Skills Used` section with:",
      "   - skill name(s)",
      "   - one-line evidence for each skill",
      "5. If no skill applies, write `Skills Used: none` and why.",
      "",
      "Skill verification hooks may check that your final response includes this section.",
    ].join("\n"));

    const skillsText = skills
      .map((s) => {
        const checklist =
          s.instructionChecklist.length > 0
            ? s.instructionChecklist.map((item) => `  - ${item}`).join("\n")
            : "  - Follow the instructions in SKILL.md";

        return [
          `### ${s.name}`,
          `Absolute path: \`${s.skillMdPath}\``,
          `Path from agent root: \`${s.relativePath}\``,
          `Description: ${s.description || "(no description provided)"}`,
          `When to use: ${s.whenToUse || "Use this when the task matches this domain."}`,
          "Checklist:",
          checklist,
        ].join("\n");
      })
      .join("\n\n");

    parts.push(`## Available Skills\n\n${skillsText}`);
  }
  parts.push(...knowledgeParts);
  if (complianceParts.length > 0) parts.push(`## Compliance Constraints\n\n${complianceParts.join("\n")}`);
  parts.push(memorySection);

  return {
    manifest,
    dir: agentDir,
    soul,
    rules,
    prompt,
    duties,
    skills,
    memory,
    memoryDir,
    memoryIsLocal: !options?.memoryBaseDir,
    systemPromptAppend: parts.join("\n\n"),
  };
}

/** Map gitagent model name to provider/modelId */
export function mapModel(preferred: string): { provider: string; modelId: string } {
  if (preferred.includes("/")) {
    const [provider, modelId] = preferred.split("/", 2);
    return { provider, modelId };
  }
  if (preferred.startsWith("claude")) return { provider: "anthropic", modelId: preferred };
  if (/^(gpt|o[134])/.test(preferred)) return { provider: "openai", modelId: preferred };
  if (preferred.startsWith("gemini")) return { provider: "google", modelId: preferred };
  if (preferred.startsWith("deepseek")) return { provider: "deepseek", modelId: preferred };
  return { provider: "anthropic", modelId: preferred };
}
