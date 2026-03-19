---
name: infrasys-integration
description: Build infrastructure systems models using the infrasys library for component management, time series, and system containers
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: data-engineering
---

# infrasys Integration

## When to Use
When the user needs to model infrastructure system components, manage time series data, or work with infrasys System containers.

## Instructions

### Core Concepts

**InfrastructureSystemsComponent:**
The base class for all system components in infrasys. Extends Pydantic BaseModel with component management features.

```python
from infrasys import Component

class Generator(Component):
    name: str
    capacity_mw: float
    fuel_type: str
```

**System Container:**
Manages collections of components with serialization and time series support.

```python
from infrasys import System

system = System(name="my_system")
gen = Generator(name="gen1", capacity_mw=100.0, fuel_type="gas")
system.add_component(gen)

# Query components
generators = system.get_components(Generator)
gen1 = system.get_component(Generator, "gen1")
```

**Time Series:**
Attach time series data to components.

```python
from infrasys import SingleTimeSeries
from datetime import datetime
import numpy as np

ts = SingleTimeSeries.from_array(
    data=np.random.rand(8760),
    variable_name="active_power",
    initial_time=datetime(2024, 1, 1),
    resolution=timedelta(hours=1),
)
system.add_time_series(ts, gen)
```

**Serialization:**
```python
# Save system to JSON
system.to_json("system.json")

# Load system from JSON
system = System.from_json("system.json")
```

### Best Practices
- Inherit from `Component` for all domain entities that belong in a System
- Use Pydantic validators on Component subclasses — they work the same as BaseModel
- Attach time series to components rather than embedding arrays in fields
- Use `supplemental_attributes` for metadata that doesn't belong on the component itself
- Serialize with `system.to_json()` for reproducible system snapshots
- Use component labels/names consistently for lookups

### Integration with Pydantic
infrasys components ARE Pydantic models. All Pydantic v2 features work:
- `Field(...)` for constraints
- `field_validator` / `model_validator` for business rules
- `ConfigDict` for model configuration
- `model_dump()` / `model_dump_json()` for serialization
