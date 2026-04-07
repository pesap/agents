---
name: test-data-management
description: Manage test data using factory fixtures, data files, faker, and patterns that keep test data maintainable and readable
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Test Data Management

## When to Use
When tests have bloated inline data, when fixture files are duplicated across tests, when test data is stale or brittle, or when you need realistic but reproducible test data.

## Instructions

1. **Factory fixtures** — The core pattern. Return a callable that builds objects with sensible defaults:

```python
@pytest.fixture
def make_user():
    def _make(
        name="Alice",
        email="alice@example.com",
        role="viewer",
        is_active=True,
    ):
        return User(name=name, email=email, role=role, is_active=is_active)
    return _make

def test_admin_can_delete_users(make_user):
    admin = make_user(name="Admin", role="admin")
    target = make_user(name="Bob")
    assert admin.can_delete(target)

def test_viewer_cannot_delete_users(make_user):
    viewer = make_user(role="viewer")
    target = make_user(name="Bob")
    assert not viewer.can_delete(target)
```

Each test only specifies what's *different*, not the full object. Defaults keep tests readable.

2. **factory-boy integration** — For complex models with relationships:

```bash
uv add --dev factory-boy
```

```python
import factory
from myapp.models import User, Order

class UserFactory(factory.Factory):
    class Meta:
        model = User

    name = factory.Faker("name")
    email = factory.LazyAttribute(lambda o: f"{o.name.lower().replace(' ', '.')}@test.com")
    role = "viewer"
    is_active = True

class OrderFactory(factory.Factory):
    class Meta:
        model = Order

    user = factory.SubFactory(UserFactory)
    amount = factory.Faker("pydecimal", left_digits=4, right_digits=2, positive=True)
    status = "pending"

# In conftest.py
@pytest.fixture
def make_user():
    return UserFactory

@pytest.fixture
def make_order():
    return OrderFactory

# In tests
def test_order_total(make_order):
    order = make_order(amount=99.99)
    assert order.total_with_tax() == pytest.approx(109.99, rel=0.01)
```

3. **Test data files** — For fixtures that don't belong inline (JSON payloads, CSV files, XML responses):

```
tests/
├── data/
│   ├── api_responses/
│   │   ├── user_list.json
│   │   └── error_404.json
│   ├── csv/
│   │   ├── valid_import.csv
│   │   └── malformed.csv
│   └── fixtures.yaml
├── conftest.py
└── unit/
```

Load them with a fixture:

```python
from pathlib import Path

TESTS_DIR = Path(__file__).parent

@pytest.fixture
def data_dir():
    return TESTS_DIR / "data"

@pytest.fixture
def load_json(data_dir):
    def _load(filename):
        return json.loads((data_dir / filename).read_text())
    return _load

def test_parse_user_list(load_json):
    raw = load_json("api_responses/user_list.json")
    users = parse_user_list(raw)
    assert len(users) == 3
    assert users[0].name == "Alice"
```

4. **Faker for realistic data** — When you need volume or realistic-looking data without hand-crafting:

```bash
uv add --dev faker
```

```python
from faker import Faker

fake = Faker()
Faker.seed(42)  # reproducible across runs

@pytest.fixture
def random_users():
    return [
        User(name=fake.name(), email=fake.email(), age=fake.random_int(18, 80))
        for _ in range(50)
    ]

def test_search_finds_users_by_name(random_users):
    target = random_users[0]
    results = search_users(random_users, query=target.name.split()[0])
    assert target in results
```

Always seed Faker for reproducibility. Put `Faker.seed(42)` in `conftest.py` or use `--randomly-seed`.

5. **pytest.importorskip** — For optional test dependencies:

```python
def test_parquet_export():
    pyarrow = pytest.importorskip("pyarrow")
    table = export_to_parquet(data)
    assert isinstance(table, pyarrow.Table)
```

6. **Builders for complex nested data** — When factories aren't enough:

```python
@pytest.fixture
def api_response_builder():
    """Build API response payloads with sensible defaults."""
    def _build(
        status=200,
        users=None,
        pagination=None,
    ):
        return {
            "status": status,
            "data": {
                "users": users or [{"id": 1, "name": "Alice"}],
            },
            "pagination": pagination or {"page": 1, "total": 1},
        }
    return _build

def test_parse_paginated_response(api_response_builder):
    response = api_response_builder(
        users=[{"id": i, "name": f"User{i}"} for i in range(100)],
        pagination={"page": 1, "total": 10},
    )
    result = parse_response(response)
    assert result.total_pages == 10
```

## Anti-Patterns to Fix
- 200-line dicts inlined in test functions (use factories or data files)
- Test data that duplicates production data (create minimal representations)
- Shared mutable test data modified by multiple tests (use factory fixtures that create fresh copies)
- Stale fixture files that no longer match the current schema (add a test that validates fixture shape)
- Random data without a seed (tests become non-reproducible)
