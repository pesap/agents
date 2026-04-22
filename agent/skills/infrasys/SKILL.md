---
name: infrasys
description: |
  Build, inspect, and evolve infrasys systems using System/Component patterns,
  command-level system navigation, and safe serialization/deserialization.
  infrasys is the foundational modeling layer, and r2x-core is an application
  built on top of it.
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.5.0"
  category: infrastructure-systems
---

# infrasys

## Use when

- Building or extending infrasys `System` + `Component` models.
- Inspecting an existing `System` and deciding what to change.
- Needing concrete system navigation APIs such as `info`, `show_components`, and component/time series listing methods.
- Preparing systems for reproducible persistence using `to_json`/`from_json` or `save`/`load`.
- Defining or validating custom `System` hooks for attributes and format upgrades.

## Avoid when

- Scope is not using infrasys `System`/`Component` patterns.
- User asks for general architecture advice without infrasys constraints.

## Quick start: which doc first?

- System inspect/mutate and API contracts: [REFERENCE.md](./REFERENCE.md)
- Time series integration at system level: [TIME_SERIES.md](./TIME_SERIES.md)
- Production cost and fuel curves: [COST_CURVES.md](./COST_CURVES.md)
- Serialization, deserialization, and format upgrades: [SERIALIZATION_MIGRATION.md](./SERIALIZATION_MIGRATION.md)
- Supplemental attributes and many-to-many metadata: [SUPPLEMENTAL_ATTRIBUTES.md](./SUPPLEMENTAL_ATTRIBUTES.md)
- How to discover and validate sources: [DISCOVERY.md](./DISCOVERY.md)

## Additional Documentation

- [EXAMPLES.md](./EXAMPLES.md), trigger and near-miss prompts.
- [scripts/check_api_symbols.py](./scripts/check_api_symbols.py), optional API drift checker for key infrasys symbols.
- [scripts/check_system_json.sh](./scripts/check_system_json.sh), validates that a system JSON is parseable and minimally complete (via `python -m json.tool` + `jq`).
- [scripts/inspect_time_series_db.py](./scripts/inspect_time_series_db.py), inspects `time_series_metadata.db` tables, counts, and optional sample rows.

## Workflow

1. Inspect first, change second.
   - Inventory the current system with APIs like `system.info()`, `system.show_components(...)`, `get_component_types()`, `get_components(...)`, `list_components_by_name(...)`, `list_time_series_keys(...)`, and `list_time_series_metadata(...)`.
   - Follow `DISCOVERY.md` to find additional canonical docs and confirm exact API behavior.
2. Define boundaries and associations.
   - Keep domain state in typed `Component`/`System` models.
   - Use supplemental-attribute APIs (`add_supplemental_attribute`, `get_supplemental_attributes_with_component`, `get_components_with_supplemental_attribute`) for cross-cutting metadata.
   - If composed component references are reassigned after attach, call `rebuild_component_associations()`.
3. Apply minimal model changes.
   - Add or adjust components/associations with explicit naming.
   - Avoid dict blobs when a typed component or attribute is appropriate.
4. Verify persistence behavior.
   - Validate `System.to_json(...)` / `System.from_json(...)` round-trip behavior on touched paths.
   - Validate packaged workflows with `system.save(...)` / `System.load(...)` when archive distribution is relevant.
   - Use [scripts/check_system_json.sh](./scripts/check_system_json.sh) to catch malformed or structurally invalid JSON early.
   - Use [scripts/inspect_time_series_db.py](./scripts/inspect_time_series_db.py) when inspecting metadata-store issues.
   - Use [SERIALIZATION_MIGRATION.md](./SERIALIZATION_MIGRATION.md) for migration-heavy paths.
5. Respect extension hooks and integrated specialized guidance.
   - For custom `System` subclasses, use `serialize_system_attributes`, `deserialize_system_attributes`, `data_format_version`, and `handle_data_format_upgrade`.
   - For component schema design and validation, use [SUPPLEMENTAL_ATTRIBUTES.md](./SUPPLEMENTAL_ATTRIBUTES.md) and [REFERENCE.md](./REFERENCE.md).
   - For time series handling, including storage backend decisions, use [TIME_SERIES.md](./TIME_SERIES.md).
   - For production cost and fuel-curve modeling, use [COST_CURVES.md](./COST_CURVES.md).

## Output

- System inspection findings (what exists today)
- Proposed infrasys model changes and rationale
- Exact commands/APIs used for navigation and verification
- Serialization/deserialization and archive-load checks performed
- Association integrity notes (including whether `rebuild_component_associations()` was needed)
- Integrated references consulted and why
