# infrasys Skill Trigger Examples

Use these prompts to validate when this skill should activate.

## Should trigger

1. "Inspect this infrasys `System`, list generators and buses, and show me what time series are attached."
2. "I changed `gen.bus` references after loading, now parent lookups seem wrong. Diagnose and fix the association state."
3. "Add a new component type, attach it to the system, and verify `to_json`/`from_json` round-trip integrity."
4. "Implement a custom `System` upgrade path using `data_format_version` and `handle_data_format_upgrade`."
5. "Add an operation cost model to generators using infrasys cost curves and verify schema compatibility."

## Near-miss (should NOT trigger)

1. "My task is generic architecture brainstorming, not tied to infrasys APIs."
2. "Help me choose between unrelated web frameworks for a UI app."
3. "Summarize a product roadmap with no system-modeling context."

## Borderline prompts (trigger + integrated reference)

1. "Fix deserialization of old snapshots and migrate schema safely."
   - Trigger this skill, then use `SERIALIZATION_MIGRATION.md`.
2. "Model production variable costs and convert incremental to input-output forms."
   - Trigger this skill, then use `COST_CURVES.md`.
