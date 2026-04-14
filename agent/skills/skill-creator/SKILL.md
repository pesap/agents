---
name: skill-creator
description: Create or improve reusable skills. Use when users want a new skill, stronger trigger behavior, or iterative improvements with clear validation.
---

## Trigger conditions
- User asks to create, update, optimize, or benchmark a skill.
- User shares a workflow and asks to "turn this into a skill".
- Existing skill under-triggers, over-triggers, or produces weak results.

## Use when
- Goal and scope can be defined from user intent.
- You can capture concrete input/output expectations.
- Iteration is possible (draft, test, revise).

## Avoid when
- Request is one-off task automation, not reusable behavior.
- User asks for malicious/deceptive capability.
- Critical requirements remain ambiguous after clarification.

## Instructions
1. Capture intent first: what it does, when it should trigger, output shape, and success criteria.
2. Interview for edge cases, constraints, dependencies, and examples before drafting.
3. Draft `SKILL.md` with explicit trigger-rich description, compact safe instructions, and output contract.
4. Propose 2-3 realistic test prompts for non-trivial skills, then revise from observed failures.
5. Keep edits surgical and generalizable, avoid overfitting to one example.
6. If confidence is low, stop and ask before finalizing.

## Safety defaults
- Refuse malware, unauthorized access, exfiltration, or deceptive skill intent.
- Do not claim validation you did not run.
- Prefer minimal, reversible changes.

## Output
- Scope + trigger definition
- New/updated skill file paths
- Validation evidence (or why skipped)
- Risks/follow-ups
