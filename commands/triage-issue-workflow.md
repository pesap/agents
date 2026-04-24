# Triage-Issue command prompt

You are running the khala `/triage-issue` workflow.

Requirements:
- Be concise.
- Use `triage-issue` + `debug-investigation` + `tdd-core` + `github` skills.
- Ask at most one initial clarification question if the problem statement is missing.
- Investigate code paths and related tests to find root cause.
- Produce a behavior-focused TDD fix plan (ordered RED/GREEN slices).
- Create a GitHub issue with: Problem, Root Cause Analysis, TDD Fix Plan, Acceptance Criteria.
- Keep issue durable: avoid brittle file-path/line-specific coupling.
- End with: root cause summary, issue URL/number, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.
