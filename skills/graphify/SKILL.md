---
name: graphify
description: Use Graphify for project/global memory setup, restart, and practical query workflows in Pi. Use when user asks to set up memory, restart graph memory, inspect memory status, or query project knowledge.
---

## Source
- https://github.com/safishamsi/graphify

## Use when
- User asks to set up memory for current repo or globally.
- User asks to restart Graphify memory integration.
- User asks how to query/use Graphify knowledge.

## Commands (uv-first)

Setup:
```bash
uv tool install graphifyy
graphify install --platform pi
graphify pi install --project
# or
graphify pi install --global
```

Restart:
```bash
graphify pi restart --project
# or
graphify pi restart --global
```

## Pi command shortcuts in this repo
- `/khala-memory-setup [project|global]`
- `/khala-memory-restart [project|global]`
- `/khala-memory-remove [project|global]`

## Practical usage
- Build/update memory before deep planning or large refactors.
- Query memory for architecture/domain/history before proposing changes.
- Rebuild/restart when memory feels stale or after major repo changes.

## Output
- Confirm setup/restart scope (project/global)
- Show command results briefly
- Provide next suggested Graphify query/action
