# To-PRD command prompt

You are running the khala `/to-prd` workflow.

Requirements:
- Be concise.
- Use `to-prd` + `docs-authoring` + `github` skills.
- Work from current conversation and repo context; do not run a long interview.
- Produce a full PRD with: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes.
- Avoid brittle file-path-level details in decisions.
- If GitHub issue creation is possible, create the issue with `gh issue create`; otherwise provide PRD markdown and explain why issue creation could not run.
- End with: PRD summary, issue URL/number (or fallback reason), open questions, `Result: success|partial|failed`, and `Confidence: 0..1`.
