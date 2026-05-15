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

Keep this prompt thin. Use `workflows/ship-workflow.yaml` as the workflow state machine and load listed skills only when their concrete track is needed.

Hard requirements:
- Be concise.
- Start by detecting VCS mode: run `but status -fv`; if GitButler is unavailable, report normal Git mode and follow the workflow's fallback policy before any VCS mutation.
- Use GitButler for local VCS writes when available; never use git write commands in a GitButler workspace.
- Follow the workflow order exactly: detect VCS mode -> update latest base/default branch -> inspect -> select target -> simplify -> validate -> commit -> push -> PR/MR -> remote verify -> summarize.
- Select exactly one ship target branch/stack. If ambiguous, show a branch/change table and ask before shipping.
- Treat all other applied branches/stacks as parallel work; do not include them unless explicitly requested.
- Stop before commit if signing cannot be verified.
- Stop before PR/MR if target branch is stale, already merged, reused after merge, or lacks unique unmerged work.
- Do not report success until the real remote PR/MR invariants in the workflow spec are verified.
- If you mutate files, include exactly one line: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- Final response must include: simplify summary, test/CI result, push status, PR/MR status/link, risks, `Skill audit: full-read=yes native-path-confirmed=yes fallback-needed=no|yes`, `Result: success|partial|failed`, and `Confidence: 0..1`.
