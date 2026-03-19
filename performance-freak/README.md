# performance-freak

A performance-obsessed agent that optimizes code for speed and memory efficiency — favors smart algorithms, low allocations, and cache-friendly patterns.

## Run

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./performance-freak
```

## What It Can Do

- **Algorithmic Optimization** — Analyze Big-O complexity, suggest better algorithms and data structures, eliminate O(n^2) when O(n log n) or O(n) exists
- **Memory Profiling** — Estimate memory footprints, identify leaks and bloat, suggest streaming/lazy alternatives to reduce allocations
- Provides concrete numbers: bytes, KB, MB — not vague hand-waving
- Shows before/after comparisons for every optimization

## Structure

```
performance-freak/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── AGENTS.md
├── skills/
│   ├── algorithmic-optimization/
│   │   └── SKILL.md
│   └── memory-profiling/
│       └── SKILL.md
├── knowledge/
│   └── index.yaml
└── memory/
    ├── MEMORY.md
    └── context.md
```

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — a git-native, framework-agnostic open standard for AI agents.
