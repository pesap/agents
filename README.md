# agents

A collection of gitagent-compatible agents, plus **pi-gitagent**, a [pi](https://github.com/badlogic/pi-mono) extension that lets you install, load, run, and chain agents inside a pi session.

Current repo contents: **7 bundled agents** and **1 pi extension** (`pi-gitagent`).

## Bundled agents (current set)

All bundled agents support persistent memory. Auto feedback learning is on by default.

| Agent | Best for |
|---|---|
| [plan-agent](./plan-agent) | First-principles planning, assumption audits, decomposition |
| [dev-agent](./dev-agent) | Implementation, refactors, Pydantic/infrasys coding |
| [qaqc-agent](./qaqc-agent) | Testing, regression hardening, pytest quality workflows |
| [review-agent](./review-agent) | Code + security review and review-readiness synthesis |
| [opt-agent](./opt-agent) | Runtime/solver/CI optimization |
| [doc-agent](./doc-agent) | CLI UX writing and README/documentation quality |
| [lit-agent](./lit-agent) | Literature scans and evidence synthesis |

## Install

```bash
pi install https://github.com/pesap/agents
```

That adds `/gitagent` to your pi sessions.

## Quick start

```bash
# Install every bundled agent in this repo
/gitagent install .

# Install one remote agent, then load it later by name
/gitagent install gh:pesap/agents/review-agent
/gitagent load review-agent

# Install every agent from a remote multi-agent repo
/gitagent install gh:pesap/agents
/gitagent list
/gitagent installed

# Load directly from a local path or GitHub ref
/gitagent load dev-agent
/gitagent load gh:pesap/agents/dev-agent
/gitagent load https://github.com/pesap/agents/tree/main/dev-agent

# Run one agent without replacing your current loaded agent
/gitagent run review-agent -- review this diff for risks and quality issues

# Chain agents in sequence
/gitagent chain plan-agent dev-agent qaqc-agent review-agent -- plan, implement, test, and review this change

# Create a new agent via architect
/gitagent new "a code reviewer specialized in Rust unsafe blocks"

# Remove one installed alias, or wipe the registry
/gitagent remove review-agent
/gitagent remove all
```

Loaded agents persist across restarts of the same pi session file.

## What pi-gitagent does

- Loads agents from local paths, installed aliases, GitHub shorthand, or GitHub URLs.
- Installs aliases into `~/.pi/gitagent/installed.json`.
- Shows installed aliases in `/gitagent list` by default, alongside agents in your current working directory.
- Caches remote repos under `~/.pi/gitagent/cache/github/<owner>/<repo>/<branch>/`.
- Stores remote-agent memory under `~/.pi/gitagent/memory/<agent-name>/MEMORY.md`.
- Keeps local-agent memory in the agent's own `memory/` directory.
- Rejects installs that would silently overwrite an existing installed agent name.
- Migrates legacy `~/.pitagent/{cache,memory,installed.json}` state into `~/.pi/gitagent/` on first relevant use.
- Auto-captures user feedback into memory by default. Agents can opt out with `metadata.feedback_memory_hook.enabled: false`.
- Instructs loaded agents to call `gitagent_remember` immediately for future-useful facts, and to run a memory checklist before finishing non-trivial work.

## Commands

| Command | What it does |
|---|---|
| `/gitagent install <ref>` | Install one agent, or all agents in a repo/path, into the local registry |
| `/gitagent installed` | List installed agents |
| `/gitagent remove <name\|all>` | Remove installed agents from the local registry |
| `/gitagent load <ref>` | Load an agent into the current session |
| `/gitagent run <ref> -- <task>` | Run one agent without changing the saved session agent |
| `/gitagent chain <a> <b> -- <task>` | Run multiple agents in sequence |
| `/gitagent list [ref]` | List installed aliases plus current-directory agents, or agents in a specific local directory/repo |
| `/gitagent recommend <task>` | Suggest the best bundled agent for a task |
| `/gitagent doctor [ref]` | Validate runtime, cache, memory, and model wiring |
| `/gitagent policy [ref]` | Show the active or target agent's runtime policy |
| `/gitagent info` | Show the currently loaded agent |
| `/gitagent refresh` | Re-pull the currently loaded remote ref and reload it |
| `/gitagent unload` | Remove the active agent context |
| `/gitagent new <prompt>` | Create a new agent through the architect workflow |

## LLM-callable tools

| Tool | What it does |
|---|---|
| `gitagent_install` | Install one agent, or all agents in a repo/path, into the local registry |
| `gitagent_load` | Load an agent and optionally queue a follow-up task |
| `gitagent_unload` | Remove the loaded agent context |
| `gitagent_info` | Show the currently loaded agent |
| `gitagent_list` | List installed aliases plus current-directory agents, or agents in a specific directory/repo |
| `gitagent_remember` | Save a learning to the agent's memory |

## Memory behavior

- **Persistent memory:** every loaded agent can read and write `MEMORY.md` across sessions.
- **Auto feedback learning:** on by default, off only when `metadata.feedback_memory_hook.enabled: false`.
- **Hard memory rule:** loaded agents are explicitly instructed to remember user preferences, conventions, rationale, debugging discoveries, workflow expectations, and repeated corrections.

Example manifest config:

```yaml
metadata:
  feedback_memory_hook:
    enabled: true
    min_confidence: 0.9
    max_chars: 220
    redact_sensitive: true
```

## Runtime policy and diagnostics

pi-gitagent translates agent metadata into a runtime policy for file writes, destructive shell commands, and network-like operations.

Use:

```bash
/gitagent policy
/gitagent doctor
```

## Try without installing

```bash
pi -e git:github.com/pesap/agents
```

That loads the extension for the current pi session only.

## Built with

- [gitagent](https://github.com/open-gitagent/gitagent)
- [pi](https://github.com/badlogic/pi-mono)
