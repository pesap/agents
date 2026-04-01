# pesap-agents

A collection of AI agents built with [gitagent](https://github.com/open-gitagent/gitagent), plus **pi-gitagent**: a [pi](https://github.com/badlogic/pi-mono) extension that loads any gitagent agent into your session.

## Install

```bash
pi install https://github.com/pesap/pesap-agents
```

That's it. Now you have `/gitagent` in every pi session.

## Usage

```bash
# Load a local agent
/gitagent install code-reviewer

# Load from GitHub (shorthand)
/gitagent install pesap/pesap-agents/code-reviewer

# Load from GitHub (full URL)
/gitagent install https://github.com/pesap/pesap-agents/tree/main/code-reviewer

# Load any gitagent repo
/gitagent install shreyas-lyzr/architect

# List agents in a repo
/gitagent list pesap/pesap-agents

# Show loaded agent info
/gitagent info

# Re-pull latest from remote
/gitagent refresh

# Remove agent context
/gitagent unload
```

When you load an agent, pi-gitagent:
1. Resolves the agent (local dir or GitHub clone, cached at `~/.pitagent/cache/`)
2. Parses `agent.yaml`, `SOUL.md`, `RULES.md`, skills, knowledge, memory
3. Injects the agent's full identity into the system prompt
4. Switches to the agent's preferred model
5. Shows a status indicator in the footer

## What Gets Loaded

| gitagent file | How it's used in pi |
|---------------|---------------------|
| `SOUL.md` | Appended to system prompt (identity, personality) |
| `RULES.md` | Appended to system prompt (hard constraints) |
| `PROMPT.md` | Appended to system prompt (operational instructions) |
| `DUTIES.md` | Appended to system prompt (segregation of duties) |
| `skills/` | Listed in system prompt as available capabilities |
| `knowledge/` | `always_load` docs baked into system prompt |
| `memory/MEMORY.md` | Loaded into context, agent can write learnings back |
| `agent.yaml` model | Auto-switches pi to the preferred model |
| `agent.yaml` compliance | Translated to behavioral constraints |

## Memory and Learning

The agent knows its memory file path and is instructed to write learnings there. After a session:

```bash
# For remote agents
cd ~/.pitagent/cache/<hash>
git add memory/ && git commit -m "feat(memory): update learnings"

# For local agents, just commit normally
```

## Agents

| Agent | Description |
|-------|-------------|
| [code-reviewer](./code-reviewer) | Analyzes code for bugs, security issues, performance, and style |
| [performance-freak](./performance-freak) | Optimizes code for speed and memory efficiency |
| [simplify](./simplify) | Reviews code for reuse, quality, and efficiency |
| [github-ci-optimizer](./github-ci-optimizer) | Optimizes GitHub Actions CI |
| [data-modeler](./data-modeler) | Expert data modeler (Pydantic v2, infrasys) |
| [decomplexify](./decomplexify) | First principles + Feynman technique |
| [optimization-modeler](./optimization-modeler) | Simplifies formulations, tunes solvers |

## Try without installing

```bash
pi -e git:github.com/pesap/pesap-agents
```

Then use `/gitagent` as normal. The extension is loaded for that session only.

## Built with

- [gitagent](https://github.com/open-gitagent/gitagent) — git-native agent standard
- [pi](https://github.com/badlogic/pi-mono) — coding agent harness
