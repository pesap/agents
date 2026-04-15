---
name: system-design
description: Design and build custom System classes, manage component lifecycles, handle composition vs inheritance patterns, and implement data format versioning
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# System Design

## When to Use
When the user needs to create a custom System class, manage component lifecycles, decide between composition and inheritance for their System, or implement data format versioning and upgrade handlers.

## Instructions

### The System Class

`System` is the root container. It owns components, time series, supplemental attributes, and the SQLite metadata store.

```python
from infrasys import System

# Basic usage
system = System(name="my-grid", description="Test grid model")

# With auto-add for composed components (e.g., gen.bus gets added automatically)
system = System(name="my-grid", auto_add_composed_components=True)

# With custom time series directory (critical on HPC)
system = System(name="my-grid", time_series_directory="/tmp/scratch")

# Context manager for clean resource cleanup
with System(name="my-grid") as system:
    # ... build your system ...
    system.to_json("output/system.json")
```

### Custom System (Inheritance Pattern)

For packages that need custom attributes serialized alongside the system:

```python
from typing import Any
from infrasys import System

class PowerSystem(System):
    """Custom system with domain-specific attributes."""

    def __init__(self, base_power_mw: float = 100.0, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.base_power_mw = base_power_mw
        self._data_format_version = "1.0.0"

    @property
    def data_format_version(self) -> str | None:
        return self._data_format_version

    @data_format_version.setter
    def data_format_version(self, value: str) -> None:
        self._data_format_version = value

    def serialize_system_attributes(self) -> dict[str, Any]:
        return {"base_power_mw": self.base_power_mw}

    def deserialize_system_attributes(self, data: dict[str, Any]) -> None:
        self.base_power_mw = data["base_power_mw"]

    def handle_data_format_upgrade(
        self, data: dict[str, Any], from_version, to_version
    ) -> None:
        # Handle migrations between versions
        if from_version is None and to_version == "1.0.0":
            data.setdefault("base_power_mw", 100.0)
```

### Custom System (Composition Pattern)

For packages that want to hide the infrasys System from users:

```python
from infrasys import System

class MyPlatform:
    def __init__(self, name: str):
        self._system = System(name=name, auto_add_composed_components=True)

    def add_device(self, device):
        self._system.add_component(device)

    def save(self, path: str):
        data = {"platform_version": "2.0", "custom_field": "value"}
        self._system.to_json(path, data=data)

    @classmethod
    def load(cls, path: str):
        system = System.from_json(path)
        platform = cls.__new__(cls)
        platform._system = system
        return platform
```

### Component Lifecycle

```
┌─────────────┐    add_component()    ┌──────────────┐
│  Component   │ ──────────────────►  │    System     │
│  (detached)  │                      │  (attached)   │
└─────────────┘                      └──────────────┘
       │                                     │
       │  check_component_addition()         │  Associations tracked
       │  UUID assigned                      │  Parent/child indexed
       │  Name frozen                        │  Time series attachable
```

Components go through:
1. Construction (Pydantic validation fires)
2. `check_component_addition()` called by System
3. Added to ComponentManager's type-indexed dicts
4. ComponentAssociations scans for composed components
5. Now queryable via `get_component`, `get_components`, `list_parent_components`

### auto_add_composed_components

When `True`, if a component references another component (e.g., `gen.bus`) that is not yet in the system, the System will add it automatically. When `False` (default), an `ISOperationNotAllowed` is raised.

```python
# Explicit add order (default, safer)
system = System(name="grid")
bus = Bus(name="bus1", voltage=1.1)
system.add_component(bus)
gen = Generator(name="gen1", bus=bus, active_power=1.0, rating=1.0, available=True)
system.add_component(gen)

# Auto-add (convenient, less control)
system = System(name="grid", auto_add_composed_components=True)
gen = Generator(name="gen1", bus=Bus(name="bus1", voltage=1.1), ...)
system.add_component(gen)  # bus gets added automatically
```

### Data Format Versioning

infrasys calls `handle_data_format_upgrade` during `from_json` when the stored version differs from the current version. This is the hook for data migrations.

### Component Queries

```python
# Single component (exact type + name)
gen = system.get_component(Generator, "gen1")

# By UUID
gen = system.get_component_by_uuid(some_uuid)

# By label string
gen = system.get_component_by_label("Generator.gen1")

# Iterate all of a type (includes subtypes)
for gen in system.get_components(Generator):
    print(gen.label)

# Filter with a function
big_gens = system.get_components(
    Generator, filter_func=lambda g: g.active_power > 100
)

# Get all component types stored
for ctype in system.get_component_types():
    print(ctype.__name__)

# Tabular export for pandas/polars
import pandas as pd
df = pd.DataFrame.from_records(system.to_records(Generator))
```

### Save and Load

```python
# JSON (creates system.json + system_time_series/ directory)
system.to_json("output/system.json")
system2 = System.from_json("output/system.json")

# Directory with save()
system.save("output/my_system/")

# Zip archive
system.save("output/my_system/", zip=True)
loaded = System.load("output/my_system.zip")
```
