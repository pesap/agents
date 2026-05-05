# khala

Khala is a Pi package for a guarded, self-learning coding-agent runtime. It adds:

- workflow commands for debugging, review, simplification, planning, TDD, issue triage, shipping, and skill creation,
- session policy controls for risky commands, preflight/postflight checks, and response compliance,
- bundled Pi extensions (`pi-subagents`, `@ff-labs/pi-fff`, `pi-thinking-steps`, `pi-lens`),
- optional Graphify installation/refresh helpers and a `/graphify` request shim.

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

## Commands

### Agent and policy control

- `/khala` initializes khala and sets compliance mode to `warn` for the session.
- `/khala status|strict|enforce|warn|monitor|reset` reports or changes compliance mode.
- `/end-agent` disables khala session context injection.
- `/approve-risk <reason> [--ttl MINUTES]` approves one high-risk command. TTL defaults to 20 minutes and is capped to 1–120 minutes.
- `/preflight Preflight: skill=<name|none> reason="<short>" clarify=<yes|no>` records manual mutation intent.
- `/postflight Postflight: verify="<command_or_check>" result=<pass|fail|not-run>` records verification evidence.

### Workflow commands

These are registered and enabled by default unless `runtime/profile.yaml` disables them or their prompt/spec files fail validation.

- `/debug <problem> [--fix]`
- `/review [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`
- `/git-review`
- `/simplify [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`
- `/plan <plan_or_topic>`
- `/ship`
- `/triage-issue <github_issue_or_problem_statement>`
- `/tdd <goal> [--lang <hint>]` where examples include `auto`, `python`, `rust`, and `c`.
- `/address-open-issues [--limit N] [--repo owner/repo]`
- `/learn-skill <topic> [--from <path|url>] [--from-file path] [--from-url url] [--dry-run]`

`feature` and `remove-slop` workflow files exist in this repo, but their commands are currently disabled/not registered for normal use.

### Graphify commands

- `/khala-memory-setup [project|global]` installs Graphify with `uv` and asks Graphify to install its Pi integration.
- `/khala-memory-restart [project|global]` refreshes Graphify's Pi integration.
- `/khala-memory-remove [project|global]` best-effort removes Graphify's Pi integration, then uninstalls the `graphifyy` uv tool.
- `/graphify [args]` queues an assistant request to use the installed Graphify skill/CLI. No args defaults to `/graphify .`.

`/graphify` is a thin shim, not a tracked khala workflow. It sends a user message back into Pi with instructions:

- build/update/wiki requests such as `/graphify .`, `/graphify ./docs --update`, or `/graphify . --wiki` should follow Graphify's installed skill workflow,
- query/path/explain/add/hook/merge-graphs requests should prefer the `graphify` CLI and summarize the output,
- if Graphify is missing, run `/khala-memory-setup project` first.

## Planning

Use `/plan <topic>` as the planning entrypoint for focused design decisions, feature direction, terminology alignment, edge cases, and vertical-slice issue planning. It stays lightweight by default and updates `CONTEXT.md`/ADRs only when useful.

After planning, use the focused delivery workflows: `/tdd`, `/debug`, `/review`, `/simplify`, `/triage-issue`, or `/ship`.

## Runtime behavior

When khala is enabled (`/khala` or a khala workflow command):

- `bash` calls are policy-checked,
- risky/destructive commands may be blocked unless approved,
- direct Python package/runtime commands are steered to `uv`,
- workflow commands create auto-preflight records,
- mutation workflows are checked for postflight evidence,
- final workflow responses are checked for `Result: success|partial|failed` and `Confidence: <0..1>` when response compliance is enabled.

Blocked/steered command families include `pip`, `pip3`, `poetry`, `python -m pip`, `python -m venv`, `python -m py_compile`, and path-qualified Python executables. Intercepted `python`/`python3` route through `uv run`.

## Configuration and package layout

### Runtime config

- `runtime/profile.yaml` controls workflow enablement, prompt/spec names, low-confidence threshold, and first-principles defaults before gate config overrides.
- `runtime/compliance/first-principles-gate.yaml` contains persistent compliance gate defaults.
- `runtime/hooks/hooks.yaml` configures lifecycle hooks. Hook markdown paths are constrained to `runtime/hooks/`.
- `runtime/hooks/bootstrap.md` and `runtime/hooks/teardown.md` are the default session start/end hook docs.

### Workflow prompts and specs

- `commands/` contains user-facing workflow prompts.
- `workflows/` contains workflow specs loaded into queued workflow messages.

Workflow prompt frontmatter can list `skills:`. By default, khala injects a skill **manifest** only: skill name, description, and `skills/<name>/SKILL.md` path. Full skill bodies are injected only when a prompt/spec sets `skillContext: full`; `skillContext: none` disables skill context. Missing required skills stop the workflow before it is queued.

### Skills and learned skills

Package-registered skills come from `package.json` Pi config:

- `./skills`
- `./node_modules/pi-subagents/skills`
- `./node_modules/pi-lens/skills`

`/learn-skill` writes learning artifacts to the khala learning store, not to package `skills/`, and does not automatically add them to package manifests or workflow skill frontmatter.

### Extension implementation

- `extensions/index.ts` registers the package extension, bundled sub-extensions, policy interception, and commands.
- `extensions/commands/` contains command registration and command handlers.
- `extensions/workflows/` contains workflow queueing/tracking helpers.

## Graphify setup details

Setup command runs:

```bash
uv tool install graphifyy
graphify install --platform pi
graphify pi install --project|--global  # falls back to graphify pi install
graphify --help
```

Restart command runs:

```bash
graphify pi install --project|--global  # falls back to graphify pi install
```

Remove command runs:

```bash
graphify pi uninstall --project|--global  # best effort, falls back to graphify pi uninstall
uv tool uninstall graphifyy
```

Graphify itself is not a dependency of this package and khala no longer bundles a `graphify` skill, so Graphify's own installed skill remains authoritative and avoids skill-name collisions.

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

## Known documentation gaps / repo notes

- `package.json` declares `./themes` in the Pi manifest, but this repo currently has no `themes/` directory.
- `feature` and `remove-slop` workflow assets are present but not available as normal registered/enabled commands.
- `/graphify` is intentionally a request shim. Direct CLI execution for `query`, `path`, `explain`, and related commands may be added later.

## Notes

- This package auto-loads bundled dependencies (`pi-subagents`, `pi-subagents/notify`, `@ff-labs/pi-fff`, `pi-thinking-steps`, `pi-lens`) with warning-only failure handling.
- It uses Pi package manifests and does not edit `~/.pi/agent/settings.json` at runtime.
