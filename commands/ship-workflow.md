---
skills:
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
- Workflow order is fixed: simplify -> test/CI -> push -> PR.
- Run simplify only on current uncommitted scope and preserve exact behavior.
- Detect project test/CI command from repo conventions; run it and stop on first failure.
- If current branch is `main` or `master`, create a new feature branch before commit/push/PR unless the user specified a branch name.
- Push only after tests pass.
- Detect tracker platform and use matching skill/tooling (`github` or `gitlab`).
- If PR/MR for current branch is already open, do not create duplicate; return link/status.
- If none is open, create one using `.github/pull_request_template.md` when present, otherwise `skills/github/pr-template.md` for GitHub (or GitLab equivalent body).
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: simplify summary, test/CI result, push status, PR/MR status/link, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.

Workflow skills manifest:
- simplify: Safely simplify recently touched code for readability and maintainability while preserving exact behavior. File: skills/simplify/SKILL.md
- commit: Read this skill before making git commits. File: skills/commit/SKILL.md
- caveman: Ultra-compressed communication mode. File: skills/caveman/SKILL.md
- github: GitHub PR/CI workflow support. File: skills/github/SKILL.md
- gitlab: GitLab MR/CI workflow support. File: skills/gitlab/SKILL.md
- librarian: Cache remote git repositories for reusable local reference checkouts. Source: https://github.com/mitsuhiko/agent-stuff/tree/main/skills/librarian. File: skills/librarian/SKILL.md

Load full skill docs only when needed for a concrete analysis track or edit.
