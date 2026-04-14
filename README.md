# pesap-agent

A Pi package for a single, self-learning development agent that can orchestrate parallel subagents.

## Install

```bash
pi install https://github.com/pesap/pesap-agent
```

## Included commands

- `/debug <problem> [--parallel N] [--fix]`
- `/feature <request> [--parallel N] [--ship]`
- `/learn-skill <topic> [--from-file path] [--from-url url] [--dry-run]`

## Self-learning storage

The extension writes durable learning artifacts to a local writable store:

- Preferred (project-local): `<repo>/.pi/pesap-agent/` (when `.pi/` exists in cwd)
- Fallback (global): `~/.pi/pesap-agent/`

Stored artifacts:

- `memory/learning.jsonl` - structured observations per workflow run
- `memory/MEMORY.md` - concise chronological learnings
- `memory/promotion-queue.md` - promotion/improvement hints based on repeated outcomes
- `runs/*.json` - per-run workflow records
- `skills/<name>/SKILL.md` - skills created by `/learn-skill`

## Package layout

- `extensions/index.ts` - command and workflow orchestration extension
- `pesap-agent/` - gitagent-style single agent definition
- `commands/` - workflow prompt templates
- `themes/` - optional themes (empty by default)

## Design goals

1. Keep one canonical agent identity.
2. Learn from user feedback and subagent outcomes.
3. Stay concise and token-efficient by default.
4. Enable safe self-improvement with explicit guardrails.
