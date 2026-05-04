import path from "node:path";
import { buildLifecycleHookMarkdown, type HookConfig } from "../hooks/config";
import { readText, readTextIfExists } from "../lib/io";
import { type LearningPaths } from "../learning/store";
import {
  parseFirstPrinciplesConfig,
  type FirstPrinciplesConfig,
} from "../policy/first-principles";

export async function loadFirstPrinciplesConfig(
  firstPrinciplesConfigPath: string,
  defaults?: FirstPrinciplesConfig,
): Promise<{ config: FirstPrinciplesConfig; warnings: string[] }> {
  const raw = await readTextIfExists(firstPrinciplesConfigPath);
  return parseFirstPrinciplesConfig(raw, defaults);
}

export function createWorkflowReaders(params: {
  skillflowsDir: string;
  commandsDir: string;
  packageSkillsPath: string;
}): {
  readWorkflow: (name: string) => Promise<string>;
  readCommandPrompt: (name: string) => Promise<string>;
  readSkill: (name: string) => Promise<string>;
} {
  async function readWorkflow(name: string): Promise<string> {
    return readText(path.join(params.skillflowsDir, name));
  }

  async function readCommandPrompt(name: string): Promise<string> {
    return readText(path.join(params.commandsDir, name));
  }

  async function readSkill(name: string): Promise<string> {
    const skillFile = path.resolve(params.packageSkillsPath, name, "SKILL.md");
    const skillsRoot = `${path.resolve(params.packageSkillsPath)}${path.sep}`;
    if (!skillFile.startsWith(skillsRoot)) {
      return "";
    }
    return readTextIfExists(skillFile);
  }

  return { readWorkflow, readCommandPrompt, readSkill };
}

export async function getBootstrapPayload(params: {
  cwd: string;
  runtimeDir: string;
  hooksDir: string;
  activeHookConfig: HookConfig;
  learningPathCache: Map<string, LearningPaths>;
  memoryTailLines: number;
}): Promise<string> {
  const [
    soul,
    rules,
    duties,
    instructions,
    complianceProfile,
    startupHooks,
  ] = await Promise.all([
    readTextIfExists(path.join(params.runtimeDir, "SOUL.md")),
    readTextIfExists(path.join(params.runtimeDir, "RULES.md")),
    readTextIfExists(path.join(params.runtimeDir, "DUTIES.md")),
    readTextIfExists(path.join(params.runtimeDir, "INSTRUCTIONS.md")),
    readTextIfExists(path.join(params.runtimeDir, "compliance", "risk-assessment.md")),
    buildLifecycleHookMarkdown({
      lifecycle: "on_session_start",
      activeHookConfig: params.activeHookConfig,
      hooksDir: params.hooksDir,
    }),
  ]);

  return [
    "Khala agent bootstrap context (single-agent runtime):",
    "",
    "[SOUL]",
    soul.trim(),
    "",
    "[RULES]",
    rules.trim(),
    duties.trim() ? "[DUTIES]" : "",
    duties.trim(),
    "",
    "[INSTRUCTIONS]",
    instructions.trim(),
    complianceProfile.trim() ? "[COMPLIANCE PROFILE]" : "",
    complianceProfile.trim(),
    startupHooks.trim() ? "[LIFECYCLE HOOKS: on_session_start]" : "",
    startupHooks.trim(),
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
