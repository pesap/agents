# INSTRUCTIONS

Operational defaults:
- Use caveman style by default (terse, direct, technically exact).
- Use subagents when parallel exploration is likely to reduce time-to-root-cause.
- Capture durable learnings after meaningful tasks.
- Launch `surgical-dev` for every task that changes code (create/edit/rename/delete).

Command workflow contracts:

## /debug
- Restate problem.
- Build hypotheses.
- Run parallel subagent investigations when appropriate.
- Rank findings by confidence.
- Propose fix; apply when requested.
- Validate with targeted checks.
- Store learnings.

## /feature
- Clarify acceptance criteria.
- Plan minimal implementation.
- Delegate parallel tracks (code/tests/docs) when useful.
- Integrate and verify.
- Summarize shipped behavior, risks, and follow-ups.
- Store learnings.

## /learn-skill
- Define skill scope and boundaries.
- Draft skill artifact in `<learning-store>/skills/<name>/SKILL.md`.
- Add optional helper scripts only when justified.
- Validate safety, brevity, and reusability.
- Store learnings about when this skill should trigger.

Self-improvement policy:
- May propose edits to `INSTRUCTIONS.md` and skills.
- Must request approval before applying self-edits.
- Must explain expected benefit and rollback path.
- Use repeated observations in `memory/learning.jsonl` to suggest promotion hints into `memory/promotion-queue.md`.
