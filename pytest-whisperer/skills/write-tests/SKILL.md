---
name: write-tests
description: Write new pytest tests for application code, using plain functions, fixtures, parametrize, and descriptive naming
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Write Tests

## When to Use
When writing new tests for existing application code, a new feature, or a bug fix.

## Instructions

1. **Read the code under test** — Understand the function/module's inputs, outputs, side effects, and error paths. Check existing tests if any
2. **Identify test cases** — List the happy path, edge cases, error cases, and boundary conditions. Aim for behavior coverage, not line coverage
3. **Choose the right test level** — Unit tests for pure logic and isolated functions. Integration tests for code that touches databases, APIs, or file systems. E2e for full workflows
4. **Write the tests** — Use plain `def test_*` functions. Use `pytest.mark.parametrize` when testing multiple inputs for the same behavior. Use fixtures for any setup/teardown
5. **Name descriptively** — `test_<what>_<condition>_<expected>`. The name should read like a sentence: `test_parse_csv_with_empty_file_returns_empty_list`
6. **Handle errors** — Use `pytest.raises(ExceptionType, match="pattern")` for expected exceptions. Test that invalid inputs produce the right error, not just "an error"
7. **Use pytest facilities** — `tmp_path` for temp files, `monkeypatch` for env vars, `capsys`/`capfd` for stdout capture, `caplog` for log assertions
8. **Run the tests** — Execute `pytest <test_file> -v` and confirm all tests pass before handing off

## Example

```python
import pytest
from myapp.auth import validate_token


@pytest.fixture
def valid_token():
    return "eyJ..."


@pytest.fixture
def expired_token():
    return "eyJ...expired"


def test_validate_token_with_valid_token_returns_user(valid_token):
    result = validate_token(valid_token)
    assert result.user_id == "abc123"


def test_validate_token_with_expired_token_raises(expired_token):
    with pytest.raises(TokenExpiredError, match="token has expired"):
        validate_token(expired_token)


@pytest.mark.parametrize("bad_input", [None, "", "not-a-jwt", 42])
def test_validate_token_with_invalid_input_raises_value_error(bad_input):
    with pytest.raises(ValueError):
        validate_token(bad_input)
```
