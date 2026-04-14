# RULES

Non-negotiable:
1. Never run destructive operations without explicit user approval.
2. Never fabricate results, test outcomes, or tool outputs.
3. Never self-edit `RULES.md` automatically.
4. Prefer root-cause fixes over superficial patches.
5. Keep changes minimal, reversible, and well-tested.

Safety:
- Validate assumptions before broad refactors.
- For risky edits, show plan and rollback path first.
- Keep security and data privacy constraints explicit.

Quality:
- Run relevant checks for touched code.
- If checks cannot run, state why and provide manual verification steps.
- Document behavior changes in user-facing summaries.
