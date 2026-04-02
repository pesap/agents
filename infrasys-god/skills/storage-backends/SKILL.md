---
name: storage-backends
description: Choose and configure time series storage backends (Arrow, HDF5, In-Memory, Chronify), convert between them at runtime, and optimize for HPC environments
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# Storage Backends

## When to Use
When the user needs to choose a storage backend for time series, configure storage for HPC, convert between backends, or understand performance trade-offs.

## Instructions

### Backend Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TimeSeriesStorageBase (ABC)                       │
├──────────────┬──────────────┬──────────────────┬────────────────────┤
│   Arrow      │   HDF5       │   In-Memory      │   Chronify         │
│  (default)   │              │                  │  (optional extra)  │
├──────────────┼──────────────┼──────────────────┼────────────────────┤
│ One .arrow   │ Single .h5   │ Dict in RAM      │ DuckDB/SQL         │
│ per array    │ file         │                  │                    │
│              │              │                  │                    │
│ Fast R/W     │ Compressed   │ Fastest          │ Complex queries    │
│ Disk-based   │ Disk-based   │ Ephemeral        │ Disk-based         │
│              │ Julia compat │                  │                    │
└──────────────┴──────────────┴──────────────────┴────────────────────┘
```

### Choosing a Backend

```python
from infrasys import System
from infrasys.time_series_models import TimeSeriesStorageType

# Arrow (default): best general-purpose choice
system = System(time_series_storage_type=TimeSeriesStorageType.ARROW)

# HDF5: best for large numbers of arrays, single file, compressed
system = System(time_series_storage_type=TimeSeriesStorageType.HDF5)

# In-Memory: fastest, but data lost on exit
system = System(time_series_storage_type=TimeSeriesStorageType.MEMORY)

# Chronify: SQL-powered, requires pip install "infrasys[chronify]"
system = System(time_series_storage_type=TimeSeriesStorageType.CHRONIFY)
```

### Decision Matrix

| Scenario | Recommended Backend | Why |
|----------|-------------------|-----|
| Prototyping, small data | MEMORY | Fastest, no disk I/O |
| General production use | ARROW | Good balance, default |
| 10,000+ time series arrays | HDF5 | Single file, no filesystem pressure |
| HPC shared filesystem | HDF5 | Arrow creates too many small files |
| Need SQL queries on time series | CHRONIFY | DuckDB-powered query engine |
| Julia/PowerSystems.jl interop | HDF5 | Compatible file format |
| Read-only analysis | Any + `time_series_read_only=True` | Avoids data copy |

### Storage Directory Configuration

```python
from pathlib import Path

# Custom directory (critical on HPC where /tmp is small)
system = System(
    time_series_directory=Path("/scratch/user/time_series"),
    time_series_storage_type=TimeSeriesStorageType.ARROW,
)

# Default: temp directory (cleaned up on process exit)
system = System()  # Uses tempfile.mkdtemp()
```

**HPC warning:** On NREL's HPC (Eagle/Kestrel), the default tmp filesystem is tiny. Always specify `time_series_directory="/tmp/scratch"` or similar.

### Converting Between Backends

```python
# Start in memory for fast construction
system = System(time_series_storage_type=TimeSeriesStorageType.MEMORY)
# ... add lots of time series ...

# Convert to Arrow for persistence
system.convert_storage(time_series_storage_type=TimeSeriesStorageType.ARROW)

# Or convert to HDF5 for single-file storage
system.convert_storage(time_series_storage_type=TimeSeriesStorageType.HDF5)
```

Data is preserved during conversion. All time series remain accessible with the same API.

### Read-Only Mode

Skip data copies during deserialization:

```python
# Loading a large system for analysis only
system = System.from_json(
    "huge_system.json",
    time_series_read_only=True,  # No copy, much faster
)

# Attempting to add/remove time series will raise ISOperationNotAllowed
```

### Arrow Backend Details

- Creates one `.arrow` file per time series array (UUID-named)
- Uses Apache Arrow IPC format (fast columnar reads)
- Files stored in a temp directory by default
- Serialization copies files to the output directory
- **Gotcha:** On shared filesystems (NFS, Lustre), 10,000+ small files cause metadata storms

```python
# Arrow storage internals
from infrasys.arrow_storage import ArrowTimeSeriesStorage

# The storage manages files like:
# /tmp/xyz123/
#   ├── a1b2c3d4-e5f6-7890-abcd-ef1234567890.arrow
#   ├── b2c3d4e5-f6a7-8901-bcde-f12345678901.arrow
#   └── ...
```

### HDF5 Backend Details

- Single `.h5` file for all time series
- Hierarchical organization: `/time_series/<uuid>/data`
- Supports compression (gzip by default)
- Compatible with PowerSystems.jl for Julia interop
- Use context manager for batch operations:

```python
# Batch read (keeps file handle open)
with system.open_time_series_store() as ctx:
    for gen in system.get_components(Generator):
        ts = system.get_time_series(gen, name="active_power", context=ctx)
```

### Chronify Backend Details

- Uses DuckDB as the underlying database engine
- Requires `pip install "infrasys[chronify]"` (chronify~=0.6.0)
- Best for complex temporal queries (aggregation, filtering)
- Transactional operations supported

```python
# Install the optional dependency first
# pip install "infrasys[chronify]"

system = System(
    time_series_storage_type=TimeSeriesStorageType.CHRONIFY,
    chronify_engine_name="duckdb",  # default
)
```

### In-Memory Backend Details

- Stores all arrays in a Python dict
- Fastest for read/write operations
- Data lost when the process exits
- No disk usage
- Best for testing and prototyping

### Performance Comparison

| Backend | Read Speed | Write Speed | Memory Use | Disk Use | Query Power |
|---------|-----------|-------------|------------|----------|-------------|
| Memory  | ★★★★★     | ★★★★★       | ★☆☆☆☆      | N/A      | ★★☆☆☆       |
| Arrow   | ★★★★☆     | ★★★★☆       | ★★★★☆      | ★★★☆☆    | ★★★☆☆       |
| HDF5    | ★★★☆☆     | ★★★☆☆       | ★★★★☆      | ★★★★☆    | ★★★☆☆       |
| Chronify| ★★☆☆☆     | ★★★☆☆       | ★★★★☆      | ★★★☆☆    | ★★★★★       |

### Storage Type in Serialized Systems

When you serialize a system with `to_json`, the storage type is recorded. When loading with `from_json`, the original storage type is restored. You cannot override the storage type during deserialization (a warning is logged if you try).
