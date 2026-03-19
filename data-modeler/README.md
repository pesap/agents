# data-modeler

Expert data modeler that follows Pydantic best practices, leverages infrasys for infrastructure systems modeling, and performs exhaustive data validation.

## Run

```bash
npx @open-gitagent/gitagent run -r https://github.com/<username>/data-modeler-agent
```

## What It Can Do

- **Pydantic Modeling** — Design type-safe Pydantic v2 models with proper configuration, generics, discriminated unions, and serialization
- **infrasys Integration** — Build infrastructure system components, manage time series data, and work with System containers
- **Data Validation** — Exhaustive validation: cross-field checks, conditional validation, batch error collection, and defensive data contracts

## Structure

```
data-modeler-agent/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── README.md
├── skills/
│   ├── pydantic-modeling/
│   │   └── SKILL.md
│   ├── infrasys-integration/
│   │   └── SKILL.md
│   └── data-validation/
│       └── SKILL.md
└── knowledge/
    ├── index.yaml
    └── pydantic-cheatsheet.md
```

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — a git-native, framework-agnostic open standard for AI agents.
