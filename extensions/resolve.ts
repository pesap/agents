/**
 * Agent Resolver
 *
 * Resolves a gitagent agent from:
 *   - Local directory:       ./code-reviewer, /abs/path/to/agent
 *   - GitHub shorthand:      pesap/agents/code-reviewer
 *   - GitHub URL:            https://github.com/pesap/agents/tree/main/code-reviewer
 *   - Git SSH:               git@github.com:pesap/agents.git
 *
 * GitHub repos are shallow-cloned to ~/.pitagent/cache/<hash> and reused.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

const CACHE_DIR = join(homedir(), ".pitagent", "cache");

export interface ResolvedAgent {
  dir: string;
  remote: boolean;
  ref: string;
}

function parseGitHubRef(ref: string): { repoUrl: string; subpath: string; branch: string } | null {
  // https://github.com/owner/repo[.git][/tree/branch[/subpath]]
  const httpsMatch = ref.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/
  );
  if (httpsMatch) {
    const [, owner, repo, branch, subpath] = httpsMatch;
    return {
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      subpath: subpath ?? "",
      branch: branch ?? "main",
    };
  }

  // git@github.com:owner/repo[.git]
  const sshMatch = ref.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    return { repoUrl: `git@github.com:${owner}/${repo}.git`, subpath: "", branch: "main" };
  }

  // owner/repo[/subpath]
  const parts = ref.split("/");
  if (parts.length >= 2 && !ref.startsWith("/") && !ref.startsWith(".")) {
    return {
      repoUrl: `https://github.com/${parts[0]}/${parts[1]}.git`,
      subpath: parts.slice(2).join("/"),
      branch: "main",
    };
  }

  return null;
}

function cloneOrUpdate(repoUrl: string, branch: string, refresh: boolean): string {
  const hash = createHash("sha256").update(`${repoUrl}#${branch}`).digest("hex").slice(0, 16);
  const repoDir = join(CACHE_DIR, hash);

  mkdirSync(CACHE_DIR, { recursive: true });

  if (existsSync(join(repoDir, ".git"))) {
    if (refresh) {
      execSync(`git -C "${repoDir}" fetch origin ${branch} && git -C "${repoDir}" reset --hard origin/${branch}`, {
        stdio: "pipe",
      });
    }
    return repoDir;
  }

  execSync(`git clone --depth 1 --branch "${branch}" "${repoUrl}" "${repoDir}"`, { stdio: "pipe" });
  return repoDir;
}

export interface ResolveOptions {
  refresh?: boolean;
  agent?: string;
  branch?: string;
  cwd?: string;
}

export function resolveAgent(ref: string, options: ResolveOptions = {}): ResolvedAgent {
  const cwd = options.cwd ?? process.cwd();

  // Local: absolute or relative path
  for (const candidate of [resolve(ref), resolve(cwd, ref)]) {
    if (existsSync(join(candidate, "agent.yaml"))) {
      return { dir: candidate, remote: false, ref };
    }
  }

  // GitHub
  const github = parseGitHubRef(ref);
  if (!github) {
    throw new Error(
      `Cannot resolve "${ref}". Not a local directory or recognized GitHub reference.\n` +
        `Expected: local path, owner/repo/agent, or https://github.com/owner/repo`
    );
  }

  if (options.branch) github.branch = options.branch;

  const repoDir = cloneOrUpdate(github.repoUrl, github.branch, options.refresh ?? false);
  const agentDir = options.agent
    ? join(repoDir, options.agent)
    : github.subpath
      ? join(repoDir, github.subpath)
      : repoDir;

  if (!existsSync(join(agentDir, "agent.yaml"))) {
    const available = listAgentsInDir(repoDir);
    const hint = available.length > 0
      ? `\nAvailable agents:\n${available.map((a) => `  - ${a}`).join("\n")}`
      : "";
    throw new Error(`No agent.yaml found at ${agentDir}${hint}`);
  }

  return { dir: agentDir, remote: true, ref };
}

export function resolveDir(ref: string, options: ResolveOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  for (const candidate of [resolve(ref), resolve(cwd, ref)]) {
    if (existsSync(candidate)) return candidate;
  }

  const github = parseGitHubRef(ref);
  if (!github) throw new Error(`Cannot resolve "${ref}".`);

  if (options.branch) github.branch = options.branch;
  const repoDir = cloneOrUpdate(github.repoUrl, github.branch, options.refresh ?? false);
  return github.subpath ? join(repoDir, github.subpath) : repoDir;
}

export function listAgentsInDir(dir: string): string[] {
  const agents: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(dir, entry.name, "agent.yaml"))) {
        agents.push(entry.name);
      }
    }
  } catch {
    // not a directory or unreadable
  }
  return agents.sort();
}
