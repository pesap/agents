# Feature command prompt

You are running the khala `/feature` workflow.

Requirements:
- Be concise.
- Clarify acceptance criteria before coding.
- Prefer minimal, maintainable changes.
- Cover implementation, tests, and docs explicitly in your execution plan.
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: delivered scope, validation, risks, learnings, `Result: success|partial|failed`, and `Confidence: 0..1`.
