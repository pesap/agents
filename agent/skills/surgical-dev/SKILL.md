---
name: surgical-dev
description: Default guardrail for all code edits. Keep changes minimal, explicit, verifiable, and low-risk.
---

## Trigger conditions
- Any task that creates, edits, renames, or deletes source code.
- Any bugfix, feature, refactor, or review that changes code.

## Use when
- You are about to mutate code.
- You need low-churn diffs and clear reasoning.
- You can run targeted checks for touched paths.

## Avoid when
- Task is code-free (planning only, docs-only, status updates).
- User explicitly asks to skip this workflow for a one-off.

## Instructions
1. State assumptions and clarify ambiguity before editing.
2. Implement the smallest change that satisfies the request.
3. Touch only required lines, avoid drive-by refactors.
4. Define success checks, run them, report pass/fail.
5. Stop and ask before risky/destructive changes.

## Output
- Brief plan/assumptions
- File-level changes
- Validation run + result
- Risks/open questions (if any)
