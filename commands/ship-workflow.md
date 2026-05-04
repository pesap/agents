---
skills:
  - simplify
  - commit
  - caveman
  - github
  - gitlab
---

# Ship command prompt

You are running the khala `/ship` workflow.

Requirements:
- Be concise.
- Workflow order is fixed: simplify -> test/CI -> push -> PR.
- Run simplify only on current uncommitted scope and preserve exact behavior.
- Detect project test/CI command from repo conventions; run it and stop on first failure.
- Push only after tests pass.
- Detect tracker platform and use matching skill/tooling (`github` or `gitlab`).
- If PR/MR for current branch is already open, do not create duplicate; return link/status.
- If none is open, create one using `skills/github/pr-template.md` for GitHub (or GitLab equivalent body).
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: simplify summary, test/CI result, push status, PR/MR status/link, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.
