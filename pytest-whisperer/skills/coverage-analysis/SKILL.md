---
name: coverage-analysis
description: Configure pytest-cov for coverage reporting, set thresholds, interpret reports, and decide what to cover versus what to exclude
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Coverage Analysis

## When to Use
When setting up coverage reporting, interpreting coverage gaps, configuring coverage thresholds for CI, or deciding what code paths actually need test coverage.

## Instructions

1. **Basic setup** — Install and run pytest-cov:

```bash
uv add --dev pytest-cov

# Run with coverage
pytest --cov=src --cov-report=term-missing

# The --cov-report=term-missing flag shows which lines are uncovered
```

2. **Configure in pyproject.toml** — Don't pass flags every time:

```toml
[tool.pytest.ini_options]
addopts = "--cov=src --cov-report=term-missing"

[tool.coverage.run]
source = ["src"]
branch = true  # Track branch coverage, not just line coverage

[tool.coverage.report]
# Fail if coverage drops below threshold
fail_under = 80
show_missing = true
# Exclude lines that don't need coverage
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.",
    "@overload",
    "raise NotImplementedError",
    "\\.\\.\\.",  # ellipsis in abstract methods
]

[tool.coverage.paths]
# Normalize paths so CI and local match
source = ["src/"]
```

3. **Branch coverage matters** — Line coverage misses conditional logic. Always enable `branch = true`:

```python
# This function has 100% line coverage with just one test
# but only 50% branch coverage
def process(value):
    result = "default"
    if value > 0:        # branch: True path AND False path
        result = "positive"
    return result

# test_process_positive covers the True branch
# You also need test_process_zero for the False branch
```

4. **Multiple report formats** — Generate different reports for different audiences:

```bash
# Terminal with missing lines (developer)
pytest --cov=src --cov-report=term-missing

# HTML report (detailed drill-down)
pytest --cov=src --cov-report=html
# Open htmlcov/index.html in browser

# XML report (CI integration, Codecov/Coveralls)
pytest --cov=src --cov-report=xml

# Combine multiple reports
pytest --cov=src --cov-report=term-missing --cov-report=xml --cov-report=html
```

5. **Interpret the report** — Focus on what matters:

```
Name                    Stmts   Miss Branch BrPart  Cover   Missing
-------------------------------------------------------------------
src/auth.py                45      3     12      2    91%   34-36, 45->47
src/models/user.py         62      0     18      0   100%
src/services/payment.py    88     22     30     11    70%   45-67, 89-102
```

- **Missing column**: Line numbers and branch arrows (`45->47` means the branch at line 45 going to 47 is untested)
- **Focus on high-risk uncovered code**: auth, payment, data validation. Not getters/setters
- **Don't chase 100%**: 80-90% with good branch coverage on critical paths beats 100% with shallow tests

6. **Exclude what shouldn't be covered** — Some code legitimately doesn't need tests:

```python
# Type checking imports (never run at runtime)
if TYPE_CHECKING:  # pragma: no cover
    from expensive_module import HeavyType

# Abstract methods
class BaseProcessor:
    def process(self, data):  # pragma: no cover
        raise NotImplementedError

# Debug/development helpers
def _debug_dump(obj):  # pragma: no cover
    print(json.dumps(obj, indent=2))
```

7. **Coverage in CI** — Set a floor, not a ceiling:

```toml
[tool.coverage.report]
fail_under = 80  # CI fails if coverage drops below 80%
```

Start with the current coverage as the floor and ratchet it up as you write more tests. Never lower it.

8. **Diff coverage** — Check that new/changed code is covered, not just overall percentage:

```bash
# Using diff-cover with a coverage XML
uv add --dev diff-cover
pytest --cov=src --cov-report=xml
diff-cover coverage.xml --compare-branch=main --fail-under=90
```

This catches the "overall coverage is fine but the new code has zero tests" problem.

## What NOT to Do
- Don't target 100% coverage. It leads to useless tests that assert implementation details
- Don't add `# pragma: no cover` to code that's just hard to test. Fix the design instead
- Don't measure coverage without branch coverage enabled. Line-only coverage lies about conditionals
- Don't treat coverage as a quality metric. High coverage with bad assertions is worse than moderate coverage with thorough assertions
