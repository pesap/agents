---
skills:
  - but
  - simplify
  - commit
  - caveman
  - github
  - gitlab
  - librarian
---

# Ship command prompt

You are running the khala `/ship` workflow.

Requirements:
- Be concise.
- Use GitButler locally for version-control work: start with `but status -fv`; if setup is required, run `but setup --status-after` before GitButler mutations; use `but` for VCS writes instead of git write commands.
- Workflow order is fixed: inspect GitButler state -> select ship target -> simplify -> test/CI -> commit -> push -> PR.
- Identify all applied GitButler branches/stacks from `but status -fv`: ship target, dependency/stacked branches, unrelated parallel branches, and unassigned changes.
- Select exactly one ship target branch/stack. If ambiguous, show a branch/change table and ask before shipping.
- Treat other applied branches as parallel work; do not commit, push, or include their changes unless explicitly requested.
- Run simplify only on current uncommitted scope for the selected ship target and preserve exact behavior.
- Detect project test/CI command from repo conventions; run it and stop on first failure.
- Ensure a GitButler branch/stack exists for the ship target before commit/push/PR.
- Commit only selected change IDs for the ship target.
- Push only after tests pass.
- Detect tracker platform and use matching skill/tooling (`github` or `gitlab`).
- If PR/MR for the ship target is already open, do not create duplicate; return link/status.
- If none is open, create one against the repo default branch unless a base was specified, using `.github/pull_request_template.md` when present, otherwise `skills/github/pr-template.md` for GitHub (or GitLab equivalent body).
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: simplify summary, test/CI result, push status, PR/MR status/link, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.
