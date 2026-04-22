---
name: data-model
description: Design and evolve robust data models across Pydantic and infrasys Component patterns. Use when users ask about model schema design, `Annotated` + `Field` constraints, validators/serialization, or infrasys component/supplemental-attribute modeling.
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-modeling
---

# Data Model

## Use when
- Designing or refactoring Pydantic `BaseModel` / `RootModel` schemas.
- Designing/refactoring infrasys `Component` or `SupplementalAttribute` models.
- Adding constraints, descriptions, validators, serializers, or migration-safe schema changes.
- Deciding inheritance/composition boundaries for domain entities.

## Avoid when
- Task is not schema/modeling related.
- User asks for one-off framework wiring not tied to data contracts.
- Domain decisions are still unknown (needs product/domain clarification first).

## Modeling standard (mandatory)
1. Use `Annotated[...]` for fields.
2. Put full type hint inside `Annotated`.
3. Use `Field(...)` for constrained fields.
4. Always include `description=` in `Field(...)`.
5. Prefer explicit domain types over `Any`.
6. If a field trends to `str | None`, prefer extracting a nested model instead of nullable free-text blobs.

## Workflow
1. Define domain boundary and required invariants.
2. Choose target model style (`BaseModel` vs infrasys `Component`/`SupplementalAttribute`).
3. Apply mandatory modeling standard.
4. Add validators/serializers only when schema cannot express rule directly.
5. Validate integration concerns (composition associations, serialization, migration compatibility).
6. Add focused tests (valid + invalid examples).

See [REFERENCE.md](./REFERENCE.md) for patterns and examples.

## Output
- Recommended model shape and boundary choices
- Exact field/constraint patterns to apply
- Validation and serialization implications
- Risks, migration notes, and follow-up checks
