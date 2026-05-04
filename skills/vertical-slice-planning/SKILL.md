---
name: vertical-slice-planning
description: Break an approved plan into thin vertical-slice implementation issues with clear dependencies and AFK/HITL tags.
---

## Use when
- Plan is complete and user wants issue creation.
- User asks to split work into executable slices.

## Rules
- Prefer thin end-to-end slices over layer-based tasks.
- Each slice should be independently testable/demoable.
- Mark each slice as AFK or HITL.
- Capture dependency edges explicitly.
- Keep titles action-oriented and specific.

## Output
- Numbered slice list
- For each slice: title, type (AFK/HITL), blocked-by, acceptance criteria
- Issue creation order
