import { accessSync, constants, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LoadedAgent } from "./loader.js";
import { formatPolicySummary } from "./policy.js";

export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  subject: string;
  checks: DoctorCheck[];
}

function pushCheck(checks: DoctorCheck[], check: DoctorCheck): void {
  checks.push(check);
}

function ensureWritableDir(path: string): void {
  mkdirSync(path, { recursive: true });
  accessSync(path, constants.R_OK | constants.W_OK);
}

function modelExists(modelRegistry: { find: (provider: string, modelId: string) => unknown }, provider: string, modelId: string): boolean {
  return Boolean(modelRegistry.find(provider, modelId));
}

function icon(status: DoctorCheck["status"]): string {
  switch (status) {
    case "pass":
      return "✓";
    case "warn":
      return "!";
    case "fail":
      return "✗";
  }
}

export function runDoctor(
  agent: LoadedAgent,
  modelRegistry: { find: (provider: string, modelId: string) => unknown },
  mapModel: (preferred: string) => { provider: string; modelId: string },
): DoctorReport {
  const checks: DoctorCheck[] = [];

  try {
    ensureWritableDir(join(homedir(), ".pitagent", "cache"));
    pushCheck(checks, {
      name: "cache-dir",
      status: "pass",
      message: "cache directory is writable",
    });
  } catch (error) {
    pushCheck(checks, {
      name: "cache-dir",
      status: "fail",
      message: `cache directory is not writable: ${(error as Error).message}`,
    });
  }

  try {
    ensureWritableDir(agent.memoryDir);
    pushCheck(checks, {
      name: "memory-dir",
      status: "pass",
      message: `memory directory is writable (${agent.memoryDir})`,
    });
  } catch (error) {
    pushCheck(checks, {
      name: "memory-dir",
      status: "fail",
      message: `memory directory is not writable: ${(error as Error).message}`,
    });
  }

  const preferredModel = agent.manifest.model?.preferred;
  if (preferredModel) {
    const mapped = mapModel(preferredModel);
    if (modelExists(modelRegistry, mapped.provider, mapped.modelId)) {
      pushCheck(checks, {
        name: "preferred-model",
        status: "pass",
        message: `preferred model resolves (${mapped.provider}/${mapped.modelId})`,
      });
    } else {
      pushCheck(checks, {
        name: "preferred-model",
        status: "fail",
        message: `preferred model does not resolve (${mapped.provider}/${mapped.modelId})`,
      });
    }
  } else {
    pushCheck(checks, {
      name: "preferred-model",
      status: "warn",
      message: "agent does not declare a preferred model",
    });
  }

  const fallbackModels = agent.manifest.model?.fallback ?? [];
  if (fallbackModels.length === 0) {
    pushCheck(checks, {
      name: "fallback-models",
      status: "warn",
      message: "agent does not declare fallback models",
    });
  } else {
    const missingFallbacks = fallbackModels
      .map((model) => mapModel(model))
      .filter((mapped) => !modelExists(modelRegistry, mapped.provider, mapped.modelId));

    pushCheck(checks, {
      name: "fallback-models",
      status: missingFallbacks.length === 0 ? "pass" : "warn",
      message:
        missingFallbacks.length === 0
          ? `all ${fallbackModels.length} fallback models resolve`
          : `missing fallback models: ${missingFallbacks
              .map((mapped) => `${mapped.provider}/${mapped.modelId}`)
              .join(", ")}`,
    });
  }

  pushCheck(checks, {
    name: "skills",
    status: agent.skills.length > 0 ? "pass" : "warn",
    message:
      agent.skills.length > 0
        ? `${agent.skills.length} skills loaded`
        : "no skills loaded, skill verification hook will stay inactive",
  });

  const feedbackHook = agent.manifest.metadata?.feedback_memory_hook as
    | { enabled?: boolean }
    | undefined;
  pushCheck(checks, {
    name: "feedback-hook",
    status: feedbackHook?.enabled ? "pass" : "warn",
    message: feedbackHook?.enabled
      ? "automatic feedback memory hook is enabled"
      : "automatic feedback memory hook is disabled",
  });

  pushCheck(checks, {
    name: "policy",
    status: "pass",
    message: formatPolicySummary(agent).join(" | "),
  });

  return {
    ok: checks.every((check) => check.status !== "fail"),
    subject: agent.manifest.name,
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const header = `${report.ok ? "Doctor passed" : "Doctor found problems"} for ${report.subject}`;
  const lines = report.checks.map((check) => `${icon(check.status)} ${check.name}: ${check.message}`);
  return [header, ...lines].join("\n");
}
