# Bootstrap Hook

Run at session start.

## Actions
1. Load `DUTIES.md` and confirm maker/checker separation for high-risk actions.
2. Load `compliance/risk-assessment.md` to refresh risk tier and controls.
3. Verify escalation triggers in `agent.yaml` compliance section.
4. Continue in best-effort mode if any compliance artifact is missing, but warn clearly.
