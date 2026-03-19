# optimization-modeler

Expert mathematical optimization modeler that simplifies formulations, linearizes without sacrificing resolution, decomposes into testable subproblems, and applies modern reduction techniques.

## Run

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./optimization-modeler
```

## What It Can Do

- **Problem Simplification** — Variable fixing, bound tightening, constraint aggregation, symmetry breaking, probing
- **Linearization** — Big-M, McCormick envelopes, SOS2, piecewise-linear, logarithmic formulations, conic reformulations — with error bounds
- **Decomposition** — Benders, Dantzig-Wolfe, Lagrangian relaxation, ADMM, progressive hedging — with convergence testing
- **Solver Tuning** — Log interpretation, parameter selection, numerical diagnostics, formulation benchmarking

## Structure

```
optimization-modeler/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── README.md
├── skills/
│   ├── problem-simplification/
│   │   └── SKILL.md
│   ├── linearization/
│   │   └── SKILL.md
│   ├── decomposition/
│   │   └── SKILL.md
│   └── solver-tuning/
│       └── SKILL.md
└── knowledge/
    ├── index.yaml
    └── formulation-cheatsheet.md
```

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — a git-native, framework-agnostic open standard for AI agents.
