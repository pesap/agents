---
name: parametrize-mastery
description: Advanced pytest.mark.parametrize patterns including table-driven tests, indirect parametrize, combinatorial stacking, external test data, and readable IDs
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Parametrize Mastery

## When to Use
When testing multiple inputs/outputs for the same behavior, building combinatorial test matrices, loading test cases from external files, or making parametrized output readable in CI.

## Instructions

1. **Basic table-driven tests** — Use `parametrize` instead of copy-pasting test functions:

```python
import pytest

@pytest.mark.parametrize("input_val, expected", [
    ("hello world", 2),
    ("", 0),
    ("one", 1),
    ("a  b  c", 3),
])
def test_word_count(input_val, expected):
    assert word_count(input_val) == expected
```

2. **Readable IDs** — Always add `id=` so failures make sense in CI output:

```python
@pytest.mark.parametrize("input_val, expected", [
    pytest.param("hello world", 2, id="two-words"),
    pytest.param("", 0, id="empty-string"),
    pytest.param("a  b  c", 3, id="multiple-spaces"),
])
def test_word_count(input_val, expected):
    assert word_count(input_val) == expected
```

Or use the `ids=` keyword for a cleaner split:

```python
@pytest.mark.parametrize(
    "input_val, expected",
    [("hello world", 2), ("", 0), ("a  b  c", 3)],
    ids=["two-words", "empty-string", "multiple-spaces"],
)
def test_word_count(input_val, expected):
    assert word_count(input_val) == expected
```

3. **Combinatorial stacking** — Stack multiple `parametrize` decorators to get the cartesian product:

```python
@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "DELETE"])
@pytest.mark.parametrize("auth", ["valid_token", "expired_token", "no_token"])
def test_endpoint_auth(client, method, auth):
    # Runs 4 x 3 = 12 test cases
    response = client.request(method, "/resource", auth=auth)
    if auth == "valid_token":
        assert response.status_code != 401
    else:
        assert response.status_code == 401
```

4. **Indirect parametrize** — Parametrize a fixture instead of the test function. Useful when setup is complex:

```python
@pytest.fixture
def db_with_records(request):
    """Create a db with N records based on the param."""
    db = create_test_db()
    for i in range(request.param):
        db.insert({"id": i, "name": f"user_{i}"})
    yield db
    db.close()

@pytest.mark.parametrize("db_with_records", [0, 1, 100, 10_000], indirect=True)
def test_query_returns_all_records(db_with_records):
    assert len(db_with_records.query_all()) == db_with_records.count()
```

5. **Conditional marks per param** — Skip or xfail specific cases:

```python
@pytest.mark.parametrize("n, expected", [
    pytest.param(0, 0, id="zero"),
    pytest.param(1, 1, id="one"),
    pytest.param(-1, None, id="negative", marks=pytest.mark.xfail(raises=ValueError)),
    pytest.param(1_000_000, 1_000_000, id="large", marks=pytest.mark.slow),
])
def test_process(n, expected):
    assert process(n) == expected
```

6. **Load test cases from files** — For large test matrices, keep data in JSON/YAML:

```python
import json

def load_cases(path):
    with open(path) as f:
        data = json.load(f)
    return [pytest.param(c["input"], c["expected"], id=c["id"]) for c in data]

@pytest.mark.parametrize("input_val, expected", load_cases("tests/data/word_count_cases.json"))
def test_word_count(input_val, expected):
    assert word_count(input_val) == expected
```

7. **Parametrize classes (when forced)** — If the project uses classes, parametrize still works:

```python
@pytest.mark.parametrize("value", [1, 2, 3])
class TestArithmetic:
    def test_positive(self, value):
        assert value > 0

    def test_doubled(self, value):
        assert value * 2 == value + value
```

## Anti-Patterns to Fix
- Copy-pasted test functions that differ only in input values
- `for` loops inside a single test function (failures don't identify which iteration broke)
- Parametrize with no IDs (output shows `test_foo[val0-val1]` which means nothing)
- Huge inline parametrize lists that should live in a data file
