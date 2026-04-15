---
name: component-modeling
description: Design Component subclasses, handle composition and associations, use supplemental attributes, manage pint quantities, and implement proper copy semantics
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# Component Modeling

## When to Use
When the user needs to design component hierarchies, understand composed component relationships, use supplemental attributes, work with pint quantities, or manage component copy/deepcopy behavior.

## Instructions

### Component Base Class

Every entity in a System inherits from `Component`:

```python
from typing import Annotated, Literal
from pydantic import Field
from infrasys import Component

class Bus(Component):
    """Represents an electrical bus."""
    voltage: Annotated[float, Field(gt=0, description="Per-unit voltage")]
    coordinates: "Location | None" = None

    @classmethod
    def example(cls) -> "Bus":
        from infrasys.location import Location
        return Bus(name="bus-1", voltage=1.05, coordinates=Location(x=0.0, y=0.0))
```

Key facts:
- `name` is required (inherited, frozen after construction)
- `uuid` is auto-generated (also inherited)
- `label` property returns `"ClassName.name"` (e.g., `"Bus.bus-1"`)
- `model_config` forbids extra fields, validates assignments

### Inheritance: The Cardinal Rule

**A Component that has subclasses should never be instantiated directly.**

```python
# BAD: Load has subclasses but is also instantiated
class Load(Component):
    power: float

class CustomLoad(Load):
    custom_field: float

# system.get_components(Load) returns BOTH Load and CustomLoad instances
# There is no way to get only Load instances
```

```python
# GOOD: Abstract base with concrete subtypes
class LoadBase(Component):
    """Abstract base, never instantiated."""
    power: Annotated[float, Field(gt=0)]

class ResidentialLoad(LoadBase):
    """Residential load component."""
    num_customers: Annotated[int, Field(ge=1)]

class IndustrialLoad(LoadBase):
    """Industrial load component."""
    process_type: Annotated[Literal["continuous", "batch"], Field()]

# system.get_components(LoadBase) returns both subtypes
# system.get_components(ResidentialLoad) returns only residential
```

### Composed Components (Parent-Child)

When a component contains another component, infrasys tracks the association:

```python
class Generator(Component):
    bus: Bus  # This creates a parent(Generator) -> child(Bus) association
    active_power: Annotated[float, Field(ge=0)]
    rating: Annotated[float, Field(ge=0)]
    available: bool

# The System tracks these associations in SQLite
gen = system.get_component(Generator, "gen1")
bus = gen.bus  # Direct access

# Reverse lookup: find all components connected to a bus
parents = system.list_parent_components(bus)
generators_on_bus = system.list_parent_components(bus, component_type=Generator)

# Forward lookup: find all child components of a generator
children = system.list_child_components(gen)
buses = system.list_child_components(gen, component_type=Bus)
```

**The reassignment trap:**
```python
# This silently breaks associations!
gen.bus = other_bus

# You MUST rebuild after reassignment
system.rebuild_component_associations()
```

### Lists of Composed Components

infrasys also tracks lists of components:

```python
class Subsystem(Component):
    generators: list[Generator]  # Each generator is tracked as a child
    buses: list[Bus]
```

### Supplemental Attributes

Many-to-many metadata that does not belong on the component itself:

```python
from infrasys import SupplementalAttribute
from pydantic import Field
from typing import Annotated, Any

class GeographicInfo(SupplementalAttribute):
    geo_json: Annotated[dict[str, Any], Field(description="GeoJSON data")]

    @classmethod
    def example(cls) -> "GeographicInfo":
        return cls(geo_json={
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [125.6, 10.1]},
        })

# Attach to components
geo = GeographicInfo.example()
system.add_supplemental_attribute(bus, geo)
system.add_supplemental_attribute(gen, geo)  # Same attribute, multiple components

# Query
attrs = system.get_supplemental_attributes_with_component(gen)
components = system.get_components_with_supplemental_attribute(geo)
has_geo = system.has_supplemental_attribute(gen, GeographicInfo)
```

### Pint Quantities

Use `BaseQuantity` subclasses for fields with physical units:

```python
from infrasys.base_quantity import BaseQuantity
from infrasys.quantities import ActivePower, Voltage, Distance

class TransmissionLine(Component):
    length: Annotated[Distance, Field(description="Line length")]
    rating: Annotated[ActivePower, Field(description="Thermal rating")]

# Construction with units
line = TransmissionLine(
    name="line-1",
    length=Distance(100, "kilometer"),
    rating=ActivePower(500, "megawatt"),
)

# Unit conversion is automatic
print(line.length.to("mile"))  # Converts km to miles
print(line.rating.to("watt"))  # Converts MW to W
```

Creating custom quantities:
```python
from infrasys.base_quantity import BaseQuantity

class Pressure(BaseQuantity):
    __base_unit__ = "pascal"

class MassFlowRate(BaseQuantity):
    __base_unit__ = "kilogram / second"
```

Quantities serialize with unit metadata:
```json
{
  "length": {
    "value": 100,
    "units": "kilometer",
    "__metadata__": {
      "module": "infrasys.quantities",
      "type": "Distance",
      "serialized_type": "quantity"
    }
  }
}
```

### Copy vs Deepcopy

```python
# copy_component: new UUID, SHARED references to composed components
gen2 = system.copy_component(gen, name="gen2")
# gen2.bus IS gen.bus (same object)
# Use when adding variants to the SAME system

# deepcopy_component: identical UUIDs/names, NO shared references
gen_clone = system.deepcopy_component(gen)
# gen_clone.bus is a different object with the same UUID
# Use when creating copies for a DIFFERENT system

# copy_component with auto-attach
gen3 = system.copy_component(gen, name="gen3", attach=True)
```

### Component Removal

```python
# Remove with cascade (default): removes orphaned children
system.remove_component(gen)

# Remove without cascade: keep children even if orphaned
system.remove_component(gen, cascade_down=False)

# Force remove: even if other components reference this one
system.remove_component(bus, force=True)

# Remove by name or UUID
system.remove_component_by_name(Generator, "gen1")
system.remove_component_by_uuid(some_uuid)
```

### Batch Update

```python
# Scale all generator ratings by 1.1
system.update_components(
    Generator,
    update_func=lambda g: setattr(g, 'rating', g.rating * 1.1),
)

# Update only active generators
system.update_components(
    Generator,
    update_func=lambda g: setattr(g, 'active_power', 0.0),
    filter_func=lambda g: not g.available,
)
```

### check_component_addition

Override this for custom validation when a component is added to a system:

```python
class StrictBus(Component):
    voltage: Annotated[float, Field(gt=0, le=2.0)]

    def check_component_addition(self) -> None:
        if self.voltage > 1.5:
            raise ValueError(f"Voltage {self.voltage} exceeds safe limit")
```
