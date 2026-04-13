# agents

A collection of AI agents built with [gitagent](https://github.com/open-gitagent/gitagent), plus **pi-gitagent**: a [pi](https://github.com/badlogic/pi-mono) extension that loads any gitagent agent into your session.

## Install

```bash
pi install https://github.com/pesap/agents
```

That's it. Now you have `/gitagent` in every pi session.

## Usage

```bash
# Load a local agent
/gitagent load code-reviewer

# Load from GitHub (shorthand)
/gitagent load gh:pesap/agents/code-reviewer

# Load from GitHub (full URL)
/gitagent load https://github.com/pesap/agents/tree/main/code-reviewer

# Load any gitagent repo
/gitagent load gh:shreyas-lyzr/architect

# Create a brand new agent from a prompt
/gitagent new "a code reviewer specialized in Rust unsafe blocks"

# List agents in a repo
/gitagent list gh:pesap/agents

# Recommend the best agent for a task
/gitagent recommend "review a risky Rust refactor for bugs"

# Run diagnostics on the loaded or target agent
/gitagent doctor
/gitagent doctor gh:pesap/agents/code-reviewer

# Explain the loaded agent's runtime policy
/gitagent policy

# Show loaded agent info
/gitagent info

# Re-pull latest from remote
/gitagent refresh

# Remove agent context
/gitagent unload
```

Loaded agents persist across sessions in the same pi session file, so you don't need to reload after restarts.

The runtime now also derives a safety policy for the loaded agent. By default this comes from `metadata.runtime_policy` when present, otherwise it falls back to sensible compliance-based defaults. File edits and risky shell commands can be auto-allowed, approval-gated, or blocked per agent.

### LLM-callable tools

The extension also registers tools that the LLM can call directly. When you say "load the simplify agent and review my code", the LLM calls `gitagent_load` with a `followUp` parameter so the review runs with the agent's context active.

| Tool | Description |
|------|-------------|
| `gitagent_load` | Load an agent, optionally queue a follow-up task |
| `gitagent_unload` | Remove the loaded agent context |
| `gitagent_info` | Show the currently loaded agent |
| `gitagent_list` | List available agents in a directory or repo |
| `gitagent_remember` | Save a learning to the agent's persistent memory |

## Skill Usage Protocol and Verification Hooks

Agents with skills now get an explicit runtime protocol:

- Match the task against available skills before execution
- Apply the selected skill checklists while working
- Include a `Skills Used` section in the final response (or `none` with reason)

A lightweight hook audits assistant responses and records pass/fail skill checks in session entries (`gitagent-skill-check`). In strict mode, if a response is missing the section, pi queues an automatic follow-up reminder and logs `gitagent-skill-enforcement`.

## Automatic Feedback Memory Hook

Like a mini diary for user preferences, pi-gitagent can auto-capture feedback-looking user messages (preferences, corrections, praise with meta context) and save them into the active agent memory as dated `[feedback/<topic>/<sentiment>]` entries.

This hook is **opt-in per agent** (default off), configured in `agent.yaml` under `metadata.feedback_memory_hook`.

Each capture is logged as a session entry (`gitagent-feedback-captured`) with inferred signal and confidence, deduplicated per turn, and filtered by the configured confidence threshold.

```yaml
metadata:
  category: developer-tools
  feedback_memory_hook:
    enabled: true
    min_confidence: 0.9
    max_chars: 220
    redact_sensitive: true
```

When you load an agent, pi-gitagent:
1. Resolves the agent (local dir or GitHub clone, cached at `~/.pitagent/cache/`)
2. Parses `agent.yaml`, `SOUL.md`, `RULES.md`, skills, knowledge, memory
3. Injects the agent's full identity into the system prompt
4. Switches to the agent's preferred model
5. Shows a status indicator in the footer

## Runtime Policy, Diagnostics, and Recommendation

`/gitagent policy` shows how the active agent is allowed to behave at runtime. The current implementation classifies file mutation, destructive shell commands, and networky shell commands, then decides whether to allow, ask, or block.

`/gitagent doctor` validates the agent runtime, including:
- cache and memory directories are writable
- preferred and fallback models resolve
- skills loaded correctly
- feedback memory hook status
- active runtime policy summary

`/gitagent recommend <task>` scores agents in the current repo and suggests the best matches with short reasons.

Optional manifest metadata:

```yaml
metadata:
  category: developer-tools
  beginner_friendly: true
  mutates_files: false
  best_for:
    - code review
    - security review
  runtime_policy:
    mode: supervised
    approvals:
      file_write: ask
      bash_destructive: ask
      network: ask
    allow_tools:
      - read
      - bash
    deny_patterns:
      bash:
        - rm -rf
        - git push
```

## Creating New Agents

`/gitagent new <prompt>` temporarily loads the [gitagent architect](https://github.com/shreyas-lyzr/architect) into your session, sends your prompt, and lets it create a full agent (agent.yaml, SOUL.md, RULES.md, skills, etc.) in your working directory. Once the architect finishes, your previous agent is automatically restored.

```bash
/gitagent new "an agent that reviews SQL queries for performance and security"
```

## What Gets Loaded

| gitagent file | How it's used in pi |
|---------------|---------------------|
| `SOUL.md` | Appended to system prompt (identity, personality) |
| `RULES.md` | Appended to system prompt (hard constraints) |
| `PROMPT.md` | Appended to system prompt (operational instructions) |
| `DUTIES.md` | Appended to system prompt (segregation of duties) |
| `skills/` | Loaded into prompt with `When to use` + checklist instructions, plus response protocol (`Skills Used`) |
| `knowledge/` | `always_load` docs baked into system prompt |
| `memory/MEMORY.md` | Loaded into context, agent can write learnings back |
| `agent.yaml` model | Auto-switches pi to the preferred model |
| `agent.yaml` compliance | Translated to behavioral constraints |

## Memory and Learning

Agent memory is stored in a centralized location at `~/.pitagent/memory/<agent-name>/MEMORY.md`, separate from both local agent directories and the remote clone cache. This means:

- **Memory survives cache clears.** Running `/gitagent refresh` (which does `git reset --hard` on cached repos) won't nuke your learnings.
- **Same memory regardless of source.** Whether you load an agent locally or from GitHub, the agent reads and writes from the same memory file. No duplicated or lost state.
- **Safe from accidents.** Memory isn't sitting inside a shallow clone that can be wiped at any time.

The LLM saves learnings by calling the `gitagent_remember` tool, and feedback can also be captured automatically by hook (for agents with `feedback_memory_hook.enabled=true`) when user messages look like preferences/corrections. Entries are concise and dated. On session shutdown, if nothing was saved and the session was non-trivial (2+ user messages), a session note is auto-appended so no context is silently lost.

```
~/.pitagent/
├── cache/                          # Cloned repos (disposable)
│   └── <hash>/
└── memory/                         # Agent learnings (persistent)
    ├── code-reviewer/
    │   └── MEMORY.md
    └── performance-freak/
        └── MEMORY.md
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
| [dslop](./dslop) | Multi-agent pre-commit deslop pass with Python and Rust overlays |

## Try without installing

```bash
pi -e git:github.com/pesap/agents
```

Then use `/gitagent` as normal. The extension is loaded for that session only.

## Built with

- [gitagent](https://github.com/open-gitagent/gitagent) — git-native agent standard
- [pi](https://github.com/badlogic/pi-mono) — coding agent harness
