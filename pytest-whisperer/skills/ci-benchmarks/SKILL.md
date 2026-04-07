---
name: ci-benchmarks
description: Set up continuous benchmarking in CI using pytest-benchmark and github-action-benchmark for performance regression detection with chart visualization
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# CI Benchmarks

## When to Use
When you need continuous performance monitoring in CI, want to detect regressions on every PR, or need benchmark history visualized on GitHub Pages. This uses pytest-benchmark for running benchmarks and github-action-benchmark for tracking and alerting.

## Background

The setup has two parts:
1. **pytest-benchmark** — A pytest plugin that runs benchmarks and outputs JSON results
2. **github-action-benchmark** — A GitHub Action that stores results, generates charts on GitHub Pages, and alerts on regressions

Together they give you: benchmark on every push, charts over time, alert comments on commits when performance degrades.

## Instructions

### Part 1: Writing Benchmarks with pytest-benchmark

1. **Install pytest-benchmark**:

```bash
uv add --dev pytest-benchmark
```

2. **Write benchmark tests** — Use the `benchmark` fixture:

```python
# tests/benchmarks/test_perf.py
import pytest
from myapp.parser import parse_document
from myapp.search import search_index

# The benchmark fixture auto-instruments timing
def test_parse_small_document(benchmark):
    data = "Hello world " * 100
    result = benchmark(parse_document, data)
    assert result is not None  # sanity check the output

def test_parse_large_document(benchmark):
    data = "Hello world " * 100_000
    result = benchmark(parse_document, data)
    assert result is not None

def test_search_index_lookup(benchmark):
    index = build_test_index()
    result = benchmark(search_index, index, query="hello")
    assert len(result) > 0
```

3. **Benchmark with setup** — When setup shouldn't be timed:

```python
def test_sort_large_list(benchmark):
    data = list(range(100_000, 0, -1))  # setup (not timed by default)
    benchmark(sorted, data)

# Or use pedantic mode for explicit control:
def test_sort_pedantic(benchmark):
    data = list(range(100_000, 0, -1))
    benchmark.pedantic(
        sorted,
        args=(data,),
        rounds=50,
        iterations=3,
        warmup_rounds=5,
    )
```

4. **Parametrized benchmarks** — Compare performance across inputs:

```python
@pytest.mark.parametrize("size", [100, 1_000, 10_000, 100_000])
def test_sort_scaling(benchmark, size):
    data = list(range(size, 0, -1))
    benchmark(sorted, data)
```

5. **Group benchmarks** — Add grouping for organized output:

```python
@pytest.mark.benchmark(group="parsing")
def test_parse_json(benchmark):
    benchmark(json.loads, '{"key": "value"}')

@pytest.mark.benchmark(group="parsing")
def test_parse_yaml(benchmark):
    benchmark(yaml.safe_load, "key: value")
```

6. **Run benchmarks locally**:

```bash
# Run benchmarks
pytest tests/benchmarks/ --benchmark-only

# Compare against a saved baseline
pytest tests/benchmarks/ --benchmark-compare=baseline.json

# Save a baseline
pytest tests/benchmarks/ --benchmark-save=baseline

# JSON output for CI
pytest tests/benchmarks/ --benchmark-json=output.json

# Skip benchmarks during normal test runs
pytest --benchmark-disable
```

7. **Configure in pyproject.toml**:

```toml
[tool.pytest.ini_options]
# Disable benchmarks by default (run explicitly with --benchmark-only)
addopts = "--benchmark-disable"

markers = [
    "benchmark: performance benchmark tests",
]
```

8. **Separate benchmark tests** — Keep them out of the unit test path:

```
tests/
├── unit/
├── integration/
├── benchmarks/
│   ├── __init__.py
│   ├── conftest.py          # benchmark-specific fixtures
│   ├── test_parser_perf.py
│   └── test_search_perf.py
└── conftest.py
```

### Part 2: CI Integration with github-action-benchmark

9. **GitHub Actions workflow** — Run benchmarks on push and track results:

```yaml
# .github/workflows/benchmark.yml
name: Benchmark
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: write
  deployments: write
  pull-requests: write

jobs:
  benchmark:
    name: Performance regression check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Set up Python
        run: uv python install

      - name: Install dependencies
        run: uv sync --dev

      - name: Run benchmarks
        run: |
          uv run pytest tests/benchmarks/ \
            --benchmark-only \
            --benchmark-json=benchmark-output.json

      - name: Store benchmark result
        uses: benchmark-action/github-action-benchmark@v1
        with:
          name: Python Benchmarks
          tool: pytest
          output-file-path: benchmark-output.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
          auto-push: true
          alert-threshold: "150%"
          comment-on-alert: true
          fail-on-alert: true
          alert-comment-cc-users: "@yourusername"
```

10. **Understand the action inputs**:

| Input | Purpose | Recommended |
|---|---|---|
| `tool` | Benchmark tool format | `pytest` for pytest-benchmark |
| `output-file-path` | Path to JSON output | `benchmark-output.json` |
| `auto-push` | Push results to gh-pages | `true` for main branch |
| `alert-threshold` | Regression % to trigger alert | `150%` (1.5x slower) |
| `fail-on-alert` | Fail the workflow on regression | `true` |
| `comment-on-alert` | Comment on the commit | `true` |
| `gh-pages-branch` | Branch for chart data | `gh-pages` (default) |
| `benchmark-data-dir-path` | Directory on gh-pages | `dev/bench` (default) |

11. **Only auto-push on main** — Prevent PR branches from pushing to gh-pages:

```yaml
      - name: Store benchmark result
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: pytest
          output-file-path: benchmark-output.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # Only push to gh-pages from main branch
          auto-push: ${{ github.ref == 'refs/heads/main' }}
          alert-threshold: "150%"
          comment-on-alert: true
          fail-on-alert: true
```

12. **Cache-based approach** — Alternative to gh-pages, uses action cache for simpler setup:

```yaml
      - name: Download previous benchmark data
        uses: actions/cache@v4
        with:
          path: ./cache
          key: ${{ runner.os }}-benchmark

      - name: Store benchmark result
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: pytest
          output-file-path: benchmark-output.json
          external-data-json-path: ./cache/benchmark-data.json
          fail-on-alert: true
          alert-threshold: "150%"
```

This skips gh-pages entirely. Simpler, but no public chart.

13. **Custom benchmark output** — For benchmarks not using pytest-benchmark, create a JSON file in the expected format:

```python
# generate_benchmark.py
import json
import time

results = []
start = time.perf_counter()
my_function()
duration = time.perf_counter() - start

results.append({
    "name": "my_function",
    "unit": "seconds",
    "value": duration,
    "range": "0.01",
    "extra": f"Ran on {platform.machine()}"
})

with open("custom-benchmark.json", "w") as f:
    json.dump(results, f)
```

Use with `tool: customSmallerIsBetter` or `tool: customBiggerIsBetter`.

### Part 3: Local Workflow

14. **Developer workflow** — Compare before/after locally:

```bash
# Save current performance as baseline
uv run pytest tests/benchmarks/ --benchmark-save=before

# Make changes...

# Compare against baseline
uv run pytest tests/benchmarks/ --benchmark-compare=0001_before

# If happy, push. CI handles the rest
```

## Anti-Patterns to Fix
- Benchmarks mixed with unit tests (separate into `tests/benchmarks/`)
- No `--benchmark-disable` default (benchmarks slow down every test run)
- `auto-push: true` on PR branches (pollutes gh-pages with branch data)
- Alert threshold too tight (100%) causing false failures from CI noise
- No benchmark sanity assertions (benchmark runs but doesn't check correctness)
