import { join } from "node:path";
import { listAgentsInDir, resolveDir } from "./resolve.js";
import { loadAgent, type LoadedAgent } from "./loader.js";
import { getRuntimePolicy } from "./policy.js";

export interface AgentRecommendation {
  agent: LoadedAgent;
  score: number;
  reasons: string[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "for",
  "of",
  "with",
  "my",
  "in",
  "on",
  "please",
  "help",
  "need",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function getMetadataStrings(agent: LoadedAgent): string[] {
  const metadata = agent.manifest.metadata;
  if (!metadata || typeof metadata !== "object") return [];
  const record = metadata as Record<string, unknown>;
  const strings: string[] = [];

  for (const key of ["category"]) {
    const value = record[key];
    if (typeof value === "string") strings.push(value);
  }

  const bestFor = record.best_for;
  if (Array.isArray(bestFor)) {
    strings.push(...bestFor.filter((item): item is string => typeof item === "string"));
  }

  return strings;
}

function scoreAgent(agent: LoadedAgent, query: string): AgentRecommendation {
  const tokens = tokenize(query);
  const haystacks = [
    agent.manifest.name,
    agent.manifest.description,
    ...(agent.manifest.tags ?? []),
    ...agent.skills.map((skill) => `${skill.name} ${skill.description} ${skill.whenToUse}`),
    ...getMetadataStrings(agent),
  ].map((value) => value.toLowerCase());

  let score = 0;
  const reasons: string[] = [];

  for (const token of tokens) {
    if (agent.manifest.name.toLowerCase().includes(token)) {
      score += 4;
      reasons.push(`name matches '${token}'`);
      continue;
    }

    if (agent.manifest.tags?.some((tag) => tag.toLowerCase().includes(token))) {
      score += 3;
      reasons.push(`tag matches '${token}'`);
      continue;
    }

    if (agent.skills.some((skill) => skill.name.toLowerCase().includes(token) || skill.description.toLowerCase().includes(token))) {
      score += 3;
      reasons.push(`skill matches '${token}'`);
      continue;
    }

    if (haystacks.some((value) => value.includes(token))) {
      score += 2;
      reasons.push(`description matches '${token}'`);
    }
  }

  if (agent.manifest.metadata?.beginner_friendly === true && /beginner|learn|simple|explain/.test(query.toLowerCase())) {
    score += 2;
    reasons.push("beginner-friendly metadata");
  }

  if (agent.manifest.metadata?.mutates_files === false && /review|analy[sz]e|audit|inspect/.test(query.toLowerCase())) {
    score += 1;
    reasons.push("safe read-oriented profile");
  }

  return {
    agent,
    score,
    reasons: [...new Set(reasons)],
  };
}

export function recommendAgents(query: string, cwd: string, ref?: string): AgentRecommendation[] {
  const baseDir = resolveDir(ref ?? cwd, { cwd });
  const agentDirs = listAgentsInDir(baseDir).map((entry) => join(baseDir, entry));
  const allDirs = [...agentDirs];

  try {
    loadAgent(baseDir);
    allDirs.push(baseDir);
  } catch {
    // base dir is not itself an agent, only a collection.
  }

  return allDirs
    .map((dir) => loadAgent(dir))
    .map((agent) => scoreAgent(agent, query))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.agent.manifest.name.localeCompare(b.agent.manifest.name))
    .slice(0, 5);
}

export function formatRecommendations(recommendations: AgentRecommendation[]): string {
  if (recommendations.length === 0) {
    return "No strong agent match found. Try a more specific task description.";
  }

  const lines = ["Recommended agents:"];
  recommendations.forEach((recommendation, index) => {
    const policy = getRuntimePolicy(recommendation.agent);
    const reasons = recommendation.reasons.slice(0, 3).join(", ") || "general fit";
    lines.push(
      `${index + 1}. ${recommendation.agent.manifest.name} (${policy.mode})`,
      `   ${recommendation.agent.manifest.description}`,
      `   Why: ${reasons}`,
    );
  });
  return lines.join("\n");
}
