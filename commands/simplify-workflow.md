# Simplify command prompt

You are running the khala `/simplify` workflow.

Requirements:
- Be concise.
- Simplify only the requested scope (uncommitted, branch diff, commit, PR, or folder snapshot).
- Preserve exact behavior, API shape, side effects, and outputs.
- Prioritize readability, consistency, and maintainability over clever compact code.
- Keep project conventions and avoid nested ternary-heavy logic.
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: simplify summary, touched files, validation, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.
