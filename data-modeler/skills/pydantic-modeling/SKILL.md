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

**Annotated-First Field Definitions (Preferred Style):**
Always use `Annotated` for field declarations. Even unconstrained fields benefit from descriptions:
```python
from typing import Annotated
from pydantic import Field

class Sensor(BaseModel):
    # Every field uses Annotated — no bare type hints
    name: Annotated[str, Field(min_length=1, max_length=255, description="Unique sensor identifier")]
    latitude: Annotated[float, Field(ge=-90, le=90, description="WGS84 latitude")]
    longitude: Annotated[float, Field(ge=-180, le=180, description="WGS84 longitude")]
    is_active: Annotated[bool, Field(default=True, description="Whether sensor is currently reporting")]
    tags: Annotated[list[str], Field(default_factory=list, description="Classification tags")]
```

**Discriminated Unions:**
```python
from typing import Annotated, Literal, Union
from pydantic import Discriminator, Field

class Cat(BaseModel):
    pet_type: Annotated[Literal["cat"], Field(description="Animal type discriminator")]
    meows: Annotated[int, Field(ge=0, description="Number of meows per day")]

class Dog(BaseModel):
    pet_type: Annotated[Literal["dog"], Field(description="Animal type discriminator")]
    barks: Annotated[float, Field(ge=0, description="Average barks per hour")]

Pet = Annotated[Union[Cat, Dog], Discriminator("pet_type")]
```

**Generic Models:**
```python
from typing import Annotated, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

class Response(BaseModel, Generic[T]):
    data: Annotated[T, Field(description="Response payload")]
    count: Annotated[int, Field(ge=0, description="Total number of results")]
```

### Serialization
Always consider:
- `model_dump()` output shape
- `model_dump_json()` for API responses
- `model_json_schema()` for documentation
- Custom serializers with `field_serializer` when needed
