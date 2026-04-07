---
name: parallel-execution
description: Configure pytest-xdist for parallel test execution, handle resource isolation, shared fixtures across workers, and CI test splitting
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Parallel Execution

## When to Use
When the test suite takes too long, when you want to use all CPU cores locally, or when setting up parallel test runs in CI.

## Instructions

1. **Install pytest-xdist**:

```bash
uv add --dev pytest-xdist
```

2. **Basic parallel run** — Let xdist pick the worker count:

```bash
# Auto-detect CPU cores
pytest -n auto

# Fixed worker count
pytest -n 4

# Parallel with verbose (see which worker runs what)
pytest -n auto -v
```

3. **Distribution strategies** — Control how tests are assigned to workers:

```bash
# load (default): distribute tests as workers become free. Best for uneven test durations
pytest -n auto --dist load

# loadscope: group by module/class, then distribute groups. Avoids fixture re-creation
pytest -n auto --dist loadscope

# loadfile: all tests in a file go to the same worker
pytest -n auto --dist loadfile

# loadgroup: tests with the same @pytest.mark.xdist_group go to the same worker
pytest -n auto --dist loadgroup
```

4. **Group tests that share resources** — When tests need exclusive access to something:

```python
import pytest

@pytest.mark.xdist_group("database")
def test_migration_up(db):
    run_migrations(db)
    assert db.schema_version == 5

@pytest.mark.xdist_group("database")
def test_migration_down(db):
    rollback_migrations(db)
    assert db.schema_version == 0
```

5. **Isolate resources per worker** — Use `worker_id` to partition shared resources:

```python
# conftest.py
import pytest

@pytest.fixture(scope="session")
def db_name(worker_id):
    """Each worker gets its own database."""
    if worker_id == "master":
        return "test_db"  # not running in parallel
    return f"test_db_{worker_id}"

@pytest.fixture(scope="session")
def db(db_name):
    engine = create_engine(f"postgresql://localhost/{db_name}")
    create_database(engine)
    yield engine
    drop_database(engine)
```

For ports:

```python
@pytest.fixture(scope="session")
def server_port(worker_id):
    if worker_id == "master":
        return 8000
    # worker_id is "gw0", "gw1", etc.
    worker_num = int(worker_id.replace("gw", ""))
    return 8000 + worker_num + 1
```

6. **tmp_path is already safe** — pytest's `tmp_path` and `tmp_path_factory` are worker-isolated by default. No extra work needed:

```python
def test_write_output(tmp_path):
    # tmp_path is unique per test, per worker. No conflicts
    output = tmp_path / "result.json"
    output.write_text('{"ok": true}')
    assert output.exists()
```

7. **Session-scoped fixtures with xdist** — Use `tmp_path_factory` for shared session fixtures, but remember each worker has its own session:

```python
@pytest.fixture(scope="session")
def compiled_assets(tmp_path_factory):
    """Expensive build step, once per worker."""
    build_dir = tmp_path_factory.mktemp("assets")
    compile_assets(build_dir)
    return build_dir
```

If you need truly shared state across workers (rare), use `FileLock`:

```python
from filelock import FileLock

@pytest.fixture(scope="session")
def shared_db(tmp_path_factory, worker_id):
    root_tmp = tmp_path_factory.getbasetemp().parent
    lock = root_tmp / "db.lock"
    db_path = root_tmp / "shared_test.db"

    with FileLock(str(lock)):
        if not db_path.exists():
            create_and_seed_database(db_path)

    return connect(db_path)
```

8. **Configure in pyproject.toml** — Set defaults so you don't forget:

```toml
[tool.pytest.ini_options]
addopts = "-n auto"
```

Or keep parallel opt-in with a marker:

```bash
# Normal run (serial)
pytest

# Parallel when you want it
pytest -n auto
```

9. **CI test splitting** — Split tests across CI jobs for even faster feedback:

```yaml
# GitHub Actions matrix
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: pytest --splits 4 --group ${{ matrix.shard }}
```

This needs `pytest-split` (`uv add --dev pytest-split`). It uses timing data from previous runs to split evenly.

10. **Debug parallel failures** — When tests pass serially but fail in parallel:

```bash
# Run with -n0 to disable parallel (confirm it's a parallel issue)
pytest -n0

# Use --forked to isolate each test in its own process (heavier but catches state leaks)
pytest -n auto --forked

# Use pytest-randomly to detect order dependence
pytest -p randomly --randomly-seed=12345
```

## Common Gotchas
- Tests writing to the same file/port/database without isolation
- Module-level mutable globals modified by tests (use fixtures)
- Tests that assume they're the only process running
- `scope="session"` fixtures run once *per worker*, not once total
- `autouse` fixtures with side effects that conflict across workers
