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
- `/debug <problem> [--parallel N] [--fix]` (auto-initializes the agent if needed, and parallel delegation falls back to single-agent mode when pi-subagents is unavailable)
- `/feature <request> [--parallel N] [--ship]` (auto-initializes the agent if needed, and parallel delegation falls back to single-agent mode when pi-subagents is unavailable)
- `/learn-skill <topic> [--from-file path] [--from-url url] [--dry-run]`
- `/review [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>] [--extra "focus"]` (adapted from `https://github.com/earendil-works/pi-review`)
- `/simplify [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>] [--extra "focus"]` (code simplification workflow, behavior-preserving)
- `/reaview ...` - alias for `/review`

## Intercepted shell commands (active agent only)

When pesap-agent is enabled (`/start-agent`, or auto-enabled by workflow commands), the extension wraps the `bash` tool and intercepts Python packaging commands inspired by https://github.com/mitsuhiko/agent-stuff:

- `pip`, `pip3`, `poetry` → blocked with `uv` replacement guidance
- `python`, `python3` → routed through `uv run` wrappers
- `python -m pip|venv|py_compile` → blocked with actionable alternatives

Run `/end-agent` to disable this interception for the current session.
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

- `extensions/index.ts` - command/workflow orchestration and bash interception while agent mode is enabled
- `agent/` - gitagent-style single agent definition
- `commands/` - workflow prompt templates
- `intercepted-commands/` - command shims for pip/pip3/poetry/python/python3 during active agent sessions
- `themes/` - optional themes (empty by default)

## Compliance baseline

- `agent/DUTIES.md` - maker/checker separation and escalation boundaries
- `agent/compliance/` - risk profile, capability controls, and review cadence
- `agent/hooks/` - bootstrap/teardown compliance hook stubs
- `agent/memory/runtime/live/` - `dailylog.md`, `key-decisions.md`, `context.md`
- `agent/tools/search.yaml` + `agent/tools/capability/search.yaml` - tool schema and capability mapping

## Design goals

1. Keep one canonical agent identity.
2. Learn from user feedback and subagent outcomes.
3. Stay concise and token-efficient by default.
4. Enable safe self-improvement with explicit guardrails.
