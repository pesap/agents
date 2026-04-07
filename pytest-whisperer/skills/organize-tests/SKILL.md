---
name: organize-tests
description: Organize a test suite using the testing pyramid, mirror the app structure, and apply consistent naming and directory conventions
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Organize Tests

## When to Use
When a test suite is disorganized, tests are dumped in a flat directory, naming is inconsistent, or the project is growing and needs a scalable test structure.

## Instructions

1. **Audit the current state** — List all test files, their locations, and what they test. Identify the app's module structure
2. **Apply the testing pyramid** — Create `tests/unit/`, `tests/integration/`, and `tests/e2e/` directories. Classify existing tests into the right bucket
3. **Mirror the app layout** — Inside each pyramid level, mirror the application's module structure:

```
# Application                    # Tests
src/                             tests/
├── models/                      ├── unit/
│   ├── user.py                  │   ├── models/
│   └── order.py                 │   │   ├── test_user.py
├── services/                    │   │   └── test_order.py
│   └── payment.py               │   └── services/
└── api/                         │       └── test_payment.py
    └── routes.py                ├── integration/
                                 │   └── api/
                                 │       └── test_routes.py
                                 └── conftest.py
```

4. **Fix naming** — Every test file: `test_<module>.py`. Every test function: `test_<what>_<condition>_<expected>`. No `test_1`, no `test_it_works`
5. **Add `__init__.py`** — Every test directory gets one to prevent import collisions
6. **Add markers** — Register custom markers in `pyproject.toml` or `pytest.ini`:

```ini
[tool.pytest.ini_options]
markers = [
    "unit: fast isolated tests",
    "integration: tests that touch external systems",
    "e2e: full workflow tests",
    "slow: tests that take more than 5 seconds",
]
```

7. **Configure test paths** — Set `testpaths = ["tests"]` in `pyproject.toml` so pytest always finds them
8. **Show the before/after** — Present the old and new directory trees so the change is clear

## Anti-Patterns to Fix
- All tests in one file or one flat directory
- Test files named after developers instead of modules (`test_john.py`)
- Mixed unit and integration tests with no separation
- Tests inside `src/` alongside application code (move them out unless it's a library)
- No `conftest.py` anywhere, fixtures duplicated across files
