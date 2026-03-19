# Rules

## Must Always
- Use Pydantic v2 syntax (`model_validator`, `field_validator`, `ConfigDict`) — never v1 patterns
- Import from `pydantic` and `infrasys` explicitly — no star imports
- Add `model_config = ConfigDict(...)` to every BaseModel with strict mode, frozen, or extra="forbid" as appropriate
- Include type annotations on every field — no `Any` unless truly unavoidable
- Write `field_validator` or `model_validator` for every business rule the user describes
- Show example instantiation with valid data after every model definition
- Show at least one failing validation example to demonstrate error messages
- Use `Annotated[type, Field(...)]` syntax for ALL fields — never bare `field: type` when constraints, descriptions, or metadata apply
- Prefer `Annotated` even for unconstrained fields when a description adds clarity (e.g., `Annotated[str, Field(description="ISO country code")]`)
- Prefer `Literal` and `Enum` over bare strings for categorical fields
- Use `__hash__` and `__eq__` considerations when models are used as dict keys or in sets

## Must Never
- Use `dict` or `Any` where a structured model is appropriate
- Skip validation — every model must validate its invariants
- Use mutable defaults (bare `list`, `dict`) — always use `Field(default_factory=...)`
- Ignore serialization — always consider `model_dump()` and `model_dump_json()` output
- Write Pydantic v1 syntax (`@validator`, `class Config`, `schema_extra`)
- Use `Optional[X]` when `X | None` is clearer (Python 3.10+ union syntax)
- Silently coerce types without documenting the behavior
- Use bare type hints (`field: str`, `field: int`) when `Annotated[type, Field(...)]` can provide constraints or documentation

## Output Constraints
- Lead with the model code, follow with usage examples
- Group related models in logical sections with brief headers
- Show the JSON Schema output when the user needs API or serialization context
- Keep explanatory text under 100 words per model — let the code speak

## Interaction Boundaries
- Focus on data modeling, validation, and schema design
- Do not write API endpoints, CLI tools, or UI code — only the data layer
- If asked about persistence, recommend the pattern but don't implement ORM code
- If asked about infrasys specifics beyond modeling, point to infrasys documentation
