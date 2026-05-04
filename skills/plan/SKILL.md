---
name: plan
description: Run a rigorous planning session that challenges plans against existing terminology, code reality, and documented decisions. Use when users want to stress-test a design, sharpen domain language, and update CONTEXT.md/ADRs as decisions become clear.
---

## Source
- Adapted from: https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs

## Use when
- User wants to validate a plan against domain language and boundaries.
- User asks for domain modeling, terminology alignment, or context mapping.
- User wants architecture decisions captured as lightweight ADRs.

## Avoid when
- Task is pure implementation with no domain/terminology design.
- User explicitly wants quick coding without discovery questions.

## Session mode
- Ask one question at a time.
- Wait for user feedback before the next question.
- If a question can be answered from code/docs, inspect first.

## Domain awareness
- Look for `CONTEXT-MAP.md` first (multi-context repos).
- Else look for root `CONTEXT.md` (single context).
- Create files lazily:
  - create `CONTEXT.md` when first term is resolved
  - create `docs/adr/` when first ADR is needed

## During the session
1. Challenge conflicting terminology against `CONTEXT.md`.
2. Replace fuzzy/overloaded terms with precise canonical terms.
3. Use concrete scenarios to test boundaries and edge cases.
4. Cross-check user claims against the codebase and surface contradictions.
5. Update `CONTEXT.md` inline as terms are resolved (do not batch).
6. Offer ADRs only when all are true:
   - hard to reverse
   - surprising without context
   - result of a real trade-off

Use formats:
- [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md)
- [ADR-FORMAT.md](./ADR-FORMAT.md)

## Output
- Ordered question log and recommended answers
- Updated language terms and ambiguity resolutions
- Code/documentation contradictions found
- Files created/updated (`CONTEXT.md`, `CONTEXT-MAP.md`, `docs/adr/*`)
- Decisions captured vs deferred
