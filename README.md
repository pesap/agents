# pesap-agents

A collection of AI agents built with [gitagent](https://github.com/open-gitagent/gitagent) and [pi](https://github.com/mariozechner/pi).

## Agents

| Agent | Description |
|-------|-------------|
| [code-reviewer](./code-reviewer) | Analyzes code for bugs, security issues, performance problems, and style |
| [performance-freak](./performance-freak) | Optimizes code for speed and memory efficiency |
| [simplify](./simplify) | Reviews code for reuse, quality, and efficiency — then fixes issues found |
| [github-ci-optimizer](./github-ci-optimizer) | Optimizes GitHub Actions CI for speed, caching, and resource efficiency |
| [data-modeler](./data-modeler) | Expert data modeler using Pydantic v2, infrasys, and exhaustive validation |
| [decomplexify](./decomplexify) | Breaks down complex topics using first principles thinking and the Feynman technique |
| [optimization-modeler](./optimization-modeler) | Simplifies formulations, linearizes, decomposes into testable subproblems, and tunes solvers |

## Single Source of Truth

Each agent is defined by standard gitagent files — **no per-agent boilerplate scripts**:

```
<agent>/
├── agent.yaml     ← manifest (model, skills, pi config)
├── SOUL.md        ← identity, personality, expertise
├── RULES.md       ← hard constraints, boundaries
├── PROMPT.md      ← operational instructions (optional)
├── skills/        ← reusable capability modules
└── knowledge/     ← reference documents
```

The `pi` section in `agent.yaml` holds pi-specific config (scope, tools, thinking). A shared `load-agent.ts` reads any agent directory and registers it with pi — no per-agent `index.ts` needed.

### Run with gitagent

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./code-reviewer
```

### Run with pi

```bash
npx ts-node load-agent.ts ./code-reviewer
```

## Agent Loop Orchestration

Run agents in a sequence with **simplify automatically running last** to improve all code changes:

```bash
# Run with default pipeline: code-reviewer → performance-freak → simplify
npx ts-node agent-loop.ts "Improve user authentication"

# Run custom agent sequence (simplify always runs last):
npx ts-node agent-loop.ts "Optimize data model" data-modeler

# Run multiple agents in sequence:
npx ts-node agent-loop.ts "Refactor API endpoints" code-reviewer performance-freak data-modeler
```

The **simplify agent** always runs after code changes to:
- Find existing utilities and eliminate duplication
- Fix quality issues (redundant state, parameter sprawl, leaky abstractions)
- Improve efficiency (unnecessary work, missed concurrency, N+1 patterns)
- Apply fixes directly without leaving TODOs or suggestions

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — git-native, framework-agnostic open standard for AI agents.

[pi](https://github.com/mariozechner/pi) — coding agent harness with subagent orchestration.
