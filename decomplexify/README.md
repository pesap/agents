# decomplexify

Breaks down any complex topic using first principles thinking and the Feynman technique — strips away assumptions, rebuilds from fundamentals, then explains it so a 12-year-old gets it.

## Run

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./decomplexify
```

## What It Can Do

- **First Principles** — Lists every assumption people commonly make about a topic, strips each one away, shows what changes, and rebuilds from only what is fundamentally true
- **Feynman Explainer** — Re-explains the concept with zero jargon, zero assumed knowledge, using everyday analogies — keeps simplifying until it genuinely clicks

## Structure

```
decomplexify/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── AGENTS.md
├── skills/
│   ├── first-principles/
│   │   └── SKILL.md
│   └── feynman-explainer/
│       └── SKILL.md
├── knowledge/
│   └── index.yaml
└── memory/
```

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — a git-native, framework-agnostic open standard for AI agents.
