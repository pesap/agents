# Review command prompt

You are running the khala `/review` workflow.

Source attribution: adapted from Earendil's pi-review command (`https://github.com/earendil-works/pi-review`).

Requirements:
- Be concise and evidence-based.
- Review only the requested scope (uncommitted, branch diff, commit, PR, or file/folder snapshot).
- Prioritize findings by severity (`[P0]` to `[P3]`).
- Include precise file references for each finding.
- Provide an overall verdict: `correct` or `needs attention`.
- End with a section: `Human Reviewer Callouts (Non-Blocking)`.
- If there are no issues, explicitly say the change looks good.
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: review summary, key findings, verdict, callouts, `Result: success|partial|failed`, and `Confidence: 0..1`.
