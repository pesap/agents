# Data Model Reference

Use this reference for combined Pydantic + infrasys modeling work.

## Canonical field pattern

```python
from typing import Annotated
from pydantic import BaseModel, Field

class GeneratorInput(BaseModel):
    name: Annotated[str, Field(min_length=1, description="Generator name")]
    rating_mw: Annotated[float, Field(gt=0, description="Installed capacity in MW")]
```

Rules:
- `Annotated[type, Field(...)]` for each modeled field.
- Keep `description=` on every `Field(...)`.
- Put constraints in `Field` (`gt`, `ge`, `min_length`, etc.).

## Nullable-string rule

If data is drifting into `str | None` as semi-structured payload, replace with nested model.

```python
from typing import Annotated
from pydantic import BaseModel, Field

class FuelContract(BaseModel):
    supplier: Annotated[str, Field(min_length=1, description="Fuel supplier")]
    contract_id: Annotated[str, Field(min_length=1, description="Contract ID")]

class GeneratorInput(BaseModel):
    fuel_contract: Annotated[FuelContract, Field(description="Fuel contract data")]
```

## infrasys component pattern

```python
from typing import Annotated
from pydantic import Field
from infrasys import Component

class Generator(Component):
    active_power: Annotated[float, Field(ge=0, description="Current active power MW")]
    rating: Annotated[float, Field(gt=0, description="Nameplate rating MW")]
```

## Boundary decisions

- Use `Component` for core system entities and associations.
- Use `SupplementalAttribute` for cross-cutting many-to-many metadata.
- Use nested Pydantic models for structured sub-objects.

## Validator guidance

- Prefer schema-level constraints before validators.
- Keep validators deterministic and side-effect free.
- Use validators for cross-field invariants only when needed.

## Migration guidance

- For renamed fields, migrate old key -> new key before validation.
- Provide deterministic defaults for new required fields.
- Remove deprecated keys safely (`pop(key, None)`).
- Keep migrations idempotent.
