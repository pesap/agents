---
name: pydantic-modeling
description: Design and build Pydantic v2 data models with proper typing, configuration, and serialization
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-engineering
---

# Pydantic v2 Data Modeling

## When to Use
When the user needs to create, refactor, or review Pydantic data models.

## Instructions

### Model Creation Workflow
1. Ask about the domain entities and their relationships
2. Identify field types, constraints, and optionality
3. Build core models first (leaf nodes with no dependencies)
4. Build composed models that reference core models
5. Add validators for business rules
6. Show valid and invalid instantiation examples

### Patterns to Apply

**Strict Configuration:**
```python
from pydantic import BaseModel, ConfigDict

class MyModel(BaseModel):
    model_config = ConfigDict(
        strict=True,
        frozen=True,
        extra="forbid",
        str_strip_whitespace=True,
    )
```

**Field Definitions:**
```python
from typing import Annotated
from pydantic import Field

name: Annotated[str, Field(min_length=1, max_length=255, description="Entity name")]
count: Annotated[int, Field(ge=0, description="Must be non-negative")]
```

**Validators:**
```python
from pydantic import field_validator, model_validator

@field_validator("email")
@classmethod
def validate_email(cls, v: str) -> str:
    if "@" not in v:
        raise ValueError("Invalid email format")
    return v.lower()

@model_validator(mode="after")
def validate_date_range(self) -> Self:
    if self.start_date >= self.end_date:
        raise ValueError("start_date must be before end_date")
    return self
```

**Discriminated Unions:**
```python
from typing import Annotated, Literal, Union
from pydantic import Discriminator

class Cat(BaseModel):
    pet_type: Literal["cat"]
    meows: int

class Dog(BaseModel):
    pet_type: Literal["dog"]
    barks: float

Pet = Annotated[Union[Cat, Dog], Discriminator("pet_type")]
```

**Generic Models:**
```python
from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class Response(BaseModel, Generic[T]):
    data: T
    count: int
```

### Serialization
Always consider:
- `model_dump()` output shape
- `model_dump_json()` for API responses
- `model_json_schema()` for documentation
- Custom serializers with `field_serializer` when needed
