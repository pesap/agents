---
name: test-debugging
description: Diagnose and fix test failures using pytest's debugging tools including --lf, --pdb, traceback control, capsys, caplog, and stepwise mode
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Test Debugging

## When to Use
When tests are failing and you need to figure out why. When you have many failures and need a strategy. When test output is confusing or incomplete.

## Instructions

1. **Triage first** — Get the lay of the land before diving into any single failure:

```bash
# Run with short tracebacks to see all failures at a glance
pytest --tb=short -q

# Count failures by file
pytest --tb=no -q
```

2. **Re-run only failures** — Don't re-run the whole suite while debugging:

```bash
# Run only tests that failed last time
pytest --lf

# Run failures first, then the rest
pytest --ff

# Stop on first failure
pytest -x

# Stop after N failures
pytest --maxfail=3
```

3. **Stepwise mode** — Fix one failure at a time, pytest remembers where you left off:

```bash
# Run until first failure, then stop
pytest --stepwise

# Next run picks up where you left off
pytest --stepwise

# Reset stepwise state
pytest --stepwise-skip
```

4. **Control traceback detail** — Match the detail level to what you need:

```bash
# One-line per failure (scanning many failures)
pytest --tb=line

# Short traceback (most common, good default)
pytest --tb=short

# Full traceback (when you need the complete call stack)
pytest --tb=long

# Only the assertion message, no traceback
pytest --tb=no

# Local variables in the traceback (gold for debugging)
pytest --tb=locals
```

5. **Drop into a debugger** — When reading tracebacks isn't enough:

```bash
# Drop into pdb on every failure
pytest --pdb

# Drop into pdb on first failure and stop
pytest -x --pdb

# Use a better debugger (ipdb, pudb)
pytest --pdb --pdbcls=IPython.terminal.debugger:TerminalPdb
```

Or programmatically in a test:

```python
def test_complex_logic():
    result = complex_function(data)
    breakpoint()  # drops into pdb here
    assert result == expected
```

6. **Capture stdout/stderr** — Use pytest's capture fixtures instead of print debugging:

```python
def test_cli_output(capsys):
    main(["--verbose", "input.txt"])
    captured = capsys.readouterr()
    assert "Processing input.txt" in captured.out
    assert captured.err == ""

def test_cli_output_fd_level(capfd):
    # capfd captures at file descriptor level (catches C extensions too)
    run_native_code()
    captured = capfd.readouterr()
    assert "OK" in captured.out
```

If you need to see print output during test runs temporarily:

```bash
# Disable output capture (shows all print statements)
pytest -s

# Or combine with verbose
pytest -sv
```

7. **Capture log output** — Assert on log messages:

```python
import logging

def test_warns_on_missing_config(caplog):
    with caplog.at_level(logging.WARNING):
        load_config("nonexistent.yaml")
    assert "Config file not found" in caplog.text
    # Or check structured records
    assert any(
        r.levelname == "WARNING" and "not found" in r.message
        for r in caplog.records
    )
```

8. **Verbose assertion introspection** — pytest rewrites assertions to show intermediate values. For complex assertions, break them apart:

```python
# Bad: failure says "assert False"
def test_user(user):
    assert user.is_active and user.role == "admin" and user.email.endswith("@corp.com")

# Good: each assertion fails with a clear message
def test_user_is_active_admin_with_corp_email(user):
    assert user.is_active, f"User {user.name} should be active"
    assert user.role == "admin", f"Expected role 'admin', got '{user.role}'"
    assert user.email.endswith("@corp.com"), f"Email {user.email} not a corp address"
```

9. **Show slow tests** — Find tests that are dragging down the suite:

```bash
# Show the 10 slowest tests
pytest --durations=10

# Show ALL test durations (including fast ones)
pytest --durations=0
```

## Quick Reference

| Situation | Command |
|---|---|
| See all failures quickly | `pytest --tb=short -q` |
| Re-run only what failed | `pytest --lf` |
| Fix one at a time | `pytest --stepwise` |
| Debug interactively | `pytest -x --pdb` |
| See print output | `pytest -s` |
| Find slow tests | `pytest --durations=10` |
| See local variables | `pytest --tb=locals` |
