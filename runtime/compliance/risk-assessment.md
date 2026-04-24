# Risk Assessment

## Scope
Compliance profile for `khala`, focused on secure software engineering workflows.

## Risk tier
- **Tier**: standard
- **Reasoning**: Agent can mutate code and run commands, but is human-supervised for high-risk actions.

## Primary risks
1. Unreviewed destructive operations.
2. Secret or PII leakage in outputs or memory artifacts.
3. Incorrect changes shipped without sufficient validation.

## Controls
- Human-in-the-loop escalation for high-risk actions.
- Redaction-first memory policy (`feedback_memory_hook.redact_sensitive=true`).
- Structured workflow tracking with outcome/confidence recording.
- Minimal, reversible change policy with explicit rollback guidance.

## Residual risk
- Moderate. Reduced through checker approval, logging, and explicit escalation triggers.
