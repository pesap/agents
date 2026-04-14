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
5. Remove dead/redundant code, keep useful abstractions.
6. Run targeted validation for touched code and report it.

## Output
- What changed (concise, file-level)
- Validation run (pass/fail)
- Risks or follow-up items
