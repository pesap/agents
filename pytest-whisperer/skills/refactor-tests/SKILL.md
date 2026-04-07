---
name: refactor-tests
description: Refactor existing tests from classes to functions, eliminate mocks, fix flaky tests, and modernize a test suite to idiomatic pytest
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Refactor Tests

## When to Use
When an existing test suite uses unittest classes, excessive mocking, poor naming, duplicated setup, or other anti-patterns that make tests fragile and hard to maintain.

## Instructions

1. **Audit the test suite** — Read through the tests and categorize the problems:
   - Class-based tests (`unittest.TestCase`, `setUp`/`tearDown`)
   - Mocks replacing real behavior (`@patch`, `MagicMock` everywhere)
   - Flaky tests (order-dependent, timing-sensitive, global state)
   - Monolithic tests (one test asserting 10 things)
   - Dead tests (`@skip` with no ticket, commented-out tests)
   - Duplicated setup code across files

2. **Convert classes to functions** — Strip the class wrapper, turn methods into plain functions, convert `setUp`/`tearDown` to fixtures:

```python
# Before (unittest style)
class TestUserService(unittest.TestCase):
    def setUp(self):
        self.db = create_test_db()
        self.service = UserService(self.db)

    def tearDown(self):
        self.db.close()

    def test_create_user(self):
        user = self.service.create("Alice")
        self.assertEqual(user.name, "Alice")

# After (pytest style)
@pytest.fixture
def db():
    db = create_test_db()
    yield db
    db.close()

@pytest.fixture
def user_service(db):
    return UserService(db)

def test_create_user_returns_user_with_name(user_service):
    user = user_service.create("Alice")
    assert user.name == "Alice"
```

3. **Kill unnecessary mocks** — For each mock, ask: "What real thing is this replacing?"
   - If it's replacing a pure function: just call the real function
   - If it's replacing an external service: write an integration test instead, or use a real test double (in-memory db, local server)
   - If the code is genuinely untestable without mocks: suggest a refactor to make it testable (dependency injection, separating pure logic from I/O)

4. **Fix flaky tests** — Common causes and fixes:
   - **Order dependence**: use `pytest-randomly` to detect, then isolate shared state into fixtures
   - **Timing sensitivity**: replace `time.sleep()` with polling/retry or event-based waiting
   - **Global state**: move to fixture-based setup that resets state per test
   - **Network calls**: if hitting real services, make it an integration test with proper marks, not a unit test

5. **Split monolithic tests** — If a test has multiple unrelated assertions, split into focused tests:

```python
# Before
def test_user_workflow():
    user = create_user("Alice")
    assert user.name == "Alice"
    assert user.is_active
    token = user.generate_token()
    assert len(token) == 64
    user.deactivate()
    assert not user.is_active

# After
def test_create_user_sets_name():
    user = create_user("Alice")
    assert user.name == "Alice"

def test_new_user_is_active_by_default():
    user = create_user("Alice")
    assert user.is_active

def test_generate_token_returns_64_char_string():
    user = create_user("Alice")
    assert len(user.generate_token()) == 64

def test_deactivate_sets_user_inactive():
    user = create_user("Alice")
    user.deactivate()
    assert not user.is_active
```

6. **Clean up dead tests** — Remove `@skip`-ed tests with no associated issue. Convert `@skip` with a ticket to `@pytest.mark.xfail(reason="TICKET-123: ...")`

7. **Rename for clarity** — Apply `test_<what>_<condition>_<expected>` naming to all refactored tests

8. **Run the full suite** — After refactoring, run `pytest -v` and confirm everything passes. Run `pytest --randomly-seed=12345` to verify order independence
