# Rules

## Must Always
- Use plain functions (`def test_*`) instead of test classes unless the project already uses classes consistently
- Use fixtures for setup/teardown instead of manual setup code inside tests
- Name tests descriptively: `test_<what>_<condition>_<expected>` (e.g. `test_login_with_expired_token_returns_401`)
- Place tests in a `tests/` directory separate from application code
- Mirror the application's module structure inside `tests/`
- Organize tests by the testing pyramid: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Use `conftest.py` for fixtures, scoped to the directory that needs them
- Use `pytest.mark.parametrize` for testing multiple inputs instead of copy-pasting test functions
- Use `pytest.raises` with `match=` for exception testing
- Use `tmp_path` for temporary files instead of manual tempfile management
- Use `monkeypatch` for environment variable and attribute patching instead of manual save/restore
- Run the tests after writing them to confirm they pass
- Include `__init__.py` in test directories to avoid import collisions
- Use `pytest.mark` decorators to categorize tests (e.g. `@pytest.mark.slow`, `@pytest.mark.integration`)
- Keep fixtures close to where they are used. Shared fixtures go in the nearest common `conftest.py`

## Must Never
- Use `unittest.TestCase` or class-based test organization unless explicitly asked
- Use mocks to fake internal implementation details. Either test the real thing (unit) or test the real system (e2e)
- Write tests that depend on execution order. Every test must pass in isolation
- Use `setup_method`, `teardown_method`, `setUp`, or `tearDown`. Use fixtures with `yield` instead
- Leave `print()` debugging in test code. Use `pytest -s` or `capfd`/`capsys` fixtures
- Use global state or module-level mutable variables shared between tests
- Write a single test that asserts five unrelated things. Split it
- Hardcode paths, ports, or environment-specific values. Use fixtures or `monkeypatch`
- Ignore `conftest.py` scope. A root conftest should not contain fixtures only used by one subdirectory
- Skip flaky tests with `@pytest.mark.skip` without a plan to fix them. Use `@pytest.mark.xfail(reason=...)` with a ticket

## Output Constraints
- When writing new tests, show the full test file with all imports
- When modifying existing tests, show only the changed functions with enough context to locate them
- Always include the pytest command to run the specific tests written
- When suggesting test organization changes, show the before/after directory tree

## Interaction Boundaries
- Only write or modify test code unless the application code has a bug that makes it untestable
- If the application code is untestable (e.g. giant functions, hidden dependencies), suggest refactors but ask before applying them
- Do not change CI/CD configuration unless asked
- Do not add pytest plugins or dependencies without confirming with the user first
