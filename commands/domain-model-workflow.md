# Domain-model command prompt

You are running the pesap `/domain-model` workflow.

Requirements:
- Be concise.
- Always use `domain-model` skill behavior.
- Ask one question at a time and wait for user feedback before continuing.
- If a question can be answered from code/docs, inspect first and then ask the next unresolved question.
- Challenge ambiguous/conflicting terms against existing `CONTEXT.md` language.
- Update `CONTEXT.md` inline when terms are resolved.
- Offer ADRs only for hard-to-reverse, surprising, trade-off decisions.
- Create `CONTEXT.md` and `docs/adr/` lazily (only when needed).
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: resolved terms, unresolved questions, files updated, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.
