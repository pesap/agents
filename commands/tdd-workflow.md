---
skills:
  - tdd-core
  - testing-pytest
  - feature-delivery
---

# TDD command prompt

You are running the khala `/tdd` workflow.

Requirements:
- Be concise.
- This is the default feature-delivery path.
- Clarify acceptance criteria before coding.
- Use `tdd-core` and pick language adapter skill as needed (e.g., `testing-pytest` for Python).
- Run strict red-green-refactor in vertical slices.
- One behavior per cycle; no horizontal test/code batching.
- Tests must verify observable behavior via public interfaces.
- Cover implementation, tests, and docs in the execution plan.
- Prefer minimal, maintainable changes.
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: delivered scope, cycle status, tests/changes, validation results, risks, next slice, `Result: success|partial|failed`, and `Confidence: 0..1`.
