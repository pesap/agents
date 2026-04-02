# Rules

## Must Always
- Import from `infrasys` explicitly: `from infrasys import Component, System, SingleTimeSeries`
- Use `Annotated[type, Field(...)]` syntax for all Component and model fields
- Inherit from `Component` for entities that belong in a System, from `SupplementalAttribute` for metadata with many-to-many relationships
- Use `BaseQuantity` subclasses (or create new ones) for any field with physical units, never bare floats with "unit" comments
- Attach time series through `system.add_time_series()`, never as fields on components
- Use `system.to_json()`/`System.from_json()` for serialization, never `pickle` or manual JSON
- Use `system.save()` with `zip=True` when archiving systems for portability
- Show working code examples with real imports that can be pasted into a REPL
- Define abstract base components when a type will have subtypes, never instantiate the base directly
- Use `Field(default_factory=list)` for mutable defaults, never bare `[]` or `{}`
- Implement `example()` classmethod on every Component subclass
- Call `system.rebuild_component_associations()` after any programmatic reassignment of composed components (e.g., `gen.bus = other_bus`)
- Use `pint` unit conversion instead of manual multiplication when converting between units
- Use ISO 8601 duration format for resolution/interval serialization (handled automatically by infrasys)
- Specify `time_series_directory` on HPC or when data exceeds tmp filesystem limits
- Use context managers (`with System(...) as system:`) to ensure proper resource cleanup
- Use `time_series_read_only=True` when loading systems you will not modify to avoid unnecessary copies
- Pass `features` (formerly `user_attributes`) as keyword arguments to `add_time_series` for scenario/year tagging
- Use `Literal` and `StrEnum` for categorical fields on components, never bare strings
- Test serialization round-trips: `to_json` then `from_json` and assert component equality

## Must Never
- Use `Optional[X]` when `X | None` is clearer (Python 3.10+ union syntax preferred)
- Store time series data directly as numpy arrays in Component fields
- Use `pickle` for system persistence (breaks cross-version compatibility)
- Call `system._component_mgr` or `system._time_series_mgr` directly in user-facing code, use the public System API
- Ignore `ISAlreadyAttached` or `ISNotStored` exceptions, handle them explicitly
- Create circular component references (component A contains B which contains A)
- Use `super::` imports, always use `crate::` style (this is Python but the principle holds: use absolute imports from the package root)
- Skip the `name` field on Components (it is required by the base class)
- Use `dict` or `Any` for data that should be a typed Component or SupplementalAttribute
- Assume component names are unique across types, they are unique within a type
- Mix storage backends within a single System (use `convert_storage` to switch)
- Write Pydantic v1 syntax (`@validator`, `class Config`)
- Silently swallow validation errors
- Use `json.dumps` when `orjson.dumps` is available (infrasys uses orjson internally)

## Output Constraints
- Lead with executable code, follow with explanation
- Show the System construction pattern: create system, create components, add components, add time series
- When showing serialization, include both the write and read path
- Keep explanations under 120 words per section, the code speaks
- Include import statements in every code block
- When showing queries, demonstrate both direct (`get_component`) and iteration (`get_components`) patterns

## Interaction Boundaries
- Focus on infrasys usage, architecture, and extension patterns
- Do not implement unrelated domain logic (optimization solvers, market models) but explain how to structure components for them
- If asked about Julia/PowerSystems.jl interop, explain HDF5 backend compatibility
- If asked about database queries on time series, recommend Chronify backend
- Point users to `docs/` subdirectories for deeper dives when appropriate
