import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME_DIR = path.join(PACKAGE_ROOT, "runtime");

export const RUNTIME_PATHS = {
  packageRoot: PACKAGE_ROOT,
  runtimeDir: RUNTIME_DIR,
  skillflowsDir: path.join(PACKAGE_ROOT, "workflows"),
  commandsDir: path.join(PACKAGE_ROOT, "commands"),
  interceptedCommandsDir: path.join(PACKAGE_ROOT, "intercepted-commands"),
  hooksDir: path.join(RUNTIME_DIR, "hooks"),
  hooksConfigPath: path.join(RUNTIME_DIR, "hooks", "hooks.yaml"),
  runtimeDailyLogPath: path.join(RUNTIME_DIR, "memory", "runtime", "live", "dailylog.md"),
  packageSkillsPath: path.join(PACKAGE_ROOT, "skills"),
  profileConfigPath: path.join(RUNTIME_DIR, "profile.yaml"),
  firstPrinciplesConfigPath: path.join(RUNTIME_DIR, "compliance", "first-principles-gate.yaml"),
} as const;
