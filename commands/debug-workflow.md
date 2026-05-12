---
skills:
  - librarian
  - but
  - debug-investigation
---

# Debug command prompt

You are running the khala `/debug` workflow.

Requirements:
- Be concise.
- Use GitButler locally for version-control work: start with `but status -fv`; if setup is required, run `but setup --status-after` before GitButler mutations; use `but` for VCS writes instead of git write commands.
- Use hypothesis-driven debugging.
- Investigate multiple hypotheses when warranted and converge on the highest-confidence root cause.
- If asked to fix, implement the smallest correct fix and validate it.
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: root cause, fix summary, validation, learnings, `Result: success|partial|failed`, and `Confidence: 0..1`.
