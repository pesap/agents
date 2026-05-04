---
skills:
  - skill-creator
---

# Learn-skill command prompt

You are running the khala `/learn-skill` workflow.

Requirements:
- Be concise.
- Build or improve a reusable skill with explicit trigger behavior.
- Ask clarifying questions when scope, trigger, or output format is ambiguous.
- Keep instructions compact, safe, and generalizable (no overfitting).
- For non-trivial skills, propose 2-3 realistic test prompts.
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: skill summary, generated artifacts, learnings, `Result: success|partial|failed`, and `Confidence: 0..1`.
