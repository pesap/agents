# infrasys Reference

## When to Use

Use this skill when the task needs concrete infrasys operations on a `System` and `Component` graph: inspect, navigate, mutate, serialize, and reload.

## Avoid when

- Scope is not using infrasys `System`/`Component` patterns.
- Primary decision is plugin lifecycle/boundary design in r2x-core.

## Additional Reference Documents

- [TIME_SERIES.md](./TIME_SERIES.md), system-level time series integration patterns for this skill.
- [DISCOVERY.md](./DISCOVERY.md), protocol for finding and validating additional docs.
- [COST_CURVES.md](./COST_CURVES.md), production-cost and fuel-curve modeling reference for infrasys curve types.
- [SERIALIZATION_MIGRATION.md](./SERIALIZATION_MIGRATION.md), serialization format/version migration reference.
- [SUPPLEMENTAL_ATTRIBUTES.md](./SUPPLEMENTAL_ATTRIBUTES.md), modeling and querying supplemental attributes.
- [EXAMPLES.md](./EXAMPLES.md), should-trigger and near-miss prompts.
- [scripts/check_api_symbols.py](./scripts/check_api_symbols.py), optional API drift checker for key symbols (checks installed `infrasys` by default).
- [scripts/check_system_json.sh](./scripts/check_system_json.sh), checks JSON parseability and minimal infrasys structure (`python -m json.tool` + `jq`).
- [scripts/inspect_time_series_db.py](./scripts/inspect_time_series_db.py), inspects `time_series_metadata.db` tables, counts, and samples.

## Mental Model

- Keep system state typed and explicit, avoid anonymous dict payloads.
- A domain class like `Generator` is a data model class that inherits from `infrasys.Component`.
- `System` stores those typed components, not loose dict records.

## Component Data Model Pattern

```python
from pydantic import Field
from infrasys import Component

class Generator(Component):
    # Inherits UUID/name/label behavior from Component
    active_power: float = Field(ge=0)
    rating: float = Field(gt=0)
```

## System Navigation and Inspection Commands

```python
from infrasys import System

system = System(name="my_system")

# get_components returns an iterable/generator-style stream of matches
generators_iter = system.get_components(Generator)
generators = list(generators_iter)  # materialize if needed

# Narrow listing by exact name
named_generators = system.list_components_by_name(Generator, "gen1")

# get_component returns exactly one component match by type+name
one_gen = system.get_component(Generator, "gen1")

# Render a quick table view for inspection
system.show_components(Generator, show_uuid=True, show_time_series=True)

# Typical consumption pattern for get_components
for gen in system.get_components(Generator):
    print(gen.name)
```

## API Contracts (high-signal behavior)

- `get_components(*types, filter_func=None)` returns an iterable stream of matching components.
- `get_component(component_type, name)` returns one component when the type+name match is unique.
- `list_components_by_name(component_type, name)` returns a list of matches and is useful for ambiguity checks.
- `show_components(component_type, ...)` renders an inspection table and is a display helper, not a data-return API.

Behavior notes:

- `get_components(...)` is never a single component return.
- There is no `list_components(...)` API in `System`; use `get_components(...)` (optionally wrapped in `list(...)`) or `list_components_by_name(...)`.
- `get_component(...)` raises if the component is missing, or if the name is ambiguous for that type.

Time series discovery helpers (on a component or supplemental attribute):

```python
# Lightweight keys/metadata inspection
for key in system.list_time_series_keys(gen):
    print(key)

for meta in system.list_time_series_metadata(gen):
    print(meta.name, meta.features)

# Existence check before retrieval
if system.has_time_series(gen, name="active_power"):
    ts = system.get_time_series(gen, name="active_power")
```

## Core Commands You’ll Use Most

```python
# Mutate component graph
system.add_component(gen)

# Attach time series
key = system.add_time_series(ts, gen)

# Read time series by lookup or by key
ts = system.get_time_series(gen, name="active_power")
ts_by_key = system.get_time_series_by_key(gen, key)

# Remove time series
system.remove_time_series(gen, time_series_type=SingleTimeSeries, name="active_power")
```

For deeper time series design and API coverage, use [TIME_SERIES.md](./TIME_SERIES.md).
For production-cost and fuel-curve representations, use [COST_CURVES.md](./COST_CURVES.md).

## Failure Playbook

- `get_component(...)` fails with missing/ambiguous lookup:
  - Use `list_components_by_name(...)` to inspect duplicates.
  - Use `show_components(..., show_uuid=True)` to disambiguate candidates.
- Component associations look wrong after mutating composed references:
  - Run `rebuild_component_associations()`.
- Time series retrieval returns the wrong record when names are reused:
  - Add distinguishing feature tags (for example `scenario`, `model_year`) in both `add_time_series(...)` and `get_time_series(...)`.
- Deserialization/type resolution fails:
  - Confirm module/type importability and metadata shape.
  - Use [SERIALIZATION_MIGRATION.md](./SERIALIZATION_MIGRATION.md) for upgrade/migration paths.
- JSON appears malformed or suspicious:
  - Run `bash scripts/check_system_json.sh <path/to/system.json> [--strict]`.
- Need visibility into time series metadata DB state:
  - Run `uvx --from python python scripts/inspect_time_series_db.py <path/to/time_series_metadata.db-or-dir> [--sample N]`.

## Serialization and Deserialization

```python
# Serialize snapshot
system.to_json("system.json")

# Deserialize snapshot
loaded = System.from_json("system.json")
```

Round-trip check pattern:

```python
system.to_json("tmp.json")
loaded = System.from_json("tmp.json")

# verify a critical invariant
assert loaded.get_component(Generator, "gen1").capacity_mw > 0
```

If schema/version upgrades are involved, use [SERIALIZATION_MIGRATION.md](./SERIALIZATION_MIGRATION.md).

## Data Modeling Best Practices

When the task is mainly about domain model quality, inheritance boundaries, validation rules, quantities, or supplemental attributes, keep the work in this skill and use the integrated references.

Practical split:

- Use **`REFERENCE.md`** for system-level navigation, inspection, and persistence operations.
- Use **`SUPPLEMENTAL_ATTRIBUTES.md`** for cross-cutting metadata patterns.
- Use **`TIME_SERIES.md`** for selecting and operating time series types correctly.
- Use **`COST_CURVES.md`** for `FunctionData`, `ValueCurve`, `CostCurve`, and `FuelCurve` modeling and conversions.

## Output Expectations

- What was inspected and how (specific API calls)
- What changed at the `System`/`Component` level
- How serialization/deserialization was verified
- Which integrated references were used and why
