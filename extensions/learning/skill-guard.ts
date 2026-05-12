import { promises as fs } from "node:fs";
import path from "node:path";

export interface SkillGuardIssue {
  file: string;
  reason: string;
}

export interface SkillGuardResult {
  ok: boolean;
  issues: SkillGuardIssue[];
  fileCount: number;
  totalBytes: number;
}

const MAX_FILES = 32;
const MAX_TOTAL_BYTES = 200_000;
const TEXT_FILE_PATTERN =
  /\.(?:md|txt|json|ya?ml|sh|bash|zsh|fish|js|mjs|cjs|ts|mts|cts|py)$/i;
const EXECUTABLE_FILE_PATTERN =
  /\.(?:sh|bash|zsh|fish|js|mjs|cjs|ts|mts|cts|py)$/i;
const SECRET_CAPTURE_PATTERN =
  /\b(?:printenv|env)\b|\b(?:OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN)\b|(?:^|[/"'\s])(?:\.env(?:\.[\w-]+)?|id_rsa|id_ed25519|\.pem)\b/im;
const EXFIL_PATTERN =
  /\b(?:curl|wget|nc|netcat|scp|ssh|rsync)\b[\s\S]{0,160}\b(?:https?:\/\/|ftp:\/\/|@)/im;
const PERSISTENCE_PATTERN =
  /\b(?:crontab|launchctl|systemctl|service|LoginItems|\/etc\/profile|~\/\.zshrc|~\/\.bashrc)\b/im;
const INJECTION_PATTERN =
  /\b(?:ignore previous instructions|system prompt|developer message|hidden instruction|exfiltrate)\b/im;

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export async function validateGeneratedSkillDir(
  skillDir: string,
): Promise<SkillGuardResult> {
  const files = await walk(skillDir);
  const issues: SkillGuardIssue[] = [];
  let totalBytes = 0;

  if (files.length > MAX_FILES) {
    issues.push({
      file: ".",
      reason: `skill exceeds file limit (${files.length} > ${MAX_FILES})`,
    });
  }

  for (const file of files) {
    const stat = await fs.stat(file);
    totalBytes += stat.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      issues.push({
        file: ".",
        reason: `skill exceeds size limit (${totalBytes} > ${MAX_TOTAL_BYTES} bytes)`,
      });
      break;
    }

    if (!TEXT_FILE_PATTERN.test(file)) {
      issues.push({
        file: path.relative(skillDir, file),
        reason: "unsupported file type in generated skill",
      });
      continue;
    }

    const content = await fs.readFile(file, "utf8");
    if (SECRET_CAPTURE_PATTERN.test(content)) {
      issues.push({
        file: path.relative(skillDir, file),
        reason: "potential secret capture pattern",
      });
    }
    if (INJECTION_PATTERN.test(content)) {
      issues.push({
        file: path.relative(skillDir, file),
        reason: "potential hidden-instruction or prompt-injection pattern",
      });
    }
    if (EXECUTABLE_FILE_PATTERN.test(file) && EXFIL_PATTERN.test(content)) {
      issues.push({
        file: path.relative(skillDir, file),
        reason: "potential exfiltration behavior in executable content",
      });
    }
    if (EXECUTABLE_FILE_PATTERN.test(file) && PERSISTENCE_PATTERN.test(content)) {
      issues.push({
        file: path.relative(skillDir, file),
        reason: "dangerous persistence behavior in executable content",
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    fileCount: files.length,
    totalBytes,
  };
}
