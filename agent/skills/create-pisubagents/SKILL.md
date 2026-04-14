---
name: create-pisubagents
description: Create or update persistent Pi subagents and chains using the `subagent` management API with clear scope, triggers, and validation.
---

## Use when
- User asks to create, update, or delete a reusable subagent profile.
- User wants a specialized agent (for example `python-developer`, `reviewer-*`, domain-specific planners).
- User wants to define or edit a reusable chain of subagents.
- User asks how to configure model/tools/skills/system prompt for a subagent.

## Avoid when
- Task is a one-off execution, use builtin `worker/scout/planner/reviewer` directly instead.
- User only wants normal code edits/debugging, not persistent agent definitions.
- Required inputs are missing (name, purpose, scope) and user does not want to decide.

## Required inputs
- `name`: agent or chain name.
- `purpose`: what it should do better than generic agents.
- `scope`: `user` or `project`.
- `mode`: `create`, `update`, `delete`, or `get`.

Optional but recommended: model, tools, skills, thinking level, output style, safety constraints.

## Workflow
1. **Scope**
   - Restate target capability, boundaries, and expected output style.
2. **Clarify (only if needed)**
   - Ask up to 3 short questions for missing must-haves (name, scope, mode, core behavior).
3. **Discover existing definitions**
   - Run `subagent` with `action:"list"` (and `agentScope:"both"` when collision risk exists).
4. **Draft minimal config**
   - Keep prompt compact, include mission, operating rules, validation/reporting contract.
   - Prefer minimal tools; add only what the capability needs.
5. **Apply**
   - `create`: `subagent { action:"create", config:{...} }`
   - `update`: `subagent { action:"update", agent:"<name>", config:{...}, agentScope:"user|project" }`
   - `delete`: only with explicit user confirmation.
6. **Validate**
   - Run `subagent { action:"get", agent:"<name>" }` and verify model/tools/prompt/skills.
   - Optional smoke test: run one tiny task and confirm non-empty output.
7. **Deliver**
   - Report final config path, what changed, and how to invoke it.

## Safety and quality checks
- Never delete or overwrite definitions without explicit confirmation.
- Resolve name collisions by explicitly setting `agentScope`.
- Keep prompts reusable, avoid project-private overfitting unless requested.
- If runtime returns empty output, report it as tool/runtime limitation, do not fake success.

## Output format
- Skill summary
- Generated artifacts (exact file paths)
- Learnings (trigger and boundary notes)
- `Result: success|partial|failed`
- `Confidence: 0..1`

## Test prompts
1. "Create a `python-developer` subagent for my user scope, enforce uv+pyproject, typed returns, pytest function-style tests, and concise handoff output."
2. "Update existing `reviewer`-style subagent in project scope to require risk-ranked findings and explicit file/line references."
3. "Define a chain called `feature-fastlane` that runs scout -> planner -> parallel workers, then summarize expected artifacts and invocation."