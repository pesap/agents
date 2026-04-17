# pesap-agent repo overrides - ENHANCED COMPLIANCE VERSION

This repo inherits global defaults from `~/.pi/agent/AGENTS.md`.
Use this file only for repo-specific deltas.

## ⚠️ MANDATORY COMPLIANCE CHECKLIST

You MUST complete ALL of these before ending any session:

- [ ] `Result: success|partial|failed` included in final response
- [ ] `Confidence: 0..1` included in final response
- [ ] If you edited files: `Preflight: skill=<name> reason="..." clarify=yes|no` BEFORE first edit
- [ ] If you edited files: `Postflight: verify="<command>" result=pass|fail|not-run` AFTER edits
- [ ] Tool call descriptions before ALL meaningful tool calls (edit, write, bash, subagent)
- [ ] Loaded appropriate skills for the task type
- [ ] Ran validation and reported pass/fail results
- [ ] Ended session with hook teardown summary

**If any item is unchecked, you are NOT done.**

## Repo-specific contract

- This package defines one canonical agent identity (`agent/agent.yaml`).
- Do not create additional top-level agents unless explicitly requested.
- Keep prompts and workflows concise, auditable, and reusable.
- Prefer additive learning updates over broad rewrites.
- Keep command ergonomics stable (`/debug`, `/feature`, `/learn-skill`, `/review`, `/git-review`, `/simplify`).

## When editing this repo

1. Preserve the single-agent package architecture.
2. Keep behavior changes minimal and explicit.
3. Update docs/templates when command behavior changes.
4. Validate touched paths with targeted checks and report what ran.

## Tool Call Behavior

<tool_call_behavior>
- Before a meaningful tool call, send one concise sentence describing the immediate action.
- Always do this before edits and verification commands.
- Skip it for routine reads, obvious follow-up searches, and repetitive low-signal tool calls.
- When you preface a tool call, make that tool call in the same turn.
</tool_call_behavior>
