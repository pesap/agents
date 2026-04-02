# infrasys API Cheatsheet

## Imports
```python
from infrasys import (
    Component, System, SingleTimeSeries, Deterministic,
    NonSequentialTimeSeries, Location, GeographicInfo,
    SupplementalAttribute, BaseQuantity, TimeSeriesKey,
    SingleTimeSeriesKey, TimeSeriesStorageType, NormalizationModel,
)
from infrasys.quantities import ActivePower, Voltage, Distance, Energy, Current, Angle, Time, Resistance
from infrasys.base_quantity import BaseQuantity, ureg
from infrasys.cost_curves import CostCurve, FuelCurve, UnitSystem
from infrasys.value_curves import InputOutputCurve, IncrementalCurve, AverageRateCurve, LinearCurve
from infrasys.function_data import (
    LinearFunctionData, QuadraticFunctionData,
    PiecewiseLinearData, PiecewiseStepData, XYCoords,
)
from infrasys.time_series_models import TimeSeriesStorageType, TimeSeriesData, TimeSeriesMetadata
```

## System API

| Method | Returns | Description |
|--------|---------|-------------|
| `System(name, ...)` | System | Create system (kwargs: auto_add_composed_components, time_series_storage_type, time_series_directory, time_series_read_only) |
| `to_json(filename)` | None | Serialize to JSON + time series files |
| `from_json(filename)` | System | Deserialize from JSON |
| `save(fpath, zip=False)` | None | Save to directory or zip |
| `load(zip_path)` | System | Load from zip archive |
| `add_component(c)` | None | Add single component |
| `add_components(c1, c2)` | None | Add multiple components |
| `get_component(Type, name)` | T | Get by type + name |
| `get_component_by_uuid(uuid)` | Any | Get by UUID |
| `get_component_by_label(label)` | Any | Get by "Type.name" string |
| `get_components(*Types, filter_func)` | Iterable[T] | Iterate matching components |
| `get_component_types()` | Iterable[Type] | All stored types |
| `remove_component(c, cascade_down, force)` | None | Remove component |
| `copy_component(c, name, attach)` | T | Shallow copy (shared refs) |
| `deepcopy_component(c)` | T | Deep copy (independent) |
| `update_components(Type, func, filter)` | None | Batch update |
| `to_records(Type, filter_func)` | Iterable[dict] | For pandas/polars DataFrames |
| `list_parent_components(c, type)` | list | Components that reference c |
| `list_child_components(c, type)` | list | Components that c references |
| `rebuild_component_associations()` | None | Rebuild after reassignment |
| `has_component(c)` | bool | Check if attached |

## Time Series API

| Method | Returns | Description |
|--------|---------|-------------|
| `add_time_series(ts, *owners, **features)` | TimeSeriesKey | Attach time series |
| `get_time_series(owner, name, type, start_time, length, **features)` | TimeSeriesData | Retrieve time series |
| `get_time_series_by_key(owner, key)` | TimeSeriesData | Get by key (fast) |
| `list_time_series(owner, name, type, **features)` | list[TimeSeriesData] | List matching TS |
| `list_time_series_keys(owner, name, type, **features)` | list[TimeSeriesKey] | List keys (no data) |
| `list_time_series_metadata(owner, name, type, **features)` | list[Metadata] | List metadata |
| `has_time_series(owner, name, type, **features)` | bool | Check existence |
| `copy_time_series(dst, src)` | None | Copy all TS from src to dst |
| `remove_time_series(owner, type, name, **features)` | None | Remove TS |
| `convert_storage(time_series_storage_type)` | None | Switch backend at runtime |
| `open_time_series_store()` | context | Keep file handle open (HDF5) |

## Supplemental Attributes API

| Method | Returns | Description |
|--------|---------|-------------|
| `add_supplemental_attribute(component, attr)` | None | Attach attribute |
| `get_supplemental_attributes_with_component(c, type, filter)` | list | Attrs on component |
| `get_components_with_supplemental_attribute(attr)` | list | Components with attr |
| `has_supplemental_attribute(c, type)` | bool | Check existence |
| `remove_supplemental_attribute(attr)` | None | Remove attribute + TS |
| `remove_supplemental_attribute_from_component(c, attr)` | None | Unlink only |

## SingleTimeSeries Creation

| Factory | Signature |
|---------|-----------|
| `from_array` | `(data, name, initial_timestamp, resolution)` |
| `from_time_array` | `(data, name, timestamps)` — resolution inferred |
| Direct | `SingleTimeSeries(data=..., name=..., resolution=..., initial_timestamp=...)` |

## Exceptions

| Exception | When |
|-----------|------|
| `ISAlreadyAttached` | Component/TS already in system |
| `ISNotStored` | Component/TS not found |
| `ISOperationNotAllowed` | Invalid operation (read-only, multiple matches, etc.) |
| `ISDuplicateNames` | Duplicate type+name |
| `ISFileExists` | Output file already exists |
| `ISConflictingArguments` | Conflicting kwargs |
| `ISInvalidParameter` | Bad parameter value |
