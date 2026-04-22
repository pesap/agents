# infrasys Reference Discovery Protocol

This guide defines how the `infrasys` skill should find additional reference docs quickly and reliably.

## Goal

When a task references unfamiliar APIs or behavior, the skill should follow a deterministic discovery sequence instead of ad-hoc searching.

## Recommended read order

1. `SKILL.md`
2. `REFERENCE.md`
3. `TIME_SERIES.md` (if time series is involved)
4. `COST_CURVES.md` (if production-cost or fuel-curve modeling is involved)
5. `SERIALIZATION_MIGRATION.md` (if serialization/version migration is involved)
6. `SUPPLEMENTAL_ATTRIBUTES.md` (if metadata should be attached across components)
7. `EXAMPLES.md` (trigger and near-miss sanity checks)
8. Scripts and examples (`scripts/*.sh`, `scripts/*.py`, `EXAMPLES.md`) when validation or reproducibility is needed

## Canonical external sources

Prefer these in order:

1. Installed package metadata
   - `infrasys` on PyPI: <https://pypi.org/project/infrasys/>
2. Installed package source code (source of truth for APIs)
   - `infrasys.system`
   - `infrasys.time_series_models`
   - `infrasys.serialization`
   - `infrasys.cost_curves`
   - `infrasys.value_curves`
   - `infrasys.function_data`

You can always inspect source code from the installed Python package.

Example (prints module file paths):

```bash
uvx --from python --with infrasys python - <<'PY'
import infrasys.system as s
import infrasys.time_series_models as ts
import infrasys.serialization as ser
import infrasys.cost_curves as cc
print(s.__file__)
print(ts.__file__)
print(ser.__file__)
print(cc.__file__)
PY
```

If docs and source disagree, trust source signatures/behavior and note the mismatch.

## Discovery workflow

1. Extract task keywords and symbol candidates
   - Example: `show_components`, `get_component`, `save/load`, `list_time_series_keys`.
2. Find candidate files
   - Start from doc indexes, then targeted file search.
3. Confirm symbol behavior with source
   - Check function signatures and docstrings in `system.py` / `time_series_models.py`.
4. Cross-check related docs
   - Pull explanation/how-to pages for examples and caveats.
5. Record provenance in output
   - State which files were consulted and which one was decisive.

## Practical search strategy

- Prefer narrow, literal symbol searches before broad fuzzy search.
- Search for method definitions (`def <name>`) when API exactness matters.
- Use docs for intent and examples, source for final truth.
- Optionally run `uvx --from python --with infrasys python scripts/check_api_symbols.py` after upstream upgrades to catch API drift quickly.
- Use `scripts/check_system_json.sh` for fast malformed-JSON checks (`python -m json.tool` + `jq`).
- Use `scripts/inspect_time_series_db.py` when debugging metadata DB contents.

## Escalation rules

Stay within this skill and choose the right integrated reference by task center-of-gravity:

- `TIME_SERIES.md` for backend decisions/performance tuning and retrieval semantics.
- `SUPPLEMENTAL_ATTRIBUTES.md` for class design boundaries involving cross-cutting metadata.
- `COST_CURVES.md` for production-cost/fuel-curve representation and conversion.
- `SERIALIZATION_MIGRATION.md` for serialization/version upgrades and compatibility handling.

## Output checklist (for the skill)

- APIs confirmed (exact method names)
- Docs/source consulted (paths)
- Any docs vs source mismatches found
- Chosen boundary between integrated references inside this skill
