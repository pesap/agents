---
name: fixtures-and-conftest
description: Design and organize pytest fixtures and conftest.py files for clean setup, proper scoping, and zero test interdependence
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Fixtures and Conftest

## When to Use
When setting up fixtures for a test suite, refactoring duplicated setup code into fixtures, or organizing conftest.py files across directories.

## Instructions

1. **Audit existing setup** — Find duplicated setup code, manual file creation, repeated object construction, and inline mocking across tests
2. **Extract fixtures** — Turn repeated setup into `@pytest.fixture` functions. Use `yield` for teardown instead of try/finally or teardown methods
3. **Scope correctly** — Choose the narrowest scope that works:
   - `function` (default): fresh per test. Use for most fixtures
   - `module`: shared across a file. Use for expensive read-only resources (db connection, loaded dataset)
   - `session`: shared across the entire run. Use for truly global setup (test server, compiled assets)
   - Avoid `class` scope since we prefer functions over classes
4. **Place in the right conftest.py** — Fixtures go in the `conftest.py` closest to where they're used:

```
tests/
├── conftest.py                  # Shared across ALL tests (db engine, base fixtures)
├── unit/
│   ├── conftest.py              # Unit-specific fixtures (in-memory fakes, factories)
│   └── test_user.py
├── integration/
│   ├── conftest.py              # Integration-specific fixtures (test db, API client)
│   └── test_api.py
```

5. **Use factory fixtures for variants** — When tests need similar but slightly different objects:

```python
@pytest.fixture
def make_user():
    def _make_user(name="Alice", role="viewer"):
        return User(name=name, role=role)
    return _make_user

def test_admin_can_delete(make_user):
    admin = make_user(role="admin")
    viewer = make_user(role="viewer")
    assert admin.can_delete(viewer.profile)
```

6. **Compose fixtures** — Small fixtures that request other fixtures. Don't build god-fixtures:

```python
@pytest.fixture
def db_session(db_engine):
    session = db_engine.create_session()
    yield session
    session.rollback()

@pytest.fixture
def populated_db(db_session, make_user):
    db_session.add(make_user(name="seed"))
    db_session.commit()
    return db_session
```

7. **Never use global mutable state** — Each fixture should be independent. If a fixture modifies state, it must clean up via `yield`

## Anti-Patterns to Fix
- Giant `conftest.py` at the root with 50+ fixtures used by only one subdirectory
- Fixtures that secretly depend on execution order
- `autouse=True` fixtures that silently modify every test (use sparingly and only for true cross-cutting concerns)
- Fixtures that return mutable objects shared across tests without copy/reset
- Manual `setUp`/`tearDown` methods instead of yield fixtures
