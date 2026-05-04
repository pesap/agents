---
name: github
description: Use this skill when the user needs GitHub terminal workflows (PRs, issues, CI failures, workflow optimization, caching/artifacts, matrix builds, runner sizing), even if they don't explicitly mention GitHub Actions or gh CLI.
---

## Use when
- User asks to work with PRs/issues/runs from terminal.
- User asks to debug or optimize GitHub Actions workflows.
- User asks about cache, artifacts, matrix strategy, concurrency, or runner costs.

## Avoid when
- GitLab operations (use `gitlab` skill).
- Deep GitHub App/OAuth app implementation.
- Raw API workflows beyond practical `gh api` usage.

## Workflow
1. Confirm repo scope and desired outcome.
2. Gather evidence with `gh` commands.
3. Diagnose failure/bottleneck and propose minimal high-impact changes.
4. Validate via checks/reruns where possible.
5. For PR feedback responses, prefer direct replies in the original review thread.
6. When creating PRs, use the shared template from `skills/github/pr-template.md` via `gh pr create --body-file <path>`.
7. Summarize evidence, decisions, and residual risks.

## PR review reply policy
- Prefer replying in-thread to the reviewer comment (not a general PR comment).
- Use `gh api` with `in_reply_to` on `pulls/{pull_number}/comments`.
- Only use `gh pr comment` when there is no thread/comment ID to reply to.
- If wrong/general replies were posted, delete them and repost in-thread.

See [REFERENCE.md](./REFERENCE.md) for command recipes and CI optimization playbook.

## PR creation body policy
- Prefer explicit body injection over repo-default templates.
- Use `skills/github/pr-template.md` as baseline and fill placeholders (especially `Closes {LINK TO GH ISSUE}`).
- Command pattern:
  - `gh pr create --title "<title>" --body-file skills/github/pr-template.md`

## Output
- Command evidence (key `gh` output snippets)
- Findings and optimization recommendations
- Proposed/implemented workflow changes
- Validation status and follow-up actions
