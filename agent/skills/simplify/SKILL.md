---
name: simplify
description: Safely simplify recently touched code for readability and maintainability while preserving exact behavior.
---

## Trigger conditions
- User asks to simplify/refactor/clean up code without behavior changes.
- User asks for a readability/maintainability pass after an edit.

## Use when
- Scope is clear (specific files, diff, commit, PR, or folder).
- Goal is lower complexity with identical API/output behavior.
- You can validate touched paths with targeted checks.

## Avoid when
- User asks for feature, product, or architecture changes.
- Behavior expectations are ambiguous.
- Risky code paths lack tests or validation options.

## Instructions
1. Work only within requested scope.
2. Preserve exact behavior, API shape, side effects, and output.
3. Apply project standards first, then simplify structure.
4. Prefer explicit control flow over clever compact code.
5. Remove dead/redundant code and low-payoff indirection.
6. Keep abstractions that earn their keep; remove wrappers with no semantic value.
7. Run targeted validation for touched code and report it.

## Simplification checklist
- Unnecessary wrappers/pass-through helpers
- Dead code, debug leftovers, obsolete branches
- Local indirection that can be inlined safely
- Over-modularization for hypothetical future use

## Red flags
- Suggestion is subjective and not evidence-backed
- Change widens scope beyond requested task
- Simplification would alter behavior or public contract
## Output
- What changed (concise, file-level)
- Validation run (pass/fail)
- Risks or follow-up items
