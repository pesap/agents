# khala

Khala is a Pi package that adds:

- a guarded coding agent runtime,
- workflow commands (`/debug`, `/simplify`, `/tdd`, etc.),
- session policy controls (`/khala`, `/approve-risk`, preflight/postflight),
- optional Graphify-based project/global memory setup.

## Quick start

Install:

```bash
pi install https://github.com/pesap/agents
pi
```

Inside Pi:

```text
/khala
```

Or run once without install:

```bash
pi -e https://github.com/pesap/agents -p "/khala"
```

## How to use

### 1) Agent control

- `/khala [status|strict|enforce|warn|monitor|reset]`
- `/end-agent`
- `/approve-risk <reason> [--ttl MINUTES]`
- `/preflight Preflight: skill=<name|none> reason="<short>" clarify=<yes|no>`
- `/postflight Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`

### 2) Workflows

- `/debug <problem> [--fix]`
- `/review [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`
- `/git-review`
- `/simplify [scope] [--extra "focus"]`
- `/plan <plan_or_topic>`
- `/ship`
- `/triage-issue <github_issue_or_problem_statement>`
- `/tdd <goal> [--lang auto|python|rust|c]`
- `/address-open-issues [--limit N] [--repo owner/repo]`
- `/learn-skill <topic> [--from <path|url>] [--from-file path] [--from-url url] [--dry-run]`
- `/khala-memory-setup [project|global]` (uv-only Graphify setup)
- `/khala-memory-restart [project|global]`
- `/khala-memory-remove [project|global]`

## Planning

Use `/plan <topic>` as the single planning entrypoint.

`/plan` is for focused design decisions, feature direction, terminology alignment, edge cases, and vertical-slice issue planning. It stays lightweight by default: it updates `CONTEXT.md` and ADRs only when those artifacts are useful.

For implementation, use the focused delivery workflows after planning: `/tdd`, `/feature`, `/debug`, `/review`, `/simplify`, or `/ship`.

## What changes when enabled

When khala is enabled (`/khala` or any workflow command):

- `bash` calls are policy-checked,
- risky/destructive commands may be blocked unless approved,
- Python package/runtime commands are steered to `uv`,
- mutation workflows are checked for preflight/postflight and response footer compliance.

## Where to find things

### User-facing workflow prompts

- `commands/`

### Workflow specs

- `workflows/`

### Runtime and policy config

- `runtime/profile.yaml`
- `runtime/compliance/`
- `runtime/hooks/`

### Extension implementation

- `extensions/index.ts`
- `extensions/commands/`
- `extensions/workflows/`

### Skills

- `skills/`

## Memory setup (Graphify)

Use:

```text
/khala-memory-setup [project|global]
```

Setup command runs:

- `uv tool install graphifyy`
- `graphify install --platform pi`
- `graphify pi install` (tries scope flag first, then fallback)

Restart command runs:

- `graphify pi install` (Graphify has no restart subcommand; reinstalling refreshes the Pi skill)

Remove command runs:

- `graphify pi uninstall` (tries scope flag first, then fallback)
- `uv tool uninstall graphifyy`

## Compliance modes

Session command:

```text
/khala enforce
```

Back to warnings:

```text
/khala warn
```

Reset to configured defaults:

```text
/khala reset
```

Persistent defaults are in:

- `runtime/compliance/first-principles-gate.yaml`

## Notes

- This package auto-loads bundled dependencies (`pi-subagents`, `@ff-labs/pi-fff`, `pi-thinking-steps`, `pi-lens`).
- It uses Pi package manifests and does not edit `~/.pi/agent/settings.json` at runtime.
