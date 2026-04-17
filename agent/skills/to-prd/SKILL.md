---
name: to-prd
description: Turn current conversation/context into a product requirements document (PRD) and file it as a GitHub issue. Use when users ask to draft a PRD, formalize a feature spec, or capture implementation/testing decisions before coding.
---

## Source
- Adapted from: https://github.com/mattpocock/skills/tree/main/to-prd

## Use when
- User asks to create a PRD from current discussion.
- User wants a structured feature spec before implementation.
- User wants PRD captured as a GitHub issue.

## Avoid when
- User explicitly wants direct implementation without spec work.
- Scope is tiny and a PRD would add unnecessary process.

## Workflow
1. Synthesize current context and repo state (no long interview).
2. Identify candidate modules/interfaces and testing scope.
3. Confirm key assumptions briefly with user when ambiguous.
4. Draft PRD with problem, solution, implementation decisions, testing decisions, and out-of-scope (add user stories only if explicitly requested).
5. Create GitHub issue with `gh issue create` (or output PRD markdown if issue creation is unavailable).

## Output
- PRD markdown (final text)
- Issue URL/number (or reason issue was not created)
- Key assumptions and open questions
- Suggested next command (`/to-issues`)
