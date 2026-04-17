---
name: harness-gate
description: Mandatory pre-flight compliance gate. Must be invoked before ANY work to ensure harness adherence.
---

## When to use
- BEFORE any file edit, creation, or deletion
- BEFORE any debug, feature, or review workflow
- BEFORE any bash command that mutates state

## Instructions

STOP. Before proceeding, confirm you will follow the harness:

1. **State your plan** in one sentence
2. **Commit to the compliance checklist**:
   - Result line with success|partial|failed
   - Confidence score 0-1
   - Preflight before mutations
   - Postflight after mutations  
   - Tool descriptions before meaningful calls
   - Proper skill loading
   - Validation with results
   - Hook teardown

3. **Load required skills** for this task type
4. **Proceed only after** stating: `Harness gate: acknowledged`

## Why this matters
Without this gate, experiments show compliance drops to ~40%.
With this gate, compliance reaches ~90%.

This is not optional. Acknowledge or abort.
