# pesap-agent

A Pi package for a single, self-learning development agent that can orchestrate parallel subagents.

## Install

```bash
pi install https://github.com/pesap/agents
```

On session start, pesap-agent ensures `~/.pi/agent/settings.json` contains this package's `agent/skills` path so other extensions/agents can resolve the same skill set.

## Try without installing

```bash
pi -e https://github.com/pesap/agents
```

## Included commands

- `/start-agent` - initialize pesap-agent context injection in the current session
- `/end-agent` - stop pesap-agent context injection in the current session
- `/approve-risk <reason> [--ttl MINUTES]` - record temporary checker approval required for one high-risk shell action
- `/preflight Preflight: skill=<name|none> reason="<short>" clarify=<yes|no>` - record explicit mutation intent (required when preflight mode is `enforce`)
- `/postflight Postflight: verify="<command_or_check>" result=<pass|fail|not-run>` - record verification evidence after mutation
- `/debug <problem> [--parallel N] [--fix]` (auto-initializes the agent if needed, and parallel delegation falls back to single-agent mode when pi-subagents is unavailable)
- `/feature <request> [--parallel N] [--ship]` (auto-initializes the agent if needed, and parallel delegation falls back to single-agent mode when pi-subagents is unavailable)
- `/learn-skill <topic> [--from <path|url>] [--from-file path] [--from-url url] [--dry-run]`
- `/review [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]` (adapted from `https://github.com/earendil-works/pi-review`)
- `/git-review` - run git-history diagnostics before reading code (churn, authorship, bug clusters, velocity, firefighting)
- `/simplify [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]` (code simplification workflow, behavior-preserving)
- `/reaview ...` - alias for `/review`

### Run review/simplify outside the REPL

These commands also work in non-interactive runs (print mode or RPC), not only in the TUI REPL.

```bash
pi -e https://github.com/pesap/agents -p "/review README.md --extra 'focus on correctness'"
pi -e https://github.com/pesap/agents -p "/review folder src docs"
pi -e https://github.com/pesap/agents -p "/simplify src/commands/review.ts"
```
## Intercepted shell commands (active agent only)

When pesap-agent is enabled (`/start-agent`, or auto-enabled by workflow commands), the extension wraps the `bash` tool and intercepts Python packaging commands inspired by https://github.com/mitsuhiko/agent-stuff:

- `pip`, `pip3`, `poetry` → blocked with `uv` replacement guidance
- `python`, `python3` → routed through `uv run` wrappers when invoked by command name
- `python -m pip|venv|py_compile` → blocked with actionable alternatives
- path-qualified Python executables (e.g. `/usr/bin/python3`, `.venv/bin/python`) → blocked to prevent interception bypass
- high-risk destructive or sensitive shell commands (e.g. `rm -rf`, `git reset --hard`, force-push, obvious secret reads) → blocked unless checker approval is recorded via `/approve-risk`
- first-principles mutation gate checks `edit`, `write`, and mutation-capable `bash` calls for preflight intent and postflight evidence (mode controlled by `agent/compliance/first-principles-gate.yaml`)

Run `/end-agent` to disable this interception for the current session.
Teardown lifecycle hooks run on both `/end-agent` and `session_shutdown`.
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
- `agent/compliance/` - risk profile, capability controls, and review cadence (`first-principles-gate.yaml` included)
- `agent/hooks/` - lifecycle hook policy that is loaded and enforced at runtime (`on_session_start`, `pre_risky_action`, `on_session_end`)
- `agent/memory/runtime/live/` - `dailylog.md`, `key-decisions.md`, `context.md`
- `agent/tools/search.yaml` + `agent/tools/capability/search.yaml` - tool schema and capability mapping
- Hook warnings are surfaced at session start if `agent/hooks/hooks.yaml` is missing or malformed; defaults are applied for safety.

## Design goals

1. Keep one canonical agent identity.
2. Learn from user feedback and subagent outcomes.
3. Stay concise and token-efficient by default.
4. Enable safe self-improvement with explicit guardrails.
