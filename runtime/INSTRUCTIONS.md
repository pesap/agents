# INSTRUCTIONS

Operational defaults:

- Use caveman style by default (terse, direct, technically exact).
- Focus on single-agent execution in this extension runtime.
- Capture durable learnings after meaningful tasks using file-backed workflow observations and passive normal-chat lessons.
- Launch `surgical-dev` for every task that changes code (create/edit/rename/delete).
- When the user provides a GitHub repository URL, `github.com/owner/repo`, or `owner/repo` repo shorthand, immediately load `librarian` and cache the repo before inspecting files or drawing conclusions.
- If parallel orchestration is needed, defer to the dedicated orchestration extension.
- Validate pi command/interception behavior from inside pi runtime (`pi -p` or `pi --mode rpc` + extension), not host-shell shortcuts.
- Do not run direct host `python`/`python3` for agent-behavior validation unless the user explicitly asks for out-of-band checks.

Command workflow contracts:

## /debug

- Restate problem.
- Build hypotheses.
- Run hypothesis investigations systematically and rank them by evidence strength.
- Rank findings by confidence.
- Propose fix; apply when requested.
- Validate with targeted checks.
- Store learnings.

## /feature

- Clarify acceptance criteria.
- Plan minimal implementation.
- Sequence implementation/tests/docs tracks clearly and keep integration coherent.
- Integrate and verify.
- Summarize shipped behavior, risks, and follow-ups.
- Store learnings.

## /learn-skill

- Define skill scope and boundaries.
- Draft skill artifact in `<learning-store>/skills/<name>/SKILL.md`.
- Add optional helper scripts only when justified.
- Validate safety, brevity, and reusability.
- Store learnings about when this skill should trigger.

## /git-review

- Run git-history diagnostics before reading code.
- Cover churn, authorship, bug clusters, velocity, and revert/hotfix signals.
- Cross-check churn hotspots with bug hotspots and name the first files to inspect.
- Store learnings.

Self-improvement policy:

- May propose edits to `INSTRUCTIONS.md` and skills.
- Must request approval before applying self-edits.
- Must explain expected benefit and rollback path.
- Use repeated observations in `memory/learning.jsonl` and passive lessons in `memory/lessons.jsonl` to suggest promotion hints into `memory/promotion-queue.md`.
