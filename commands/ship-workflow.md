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
- For GitButler decisions, read the relevant `but` skill references before claiming a native capability is missing, and report `Skill audit: full-read=yes native-path-confirmed=yes fallback-needed=no|yes` in the final summary.
- Identify all applied GitButler branches/stacks from `but status -fv`: ship target, dependency/stacked branches, unrelated parallel branches, and unassigned changes.
- Select exactly one ship target branch/stack. If ambiguous, show a branch/change table and ask before shipping.
- Treat other applied branches as parallel work; do not commit, push, or include their changes unless explicitly requested.
- Before shipping, verify the selected branch still has unique unmerged work relative to the repo default branch. If it is already merged or would create a duplicate PR, stop and ask/create a fresh target instead.
- Before push/PR, update the GitButler base using the native flow: run `but status --upstream`, then `but pull --check`; if upstream work exists and the check passes, run `but pull --status-after` so active branches are rebased onto the latest target branch/base. If conflicts appear, resolve them with `but resolve <commit-id>`, edit conflicted files, verify with `but resolve status`, then `but resolve finish` before pushing or opening a PR.
- Before push/PR, prove the ship branch is based on the latest default branch head for this task. If merge-base with `origin/<default>` is older than the current default-branch tip, rebuild/rebase first; do not open a PR from a stale base.
- If the selected branch already had a merged PR, especially after squash merge, do not reuse it for follow-up work. Create a fresh branch from the latest default branch and move only the intended current diff there.
- Before commit/push/PR, verify the requested edits are present in the current repo/worktree diff. Do not ship edits that were made only in agent-installed skill directories, cache checkouts, or other external copies.
- Prefer one focused branch and one PR per logical change. If a branch contains previously shipped work plus new work, rebuild the new work on a fresh branch before opening a PR.
- Never create an unsigned commit. If signing is unavailable, failing, or cannot be confirmed, stop and request assistance.
- Treat commit signature verification as distinct from CI/test verification. `verified`/`unverified` on a commit refers to signature status, not test status.
- Before reporting ship success, verify all invariants on the exact PR/branch being shipped: one intended commit, based on the latest default branch, signed/verified commit, plain markdown/text only (no HTML body/output), and green CI/checks.
- Run simplify only on current uncommitted scope for the selected ship target and preserve exact behavior.
- Detect project test/CI command from repo conventions; run it and stop on first failure.
- Ensure a GitButler branch/stack exists for the ship target before commit/push/PR.
- Commit only selected change IDs for the ship target.
- Never proceed past commit step if the commit would be unsigned.
- Push only after tests pass.
- Detect tracker platform and use matching skill/tooling (`github` or `gitlab`).
- If PR/MR for the ship target is already open, do not create duplicate; return link/status.
- If none is open, create one against the repo default branch unless a base was specified, using `.github/pull_request_template.md` when present, otherwise `skills/github/pr-template.md` for GitHub (or GitLab equivalent body).
- After opening or locating the PR/MR, inspect the real remote artifact before claiming success: confirm commit list, base branch, head branch, signature state, checks status, mergeability/conflict status, and that the PR body has no unreplaced placeholders from templates.
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: simplify summary, test/CI result, push status, PR/MR status/link, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.
