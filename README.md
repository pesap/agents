# pesap-agent

A Pi package for a single, self-learning development agent that can orchestrate parallel subagents.

## Install

```bash
pi install https://github.com/pesap/agents
```

## Try without installing

```bash
pi -e https://github.com/pesap/agents
```

## Included commands

- `/start-agent` - initialize pesap-agent context injection in the current session
- `/end-agent` - stop pesap-agent context injection in the current session
- `/debug <problem> [--parallel N] [--fix]`
- `/feature <request> [--parallel N] [--ship]` (auto-initializes the agent if needed, and parallel delegation falls back to single-agent mode when pi-subagents is unavailable)
- `/learn-skill <topic> [--from-file path] [--from-url url] [--dry-run]`
- `/review [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>] [--extra "focus"]` (adapted from `https://github.com/earendil-works/pi-review`)
- `/simplify [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>] [--extra "focus"]` (code simplification workflow, behavior-preserving)
- `/reaview ...` - alias for `/review`

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
- `agent/` - gitagent-style single agent definition
- `commands/` - workflow prompt templates
- `themes/` - optional themes (empty by default)

## Design goals

1. Keep one canonical agent identity.
2. Learn from user feedback and subagent outcomes.
3. Stay concise and token-efficient by default.
4. Enable safe self-improvement with explicit guardrails.
