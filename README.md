# khala

Single self-learning Pi dev agent package with runtime guardrails.

## Start context injection (current session)

If you only need one thing: **`/khala` works only after this package is loaded in the session**.

### Requirements

1. Start Pi with `khala` loaded (installed package **or** `-e` one-off extension).
2. Run `/khala` (enables khala and defaults compliance to `warn`; any workflow command also auto-starts it).

### Copy/paste snippets

Installed package flow:

```bash
pi install https://github.com/pesap/agents
pi
# then inside Pi:
/khala 
```

One-off (no install):

```bash
pi -e https://github.com/pesap/agents
# then inside Pi:
/khala
```

Non-interactive one-liner:

```bash
pi -e https://github.com/pesap/agents -p "/khala"
```

### How to confirm it started

- You get: `khala initialized.` plus a compliance mode message (default: `warn`)
- Session status shows: `🔷 khala enabled`

### How to stop it

```text
/end-agent
```

Also stops automatically on session shutdown.

---

## Install

```bash
pi install https://github.com/pesap/agents
```

`khala` uses Pi package resource loading (`pi` manifest in `package.json`) and does **not** mutate `~/.pi/agent/settings.json` at runtime.

Bundled + auto-loaded extension dependencies:

- `pi-subagents` (https://github.com/nicobailon/pi-subagents)
- `@ff-labs/pi-fff` (`pi install npm:@ff-labs/pi-fff`)

You do **not** need to install these separately when using this package.
If `pi-subagents` is already installed elsewhere, khala reuses it and skips its bundled copy to avoid extension conflicts.

## Try without installing

```bash
pi -e https://github.com/pesap/agents
```

## Commands

### Control commands (manual session control)

- `/khala [status|strict|enforce|warn|monitor|reset]` - enable khala context injection and set first-principles compliance strictness (`/khala` with no args sets `warn`)
- `/end-agent` - disable khala context injection for this session
- `/approve-risk <reason> [--ttl MINUTES]` - checker approval for one high-risk shell action
- `/preflight Preflight: skill=<name|none> reason="<short>" clarify=<yes|no>` - mutation intent record (required when preflight mode is `enforce`)
- `/postflight Postflight: verify="<command_or_check>" result=<pass|fail|not-run>` - verification evidence record

### Workflow commands (auto-enable agent if needed)

- `/debug <problem> [--fix]`
- `/review [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`
- `/git-review`
- `/simplify [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`
- `/plan <plan_or_topic>`
- `/to-prd [context]`
- `/to-issues [plan_or_issue]`
- `/triage-issue <github_issue_or_problem_statement>`
- `/tdd <goal> [--lang auto|python|rust|c]` (default feature-delivery path)
- `/address-open-issues [--limit N] [--repo owner/repo]`
- `/learn-skill <topic> [--from <path|url>] [--from-file path] [--from-url url] [--dry-run]`
- `/gsd <workflow> [instruction]`

### Recommended bug-fix entrypoints

- **Local error found while coding:** use `/debug <problem> [--fix]`
- **Bug reported on GitHub:** use `/triage-issue <github_issue_or_problem_statement>` (root cause + TDD + PR)

### Upstream attribution (GSD import)

We imported workflow/agent material from:

- https://github.com/gsd-build/get-shit-done

Specifically adapted into this repo:

- `skills/gsd-*` (agent prompts translated to Pi skills)
- `docs/gsd-workflows/*` (workflow specs + templates/contexts/references)
- `/gsd` command glue (`commands/gsd-workflow.md`, `workflows/gsd-workflow.yaml`)

## Run workflow commands outside the REPL

These commands also work in print mode / RPC (not only in TUI REPL).

```bash
pi -e https://github.com/pesap/agents -p "/review README.md --extra 'focus on correctness'"
pi -e https://github.com/pesap/agents -p "/simplify src/commands/review.ts"
pi -e https://github.com/pesap/agents -p "/remove-slop src"
pi -e https://github.com/pesap/agents -p "/tdd 'Add retry policy for hook loading' --lang rust"
```

## What changes when agent is enabled

When enabled (`/khala` or any workflow command), khala wraps `bash` and applies policy/interception:

- Blocks `pip`, `pip3`, `poetry` and guides to `uv`
- Routes `python` / `python3` command-name invocations through `uv run`
- Blocks `python -m pip|venv|py_compile`
- Blocks path-qualified Python binaries (e.g. `/usr/bin/python3`, `.venv/bin/python`) to prevent bypass
- Blocks high-risk destructive/sensitive shell commands unless approved via `/approve-risk`
- Runs first-principles mutation gates on `edit`, `write`, and mutation-capable `bash` calls (defaults in `runtime/profile.yaml`, optional overrides in `runtime/compliance/first-principles-gate.yaml`)

## Self-learning storage

Durable artifacts are written to:

- Preferred (project-local): `<repo>/.pi/khala/` (when `.pi/` exists in cwd)
- Fallback (global): `~/.pi/khala/`

Stored files:

- `memory/learning.jsonl` - structured observations per workflow run
- `memory/MEMORY.md` - concise chronological learnings
- `memory/promotion-queue.md` - promotion/improvement hints from repeated outcomes
- `runs/*.json` - per-run workflow records
- `skills/<name>/SKILL.md` - skills created by `/learn-skill`

## How learning actually works

Learning is **event-based memory**, not model fine-tuning.

1. A workflow command starts (`/debug`, `/feature`, `/review`, etc.).
2. The extension opens a tracked run (`runs/<id>.json`) and records an observation on completion.
3. On completion, it appends:
   - one JSON line to `memory/learning.jsonl`
   - one summary line to `memory/MEMORY.md`
4. If enough recent runs of the same workflow exist, it may append a hint to `memory/promotion-queue.md`.

### What is enforced vs not enforced

Enforced (configurable warn/enforce modes):

- preflight before mutation tools (`edit`, `write`, mutating `bash`)
- postflight evidence after mutation
- workflow response footer lines: `Result: ...` and `Confidence: 0..1`

Not enforced / not automatic:

- No automatic edits to `README.md`, `INSTRUCTIONS.md`, or skills from learning.
- No automatic model training/fine-tuning.
- No learning record is created for normal chat unless a tracked workflow command is running.

### How learning is injected back into the session

When agent mode is enabled, the extension injects into bootstrap context:

- the latest tail of `memory/MEMORY.md` (recent learned outcomes)
- names of learned skills in the learning store

This affects prompt context for subsequent turns, but does not rewrite files automatically.

## Package layout

- `extensions/index.ts` - command/workflow orchestration + `bash` interception while enabled
- `runtime/` - single-agent runtime definition
- `commands/` - workflow prompt templates
- `intercepted-commands/` - shims for pip/pip3/poetry/python/python3 during active sessions
- `themes/` - optional themes (empty by default)

## Compliance baseline

- `runtime/DUTIES.md` - maker/checker separation and escalation boundaries
- `runtime/compliance/` - risk profile, capability controls, review cadence
- `runtime/profile.yaml` - strict runtime profile + first-principles defaults
- `runtime/hooks/` - lifecycle hook policy (`on_session_start`, `pre_risky_action`, `on_session_end`)
- `runtime/memory/runtime/live/` - `dailylog.md`, `key-decisions.md`, `context.md`
- `runtime/tools/search.yaml` + `runtime/tools/capability/search.yaml` - tool schema/capability mapping

If `runtime/hooks/hooks.yaml` or runtime profile artifacts are missing/malformed, warnings are surfaced at session start and safe defaults are applied.

## Enforce compliance (block/fail), not just warnings

Fast path (session-scoped, no file edits):

```text
/khala enforce
```

Back to warning mode:

```text
/khala warn
```

Reset back to configured defaults:

```text
/khala reset
```

You can also inspect current modes anytime:

```text
/khala status
```

Persistent path (repo/package config):

- edit `runtime/compliance/first-principles-gate.yaml` (overrides profile defaults)

```yaml
preflight_mode: enforce
postflight_mode: enforce
response_compliance: enforce
```

Then start a new session (or restart Pi) and enable the agent.

Expected strict behavior:

- Missing preflight before first mutation (`edit`/`write`/mutating `bash`) -> mutation is **blocked** with remediation text.
- Missing postflight evidence after mutation -> workflow is marked **failed** (strict violation) at completion.
- Missing final `Result:` / `Confidence:` lines in workflow output -> response is **blocked** until fixed.

Tip: `/khala` with no args sets `warn` for this session. Use `/khala enforce` when you want strict mode; the gate file still has precedence when present.

## Design goals

1. One canonical agent identity
2. Learn from user feedback + workflow outcomes
3. Stay concise/token-efficient by default
4. Enable safe self-improvement with explicit guardrails
