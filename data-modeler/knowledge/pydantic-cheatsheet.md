# Pydantic v2 + infrasys Quick Reference

## Imports
```python
from pydantic import (
    BaseModel, ConfigDict, Field,
    field_validator, model_validator, field_serializer, computed_field,
    ValidationError, Discriminator,
)
from typing import Annotated, Literal, Self, TypeVar, Generic
from infrasys import Component, System, SingleTimeSeries
```

## ConfigDict Options
| Option | Values | Use |
|--------|--------|-----|
| `strict` | True/False | Reject wrong types instead of coercing |
| `frozen` | True/False | Make instances immutable |
| `extra` | "forbid"/"allow"/"ignore" | Handle unknown fields |
| `str_strip_whitespace` | True/False | Auto-strip strings |
| `validate_default` | True/False | Validate default values |
| `use_enum_values` | True/False | Store enum value not member |

## Field Constraints
| Constraint | Types | Example |
|-----------|-------|---------|
| `ge`, `gt`, `le`, `lt` | numeric | `Field(ge=0, lt=100)` |
| `min_length`, `max_length` | str, list | `Field(min_length=1)` |
| `pattern` | str | `Field(pattern=r"^\d+$")` |
| `default_factory` | any | `Field(default_factory=list)` |

## Validator Modes
| Decorator | Mode | Runs |
|-----------|------|------|
| `@field_validator` | `"before"` | Before type validation |
| `@field_validator` | `"after"` (default) | After type validation |
| `@model_validator` | `"before"` | Before all field validation |
| `@model_validator` | `"after"` | After all fields validated |

## infrasys Essentials
- `Component` — base class for system entities (extends BaseModel)
- `System` — container that manages components + time series
- `system.add_component(c)` / `system.get_components(Type)`
- `system.add_time_series(ts, component)`
- `system.to_json(path)` / `System.from_json(path)`
