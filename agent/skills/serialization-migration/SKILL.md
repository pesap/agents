---
name: serialization-migration
description: Understand and implement infrasys serialization (to_json/from_json), the __metadata__ type system, composed component UUID references, data format versioning, and legacy schema migrations
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# Serialization & Migration

## When to Use
When the user needs to understand how infrasys serializes systems, debug deserialization issues, implement data format upgrades, or migrate from legacy schemas.

## Instructions

### How Serialization Works

`system.to_json("path/system.json")` produces:

```
path/
├── system.json                    # Components, attributes, system metadata
└── system_time_series/
    ├── time_series_metadata.db    # SQLite backup of in-memory metadata
    ├── <uuid>.arrow               # One per time series array (Arrow backend)
    └── ...
```

### The __metadata__ System

Every serialized object carries a `__metadata__` dict with type information:

```json
{
  "uuid": "...",
  "name": "bus1",
  "voltage": 1.1,
  "__metadata__": {
    "module": "my_package.models",
    "type": "Bus",
    "serialized_type": "base"
  }
}
```

Three serialized types exist:
- `"base"`: Normal type, deserialized by importing `module.type`
- `"composed_component"`: A component reference stored as UUID
- `"quantity"`: A pint Quantity with unit metadata

### Composed Component References

When a component contains another component, infrasys replaces the value with a UUID reference to avoid data duplication:

```json
{
  "name": "gen1",
  "bus": {
    "__metadata__": {
      "module": "my_package.models",
      "type": "Bus",
      "serialized_type": "composed_component",
      "uuid": "e503984a-3285-43b6-84c2-805eb3889210"
    }
  },
  "__metadata__": {
    "module": "my_package.models",
    "type": "Generator",
    "serialized_type": "base"
  }
}
```

During deserialization, infrasys:
1. Builds a dependency graph of component types
2. Deserializes leaf components first (no composed references)
3. Resolves UUID references to already-deserialized components
4. Builds the full component graph

### Pint Quantity Serialization

```json
{
  "distance": {
    "value": 100.0,
    "units": "kilometer",
    "__metadata__": {
      "module": "infrasys.quantities",
      "type": "Distance",
      "serialized_type": "quantity"
    }
  }
}
```

The `BaseQuantity.to_dict()` and `BaseQuantity.from_dict()` methods handle this. Custom quantity types work automatically as long as the module is importable.

### Data Format Versioning

Custom System classes should implement versioning:

```python
class MySystem(System):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._data_format_version = "2.0.0"

    @property
    def data_format_version(self) -> str | None:
        return self._data_format_version

    def handle_data_format_upgrade(
        self, data: dict, from_version, to_version
    ) -> None:
        if from_version == "1.0.0" and to_version == "2.0.0":
            # Migrate component data
            for comp in data["components"]:
                if comp["__metadata__"]["type"] == "OldGenerator":
                    comp["__metadata__"]["type"] = "Generator"
                    comp.setdefault("new_field", default_value)
```

For the composition pattern, use `upgrade_handler`:

```python
def my_upgrade_handler(data, from_version, to_version):
    # Transform data dict before deserialization
    ...

system = System.from_json("old_system.json", upgrade_handler=my_upgrade_handler)
```

### Legacy Metadata Store Migration

infrasys v1.1+ uses a new `time_series_associations` table. Old systems have a `time_series_metadata` table with a different schema.

The migration (`migrate_legacy_metadata_store`) automatically:
1. Renames `time_series_metadata` to `legacy_metadata_backup`
2. Creates new `time_series_associations` and `key_value_store` tables
3. Transforms each row:
   - `user_attributes` -> `features`
   - String timedelta resolution -> ISO 8601 (`"1:00:00"` -> `"P0DT1H"`)
   - Adds `owner_category = "Component"` (legacy had no supplemental attributes)
   - Extracts `quantity_metadata` from the metadata JSON blob
4. Drops the backup table

This happens automatically during `from_json` / `from_dict`. You do not need to call it manually.

### Component Metadata Migration

Old component serialization used a nested `fields` key:

```json
{
  "__metadata__": {
    "fields": {
      "module": "...",
      "type": "...",
      "serialized_type": "base"
    }
  }
}
```

New format flattens this:

```json
{
  "__metadata__": {
    "module": "...",
    "type": "...",
    "serialized_type": "base"
  }
}
```

`migrate_component_metadata` handles this automatically, including nested composed component references.

### SQLite Schema

The in-memory SQLite database contains these tables:

```sql
-- Time series associations (who owns what time series)
time_series_associations (
    id INTEGER PRIMARY KEY,
    time_series_uuid TEXT,
    time_series_type TEXT,
    initial_timestamp TEXT,
    resolution TEXT,         -- ISO 8601 duration
    length INTEGER,
    name TEXT,
    owner_uuid TEXT,
    owner_type TEXT,
    owner_category TEXT,     -- "Component" or "SupplementalAttribute"
    features TEXT,           -- JSON string of feature key-value pairs
    units TEXT,              -- JSON string of unit metadata
    metadata_uuid TEXT,
    horizon TEXT,            -- For Deterministic time series
    interval TEXT,           -- For Deterministic time series
    window_count INTEGER     -- For Deterministic time series
)

-- Component parent-child associations
component_associations (
    parent_uuid TEXT,
    child_uuid TEXT,
    parent_type TEXT,
    child_type TEXT
)

-- Supplemental attribute associations
supplemental_attribute_associations (
    component_uuid TEXT,
    attribute_uuid TEXT,
    component_type TEXT,
    attribute_type TEXT
)

-- Key-value store for system metadata
key_value_store (
    key TEXT PRIMARY KEY,
    value TEXT
)
```

### Debugging Serialization Issues

```python
# Inspect what a component serializes to
import orjson
print(orjson.dumps(gen.model_dump_custom(), option=orjson.OPT_INDENT_2).decode())

# Check the SQLite metadata directly
cursor = system._con.cursor()
cursor.execute("SELECT * FROM time_series_associations LIMIT 5")
for row in cursor.fetchall():
    print(row)

# Verify round-trip
system.to_json("test.json", overwrite=True)
system2 = System.from_json("test.json")
assert system.get_component(Generator, "gen1").active_power == \
    system2.get_component(Generator, "gen1").active_power
```

### CachedTypeHelper

During deserialization, `CachedTypeHelper` caches type lookups to avoid repeated `importlib.import_module` calls. It maps `(module, type)` tuples to Python classes. If deserialization fails with an import error, the type's module must be importable in the current Python environment.
