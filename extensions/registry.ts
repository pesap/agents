import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureRegistryPath, getRegistryPath } from "./paths.js";

export interface InstalledAgentRecord {
  name: string;
  dir: string;
  source: "local" | "remote";
  editable: boolean;
  ref: string;
  installedAt: string;
  repoUrl?: string;
  branch?: string;
  repoDir?: string;
}

function sortRecords(records: InstalledAgentRecord[]): InstalledAgentRecord[] {
  return [...records].sort((a, b) => a.name.localeCompare(b.name));
}

export { getRegistryPath };

export function readInstalledAgents(): InstalledAgentRecord[] {
  const registryPath = ensureRegistryPath();
  if (!existsSync(registryPath)) return [];

  try {
    const raw = readFileSync(registryPath, "utf-8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortRecords(
      parsed.filter((entry): entry is InstalledAgentRecord => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as Partial<InstalledAgentRecord>;
        return (
          typeof candidate.name === "string" &&
          typeof candidate.dir === "string" &&
          (candidate.source === "local" || candidate.source === "remote") &&
          typeof candidate.editable === "boolean" &&
          typeof candidate.ref === "string" &&
          typeof candidate.installedAt === "string"
        );
      }),
    );
  } catch {
    return [];
  }
}

export function findInstalledAgent(name: string): InstalledAgentRecord | null {
  return readInstalledAgents().find((agent) => agent.name === name) ?? null;
}

export function saveInstalledAgents(records: InstalledAgentRecord[]): void {
  const registryPath = ensureRegistryPath();
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(sortRecords(records), null, 2)}\n`, "utf-8");
}

export function upsertInstalledAgents(records: InstalledAgentRecord[]): InstalledAgentRecord[] {
  const current = readInstalledAgents();
  const byName = new Map(current.map((record) => [record.name, record]));

  for (const record of records) {
    byName.set(record.name, record);
  }

  const merged = sortRecords([...byName.values()]);
  saveInstalledAgents(merged);
  return merged;
}

export function removeInstalledAgents(names: string[]): InstalledAgentRecord[] {
  const wanted = new Set(names.map((name) => name.trim()).filter(Boolean));
  if (wanted.size === 0) return [];

  const current = readInstalledAgents();
  const removed = current.filter((record) => wanted.has(record.name));
  if (removed.length === 0) return [];

  saveInstalledAgents(current.filter((record) => !wanted.has(record.name)));
  return sortRecords(removed);
}

export function clearInstalledAgents(): InstalledAgentRecord[] {
  const current = readInstalledAgents();
  if (current.length === 0) return [];

  saveInstalledAgents([]);
  return current;
}
