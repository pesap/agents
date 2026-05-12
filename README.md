# khala

Khala is a Pi package for a guarded, self-learning coding-agent runtime. It adds:

- workflow commands for debugging, feature delivery, review, simplification, planning, TDD, issue triage, shipping, and skill creation,
- session policy controls for risky commands, preflight/postflight checks, and response compliance,
- bundled Pi extensions (`pi-subagents`, `@ff-labs/pi-fff`, `pi-thinking-steps`, `pi-lens`),
- file-backed learning from workflow outcomes and passive normal-chat corrective feedback.

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
- `/feature <request> [--ship]`
- `/review [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`
- `/git-review`
- `/simplify [uncommitted|branch <name>|commit <sha>|pr <number|url>|folder <paths...>|file <paths...>|<paths...>] [--extra "focus"]`
- `/ship [extra instruction]` - simplify current uncommitted scope, run tests/CI, push branch, and open/confirm PR/MR (creates a feature branch first when on `main`/`master`)
- `/plan <plan_or_topic>`
- `/triage-issue <problem_statement>`
- `/tdd <goal> [--lang auto|python|rust|c]`
- `/address-open-issues [--limit N] [--repo owner/repo]`
- `/learn-skill <topic> [--from <path|url>] [--from-file path] [--from-url url] [--dry-run]`

## Run workflow commands outside the REPL

```bash
pi -e https://github.com/pesap/agents -p "/review README.md --extra 'focus on correctness'"
pi -e https://github.com/pesap/agents -p "/simplify src/commands/review.ts"
pi -e https://github.com/pesap/agents -p "/ship"
pi -e https://github.com/pesap/agents -p "/tdd 'Add retry policy for hook loading' --lang rust"
```

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

Workflow prompt frontmatter can list `skills:`. By default, khala injects a skill manifest only: skill name, description, and `skills/<name>/SKILL.md` path. Full skill bodies are injected only when a prompt/spec sets `skillContext: full`; `skillContext: none` disables skill context. Missing required skills stop the workflow before it is queued.

### Skills and learned skills

Package-registered skills come from `package.json` Pi config:

- `./skills`
- `./node_modules/pi-subagents/skills`
- `./node_modules/pi-lens/skills`

Packaged skills include `librarian`, copied from `https://github.com/mitsuhiko/agent-stuff/tree/main/skills/librarian`.

`/learn-skill` writes learning artifacts to the khala learning store, not to package `skills/`, and does not automatically add them to package manifests or workflow skill frontmatter.

### Extension implementation

- `extensions/index.ts` registers the package extension, bundled sub-extensions, policy interception, and commands.
- `extensions/commands/` contains command registration and command handlers.
- `extensions/workflows/` contains workflow queueing/tracking helpers.
- `scripts/` contains lightweight guard/regression checks.

## Self-learning storage

Durable artifacts are written to:

- Preferred (project-local): `<repo>/.pi/khala/` (when `.pi/` exists in cwd)
- Fallback (global): `~/.pi/khala/`

Stored files:

- `memory/learning.jsonl` - structured observations per workflow run
- `memory/lessons.jsonl` - structured passive lessons inferred from corrective normal prompts
- `memory/MEMORY.md` - concise chronological learnings
- `memory/promotion-queue.md` - promotion/improvement hints from repeated outcomes
- `runs/*.json` - per-run workflow records
- `skills/<name>/SKILL.md` - skills created by `/learn-skill`

## How learning actually works

Learning is event-based memory, not model fine-tuning.

1. A workflow command starts (`/debug`, `/feature`, `/review`, `/ship`, etc.).
2. The extension opens a tracked run (`runs/<id>.json`) and records an observation on completion.
3. On completion, it appends:
   - one JSON line to `memory/learning.jsonl`
   - one summary line to `memory/MEMORY.md`
4. Normal prompts can also create passive lessons when they contain clear corrective feedback (for example “wrong”, “not working”, “stalling”, “implement it instead”). These are deduplicated and written to `memory/lessons.jsonl`.
5. If enough recent runs of the same workflow exist, it may append a hint to `memory/promotion-queue.md`.

### What is enforced vs not enforced

Enforced (configurable warn/enforce modes):

- preflight before mutation tools (`edit`, `write`, mutating `bash`)
- postflight evidence after mutation
- workflow response footer lines: `Result: ...` and `Confidence: 0..1`

Not enforced / not automatic:

- No automatic edits to `README.md`, `INSTRUCTIONS.md`, or skills from learning.
- No automatic model training/fine-tuning.
- Passive normal-chat learning is limited to compact corrective lessons; it does not store raw transcripts or full tool output.

### How learning is injected back into the session

When agent mode is enabled, the extension injects into bootstrap context:

- the latest tail of `memory/MEMORY.md` (recent learned outcomes)
- active operating rules from `memory/lessons.jsonl`
- names of learned skills in the learning store

This affects prompt context for subsequent turns, but does not rewrite files automatically.

## Compliance modes

Fast path (session-scoped, no file edits):

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

Expected strict behavior:

- Missing preflight before first mutation (`edit`/`write`/mutating `bash`) -> mutation is blocked with remediation text.
- Missing postflight evidence after mutation -> workflow is marked failed at completion.
- Missing final `Result:` / `Confidence:` lines in workflow output -> response is blocked until fixed.

## Design goals

1. One canonical agent identity.
2. Learn from user feedback and workflow outcomes.
3. Stay concise/token-efficient by default.
4. Prefer transparent file-backed learning (`learning.jsonl`, `lessons.jsonl`, `MEMORY.md`).
5. Enable safe self-improvement with explicit guardrails.
