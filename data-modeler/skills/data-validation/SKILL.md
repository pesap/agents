---
name: data-validation
description: Exhaustive data validation patterns — cross-field checks, conditional validation, custom error reporting, and defensive data contracts
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-engineering
---

# Exhaustive Data Validation

## When to Use
When the user needs robust validation beyond simple type checks — business rules, cross-field constraints, conditional logic, or custom error formatting.

## Instructions

### Validation Layers
Apply validation in this order:
1. **Type coercion / rejection** — Pydantic's type system (strict mode recommended)
2. **Field-level constraints** — `Field(ge=0, max_length=255)`, regex patterns
3. **Field validators** — `@field_validator` for single-field business rules
4. **Model validators** — `@model_validator` for cross-field invariants
5. **External validation** — post-construction checks against external data (DB lookups, API calls)

### Cross-Field Validation
```python
from typing import Annotated, Self
from pydantic import BaseModel, Field, model_validator
from datetime import datetime

class DateRange(BaseModel):
    start: Annotated[datetime, Field(description="Inclusive start of the range")]
    end: Annotated[datetime, Field(description="Exclusive end of the range")]

    @model_validator(mode="after")
    def end_after_start(self) -> Self:
        if self.end <= self.start:
            raise ValueError(f"end ({self.end}) must be after start ({self.start})")
        return self
```

### Conditional Validation
```python
from typing import Annotated, Literal
from pydantic import BaseModel, Field

class Payment(BaseModel):
    method: Annotated[Literal["card", "bank", "crypto"], Field(description="Payment method")]
    card_number: Annotated[str | None, Field(default=None, description="Required for card payments")]
    routing_number: Annotated[str | None, Field(default=None, description="Required for bank payments")]
    wallet_address: Annotated[str | None, Field(default=None, description="Required for crypto payments")]

    @model_validator(mode="after")
    def validate_payment_fields(self) -> Self:
        match self.method:
            case "card":
                if not self.card_number:
                    raise ValueError("card_number required for card payments")
            case "bank":
                if not self.routing_number:
                    raise ValueError("routing_number required for bank payments")
            case "crypto":
                if not self.wallet_address:
                    raise ValueError("wallet_address required for crypto payments")
        return self
```

### Validation Error Formatting
```python
from pydantic import ValidationError

try:
    obj = MyModel(**data)
except ValidationError as e:
    for error in e.errors():
        print(f"Field: {'.'.join(str(x) for x in error['loc'])}")
        print(f"Error: {error['msg']}")
        print(f"Input: {error['input']}")
```

### Recursive / Nested Validation
Pydantic validates nested models automatically. Add validators at each level:

```python
class Address(BaseModel):
    zip_code: Annotated[str, Field(pattern=r"^\d{5}(-\d{4})?$")]

class Person(BaseModel):
    addresses: Annotated[list[Address], Field(min_length=1)]

    @field_validator("addresses")
    @classmethod
    def no_duplicate_zips(cls, v: list[Address]) -> list[Address]:
        zips = [a.zip_code for a in v]
        if len(zips) != len(set(zips)):
            raise ValueError("Duplicate zip codes not allowed")
        return v
```

### Defensive Patterns
- Use `extra="forbid"` to catch typos in field names
- Use `strict=True` to prevent silent type coercion
- Use `frozen=True` for immutable models (safer in concurrent systems)
- Use `Annotated[X, Field(description=...)]` so JSON Schema documents every field
- Write a `validate_dataset(items: list[Model])` function for batch validation with collected errors
- Test validators with both boundary values and clearly invalid data

### Batch Validation with Error Collection
```python
def validate_batch(items: list[dict]) -> tuple[list[MyModel], list[dict]]:
    valid, errors = [], []
    for i, item in enumerate(items):
        try:
            valid.append(MyModel(**item))
        except ValidationError as e:
            errors.append({"index": i, "errors": e.errors()})
    return valid, errors
```
