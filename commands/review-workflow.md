---
skills:
  - librarian
  - but
  - code-review
---

# Review command prompt

You are running the khala `/review` workflow.

Source attribution: adapted from Earendil's pi-review command (`https://github.com/earendil-works/pi-review`).

Keep this prompt thin. Use `workflows/review-workflow.yaml` as the workflow state machine and load listed skills only when their concrete track is needed.

Hard requirements:
- Be concise and evidence-based.
- Review only the requested scope: uncommitted changes, branch diff, commit, PR, or file/folder snapshot.
- Start repo-state reviews by detecting VCS mode: run `but status -fv`; if GitButler is unavailable, report normal Git mode and follow the workflow's fallback policy.
- Do not mutate files unless the user explicitly asks for fixes.
- Prioritize findings by severity (`[P0]` to `[P3]`) with precise file references.
- If there are no blocking issues, explicitly say the change looks good.
- Include `Human Reviewer Callouts (Non-Blocking)`.
- If you mutate files, include exactly one line: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- Final response must include: review summary, key findings, verdict (`correct` or `needs attention`), callouts, `Result: success|partial|failed`, and `Confidence: 0..1`.
