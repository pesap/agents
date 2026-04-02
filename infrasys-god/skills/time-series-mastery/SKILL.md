---
name: time-series-mastery
description: Master time series creation, attachment, querying, slicing, deterministic forecasts, non-sequential series, normalization, and features/scenario tagging
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# Time Series Mastery

## When to Use
When the user needs to create, attach, query, slice, or manage time series data on components or supplemental attributes.

## Instructions

### Time Series Types

infrasys provides three time series types:

```
TimeSeriesData (abstract)
├── SingleTimeSeries       # 1D array with uniform timestamps
├── Deterministic          # 2D forecast windows (rows=windows, cols=steps)
└── NonSequentialTimeSeries # 1D array with explicit (non-uniform) timestamps
```

### SingleTimeSeries

The workhorse. A 1D array of floats with a start time and resolution.

```python
from datetime import datetime, timedelta
import numpy as np
from infrasys import SingleTimeSeries

# From raw array (auto-generates timestamps)
ts = SingleTimeSeries.from_array(
    data=np.random.rand(8760),
    name="active_power",
    initial_timestamp=datetime(2030, 1, 1),
    resolution=timedelta(hours=1),
)

# From explicit time array (resolution inferred)
timestamps = [datetime(2030, 1, 1) + timedelta(hours=i) for i in range(24)]
ts = SingleTimeSeries.from_time_array(
    data=np.random.rand(24),
    name="active_power",
    timestamps=timestamps,
)

# With pint quantities (units preserved through serialization)
from infrasys.quantities import ActivePower
data_mw = ActivePower(np.random.rand(8760) * 100, "megawatt")
ts = SingleTimeSeries.from_array(
    data=data_mw,
    name="active_power",
    initial_timestamp=datetime(2030, 1, 1),
    resolution=timedelta(hours=1),
)
```

### Attaching Time Series to Components

```python
from infrasys import System

system = System(name="grid")
gen = Generator(name="gen1", ...)
system.add_component(gen)

# Attach to one component
key = system.add_time_series(ts, gen)

# Attach to multiple components (shared storage, no duplication)
gen2 = Generator(name="gen2", ...)
system.add_component(gen2)
key = system.add_time_series(ts, gen, gen2)

# Tag with features (scenario, model_year, etc.)
key = system.add_time_series(ts, gen, scenario="high", model_year="2035")
```

### Querying Time Series

```python
# Get by name
ts = system.get_time_series(gen, name="active_power")

# Get by name + type
ts = system.get_time_series(gen, name="active_power", time_series_type=SingleTimeSeries)

# Get with features
ts = system.get_time_series(gen, name="active_power", scenario="high")

# Slice by start_time and length
ts_slice = system.get_time_series(
    gen,
    name="active_power",
    start_time=datetime(2030, 1, 2),
    length=24,
)

# Get by key (fastest, no lookup)
ts = system.get_time_series_by_key(gen, key)

# List all time series on a component
for ts in system.list_time_series(gen):
    print(ts.summary)

# List keys (lightweight, no data loaded)
for key in system.list_time_series_keys(gen):
    print(key)

# List metadata
for meta in system.list_time_series_metadata(gen):
    print(meta.name, meta.features)

# Check existence
if system.has_time_series(gen, name="active_power"):
    ...
```

### Deterministic Time Series (Forecasts)

2D arrays where each row is a forecast window.

```python
from infrasys.time_series_models import Deterministic

# From explicit 2D array
forecast_data = ActivePower(np.random.rand(3, 8), "watts")
ts_det = Deterministic.from_array(
    data=forecast_data,
    name="active_power_forecast",
    initial_time=datetime(2030, 1, 1),
    resolution=timedelta(hours=1),
    horizon=timedelta(hours=8),
    interval=timedelta(hours=1),
    window_count=3,
)

# "Perfect forecast" from existing SingleTimeSeries
ts_det = Deterministic.from_single_time_series(
    single_ts,
    interval=timedelta(hours=1),
    horizon=timedelta(hours=8),
)

system.add_time_series(ts_det, gen)
```

### NonSequentialTimeSeries

For data with non-uniform timestamps (e.g., event-based measurements).

```python
from infrasys import NonSequentialTimeSeries

timestamps = [
    datetime(2030, 1, 1, 0, 0),
    datetime(2030, 1, 1, 0, 15),
    datetime(2030, 1, 1, 1, 30),  # non-uniform gap
    datetime(2030, 1, 1, 3, 0),
]
ts = NonSequentialTimeSeries(
    name="measurements",
    data=np.array([1.0, 2.0, 3.0, 4.0]),
    timestamps=timestamps,
)
system.add_time_series(ts, sensor)
```

### Time Series on Supplemental Attributes

Time series can be attached to supplemental attributes too:

```python
from infrasys import SupplementalAttribute

class WeatherData(SupplementalAttribute):
    station_id: str

weather = WeatherData(station_id="KDEN")
system.add_supplemental_attribute(gen, weather)
system.add_time_series(temperature_ts, weather)
```

### Copy Time Series Between Components

```python
# Copy all time series from gen1 to gen2
system.copy_time_series(dst=gen2, src=gen1)
```

### Remove Time Series

```python
system.remove_time_series(
    gen,
    time_series_type=SingleTimeSeries,
    name="active_power",
    scenario="high",
)
```

### Resolution Types

infrasys supports both `timedelta` and `relativedelta` for resolution:

```python
from datetime import timedelta
from dateutil.relativedelta import relativedelta

# Fixed intervals
ts_hourly = SingleTimeSeries.from_array(..., resolution=timedelta(hours=1))
ts_15min = SingleTimeSeries.from_array(..., resolution=timedelta(minutes=15))

# Calendar-aware intervals
ts_monthly = SingleTimeSeries.from_array(..., resolution=relativedelta(months=1))
ts_yearly = SingleTimeSeries.from_array(..., resolution=relativedelta(years=1))
```

All resolutions are normalized to ISO 8601 during serialization (e.g., `P0DT1H`, `P1M`).

### Normalization (Deprecated)

Normalization was removed from infrasys. The migration system drops normalization fields automatically. If you need normalization, do it in your own code before creating the time series.

### Batch Time Series with open_time_series_store

For HDF5 backend, use context manager to keep the file handle open across multiple operations:

```python
with system.open_time_series_store() as context:
    for gen in system.get_components(Generator):
        ts = system.get_time_series(gen, name="active_power", context=context)
        # process ts...
```
