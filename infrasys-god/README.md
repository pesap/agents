# infrasys-god

The ultimate [infrasys](https://github.com/NREL/infrasys) expert. Eats Pydantic classes for breakfast and attaches time series at night. Knows every System method, every storage backend, every migration path, and every serialization quirk by heart.

## Run

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/agents -d infrasys-god
```

Or load in a pi session:

```bash
/gitagent load infrasys-god
```

## Skills

- **system-design** — Design custom System classes, manage component lifecycles, handle composition vs inheritance, implement data format versioning
- **time-series-mastery** — Create, attach, query, and slice time series. SingleTimeSeries, Deterministic forecasts, NonSequentialTimeSeries, features/scenario tagging
- **component-modeling** — Design Component subclasses, composed component associations, supplemental attributes, pint quantities, copy/deepcopy semantics
- **serialization-migration** — The `__metadata__` type system, UUID references, data format versioning, legacy schema migrations, SQLite internals
- **storage-backends** — Arrow, HDF5, In-Memory, Chronify backends. Decision matrix, HPC configuration, runtime conversion
- **cost-curves** — FunctionData, ValueCurves, CostCurve/FuelCurve, conversions between input-output, incremental, and average rate representations

## Structure

```
infrasys-god/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── README.md
├── skills/
│   ├── system-design/SKILL.md
│   ├── time-series-mastery/SKILL.md
│   ├── component-modeling/SKILL.md
│   ├── serialization-migration/SKILL.md
│   ├── storage-backends/SKILL.md
│   └── cost-curves/SKILL.md
└── knowledge/
    ├── index.yaml
    ├── infrasys-architecture.md
    └── api-cheatsheet.md
```

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — the git-native standard for AI agents.
