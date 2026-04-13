import type { LoadedAgent } from "./loader.js";

export interface PendingRestore {
  agent: LoadedAgent | null;
  ref: string | null;
}

export interface GitAgentRuntimeState {
  currentAgent: LoadedAgent | null;
  currentRef: string | null;
  pendingRestore: PendingRestore | null;
  rememberedThisSession: boolean;
  lastSkillAuditFingerprint: string | null;
  lastFeedbackFingerprint: string | null;
  skillEnforcementStreak: number;
}

export function createRuntimeState(): GitAgentRuntimeState {
  return {
    currentAgent: null,
    currentRef: null,
    pendingRestore: null,
    rememberedThisSession: false,
    lastSkillAuditFingerprint: null,
    lastFeedbackFingerprint: null,
    skillEnforcementStreak: 0,
  };
}
