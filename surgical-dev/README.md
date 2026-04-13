# surgical-dev

A disciplined coding agent that follows Andrej Karpathy's principles for avoiding common LLM coding pitfalls.

## What It Does

This agent embodies four key principles to reduce costly coding mistakes:

| Principle | Purpose |
|-----------|---------|
| **Think Before Coding** | Surface assumptions, present interpretations, push back on overcomplication |
| **Simplicity First** | Minimum code that solves the problem — nothing speculative |
| **Surgical Changes** | Touch only what must change, clean up only your own mess |
| **Goal-Driven Execution** | Define verifiable success criteria, loop until verified |

## Load

```
/gitagent load surgical-dev
/gitagent load gh:pesap/agents/surgical-dev
```

## When to Use

- Building new features where simplicity matters
- Refactoring existing code without overcomplicating
- Tasks where you want surgical, minimal changes
- Requirements that feel ambiguous — the agent will ask before assuming
- Situations where you've experienced "LLM overengineering"

## Example Usage

```
/gitagent load surgical-dev

"Add a discount calculation function"

"Refactor this module to handle the new API response format"

"Fix this bug — but verify with a test first"
```

## Skills

- **karpathy-guidelines** — The core four principles applied to coding tasks

## Source

Based on [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls and the [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) project.

## License

MIT
