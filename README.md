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
- `/remove-slop [scope] [--parallel N]` (parallel code-quality cleanup workflow with mandatory safety/NASA guardrails and language-aware skill selection)
- `/domain-model <plan_or_topic>` (domain-model grilling workflow that aligns terminology with code and updates CONTEXT/ADR docs lazily)
- `/to-prd [context]` (synthesize current context into PRD markdown and file as GitHub issue when possible)
- `/to-issues [plan_or_issue]` (break a plan/PRD into dependency-aware vertical-slice GitHub issues)
- `/triage-issue <problem_statement>` (investigate root cause and file a TDD fix-plan issue)
- `/tdd <goal> [--lang auto|python|rust|c]` (strict red-green-refactor workflow using core + language adapter skills)
- `/address-open-issues [--limit N] [--repo owner/repo]` (process your open issues through triage, TDD, review, simplify, re-review, and remediation loops)

## Workflow tree map

```text
pesap command system
├─ /commands (registered)
│  ├─ control (no skillflow prompt)
│  │  ├─ /start-agent
│  │  ├─ /end-agent
│  │  ├─ /approve-risk
│  │  ├─ /preflight
│  │  └─ /postflight
│  └─ workflow commands
│     ├─ /debug
│     │  ├─ prompt: commands/debug-workflow.md
│     │  ├─ flow:   agent/skillflows/debug-workflow.yaml
│     │  └─ skills: [debug-investigation]
│     ├─ /feature
│     │  ├─ prompt: commands/feature-workflow.md
│     │  ├─ flow:   agent/skillflows/feature-workflow.yaml
│     │  └─ skills: [feature-delivery]
│     ├─ /review
│     │  ├─ prompt: commands/review-workflow.md
│     │  ├─ flow:   agent/skillflows/review-workflow.yaml
│     │  └─ skills: [code-review]
│     ├─ /git-review
│     │  ├─ prompt: commands/git-review-workflow.md
│     │  ├─ flow:   agent/skillflows/git-review-workflow.yaml
│     │  └─ skills: [github]
│     ├─ /simplify
│     │  ├─ prompt: commands/simplify-workflow.md
│     │  ├─ flow:   agent/skillflows/simplify-workflow.yaml
│     │  └─ skills: [simplify]
│     ├─ /remove-slop
│     │  ├─ prompt: commands/remove-slop-workflow.md
│     │  ├─ flow:   agent/skillflows/remove-slop-workflow.yaml
│     │  └─ skills: [simplify, comment-quality-gate, dead-code-proof, dependency-untangler, type-hardening, nasa-guidelines]
│     ├─ /domain-model
│     │  ├─ prompt: commands/domain-model-workflow.md
│     │  ├─ flow:   agent/skillflows/domain-model-workflow.yaml
│     │  └─ skills: [domain-model]
│     ├─ /to-prd
│     │  ├─ prompt: commands/to-prd-workflow.md
│     │  ├─ flow:   agent/skillflows/to-prd-workflow.yaml
│     │  └─ skills: [to-prd]
│     ├─ /to-issues
│     │  ├─ prompt: commands/to-issues-workflow.md
│     │  ├─ flow:   agent/skillflows/to-issues-workflow.yaml
│     │  └─ skills: [to-issues]
│     ├─ /triage-issue
│     │  ├─ prompt: commands/triage-issue-workflow.md
│     │  ├─ flow:   agent/skillflows/triage-issue-workflow.yaml
│     │  └─ skills: [triage-issue]
│     ├─ /tdd
│     │  ├─ prompt: commands/tdd-workflow.md
│     │  ├─ flow:   agent/skillflows/tdd-workflow.yaml
│     │  └─ skills: [tdd-core, testing-pytest]
│     ├─ /address-open-issues
│     │  ├─ prompt: commands/address-open-issues-workflow.md
│     │  ├─ flow:   agent/skillflows/address-open-issues-workflow.yaml
│     │  └─ skills: [address-open-issues]
│     └─ /learn-skill
│        ├─ prompt: commands/learn-skill-workflow.md
│        ├─ flow:   agent/skillflows/learn-skill-workflow.yaml
│        └─ skills: [skill-creator]
```

### Run workflow commands outside the REPL

These commands also work in non-interactive runs (print mode or RPC), not only in the TUI REPL.

```bash
pi -e https://github.com/pesap/agents -p "/review README.md --extra 'focus on correctness'"
pi -e https://github.com/pesap/agents -p "/review folder src docs"
pi -e https://github.com/pesap/agents -p "/simplify src/commands/review.ts"
pi -e https://github.com/pesap/agents -p "/remove-slop src --parallel 8"
pi -e https://github.com/pesap/agents -p "/domain-model 'Split billing and ordering contexts with async events'"
pi -e https://github.com/pesap/agents -p "/to-prd 'Add audit trail for policy gate actions'"
pi -e https://github.com/pesap/agents -p "/to-issues 'Implement audit trail from PRD #123'"
pi -e https://github.com/pesap/agents -p "/triage-issue 'Intermittent timeout when loading policy config'"
pi -e https://github.com/pesap/agents -p "/tdd 'Add retry policy for hook loading' --lang rust"
pi -e https://github.com/pesap/agents -p "/address-open-issues --limit 10"
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
