# pesap-agents

A collection of AI agents built with [gitagent](https://github.com/open-gitagent/gitagent).

## Agents

| Agent | Description | Run |
|-------|-------------|-----|
| [code-reviewer](./code-reviewer) | Analyzes code for bugs, security issues, performance problems, and style | `npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./code-reviewer` |
| [performance-freak](./performance-freak) | Optimizes code for speed and memory efficiency | `npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./performance-freak` |
| [github-ci-optimizer](./github-ci-optimizer) | Optimizes GitHub Actions CI for speed, caching, and resource efficiency | `npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./github-ci-optimizer` |
| [decomplexify](./decomplexify) | Breaks down complex topics using first principles thinking and the Feynman technique | `npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./decomplexify` |

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — a git-native, framework-agnostic open standard for AI agents.
