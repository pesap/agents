# infrasys Architecture Reference

## Package: NREL/infrasys v1.1.1
- License: BSD-3-Clause
- Python: 3.11+
- Core deps: pydantic>=2.12, pyarrow>=21, numpy>=2, pandas>=2, pint~=0.23, orjson, h5py, loguru, rich

## Module Map

```
infrasys/
├── system.py                      # System class: the god object
├── component.py                   # Component base class (Pydantic + UUID)
├── component_manager.py           # CRUD for components, type-indexed dicts
├── component_associations.py      # Parent-child tracking (SQLite table)
├── supplemental_attribute.py      # SupplementalAttribute base
├── supplemental_attribute_manager.py  # Many-to-many with components
├── time_series_models.py          # SingleTimeSeries, Deterministic, NonSequential, Keys, Metadata
├── time_series_manager.py         # Orchestrates storage + metadata store
├── time_series_metadata_store.py  # SQLite-backed metadata for time series
├── time_series_storage_base.py    # ABC for storage backends
├── arrow_storage.py               # Arrow IPC files (default)
├── h5_time_series_storage.py      # HDF5 single-file storage
├── in_memory_time_series_storage.py   # Dict-based in-memory
├── chronify_time_series_storage.py    # DuckDB via chronify (optional)
├── serialization.py               # __metadata__ type system, CachedTypeHelper
├── models.py                      # InfraSysBaseModel, InfraSysBaseModelWithIdentifers
├── base_quantity.py               # BaseQuantity (pint wrapper for Pydantic)
├── quantities.py                  # Distance, Voltage, ActivePower, Energy, etc.
├── cost_curves.py                 # CostCurve, FuelCurve, UnitSystem
├── function_data.py               # Linear, Quadratic, PiecewiseLinear, PiecewiseStep
├── value_curves.py                # InputOutputCurve, IncrementalCurve, AverageRateCurve
├── normalization.py               # NormalizationMax, NormalizationByValue (deprecated on TS)
├── location.py                    # Location (Component), GeographicInfo (SupplementalAttribute)
├── exceptions.py                  # ISAlreadyAttached, ISNotStored, ISOperationNotAllowed, etc.
├── common.py                      # (empty, reserved)
├── loggers.py                     # Logging configuration
├── pint_quantities.py             # Extended pint support
├── id_manager.py                  # UUID management
├── migrations/
│   ├── db_migrations.py           # Legacy metadata store -> new schema
│   └── metadata_migration.py      # Component __metadata__ flattening
└── utils/
    ├── sqlite.py                  # ManagedConnection, backup, restore, create_in_memory_db
    ├── time_utils.py              # ISO 8601 <-> timedelta/relativedelta
    ├── h5_utils.py                # HDF5 file operations
    ├── metadata_utils.py          # SQLite table creation helpers
    ├── path_utils.py              # Temp directory cleanup
    └── classes.py                 # Class utility functions
```

## SQLite Tables (In-Memory, Backed Up to Disk on Serialize)

| Table | Purpose |
|-------|---------|
| `time_series_associations` | Who owns which time series (owner_uuid -> ts_uuid + metadata) |
| `component_associations` | Parent-child relationships between components |
| `supplemental_attribute_associations` | Component <-> SupplementalAttribute links |
| `key_value_store` | System-level metadata key-value pairs |

## Class Hierarchy

```
pydantic.BaseModel
└── InfraSysBaseModel (ConfigDict: strict validation, extra="forbid")
    └── InfraSysBaseModelWithIdentifers (+ uuid, label, example())
        ├── Component (+ name, model_dump_custom, check_component_addition)
        │   └── Location, Bus, Generator, ... (user-defined)
        ├── SupplementalAttribute (+ model_dump_custom)
        │   └── GeographicInfo, ... (user-defined)
        └── TimeSeriesData (abstract: + name, normalization)
            ├── SingleTimeSeries (data, resolution, initial_timestamp)
            ├── Deterministic (2D forecast windows)
            └── NonSequentialTimeSeries (data + explicit timestamps)

pint.Quantity
└── BaseQuantity (__base_unit__, Pydantic-compatible)
    ├── Distance ("meter"), Voltage ("volt"), ActivePower ("watt")
    ├── Energy ("watthour"), Current ("ampere"), Angle ("degree")
    └── Time ("minute"), Resistance ("ohm")
```

## Key Constants

```python
TIME_SERIES_ASSOCIATIONS_TABLE = "time_series_associations"
TIME_SERIES_METADATA_TABLE = "time_series_metadata"  # legacy
KEY_VALUE_STORE_TABLE = "key_value_store"
COMPONENT_ASSOCIATIONS_TABLE = "component_associations"
SUPPLEMENTAL_ATTRIBUTE_ASSOCIATIONS_TABLE = "supplemental_attribute_associations"
TYPE_METADATA = "__metadata__"
```

## Known Limitations / Gotchas

1. **Component reassignment breaks associations**: `gen.bus = other_bus` does not update SQLite. Call `system.rebuild_component_associations()`.
2. **Arrow + shared filesystem**: One file per array. Past ~10k arrays on NFS/Lustre, metadata operations slow to a crawl. Use HDF5.
3. **Chronify requires extra**: `pip install "infrasys[chronify]"`. Import will fail without it.
4. **Component names unique per type, not globally**: Two different types can have the same name.
5. **Abstract components return subtypes**: `get_components(Base)` returns all subtype instances. No way to filter to only the base.
6. **Normalization deprecated on TimeSeries**: Migration drops it silently.
7. **orjson for serialization**: System uses `orjson.dumps` (no indent by default). Pass `indent` param to `to_json` for human-readable output.
8. **from_json ignores time_series_storage_type kwarg**: A warning is logged. The stored type is used.
