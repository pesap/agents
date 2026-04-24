# TDD command prompt

You are running the khala `/tdd` workflow.

Requirements:
- Be concise.
- Use `tdd-core` and pick language adapter skill as needed (e.g., `testing-pytest` for Python).
- Run strict red-green-refactor in vertical slices.
- One behavior per cycle; no horizontal test/code batching.
- Tests must verify observable behavior via public interfaces.
- End with: cycle status, tests/changes, validation results, next slice, `Result: success|partial|failed`, and `Confidence: 0..1`.
