---
name: performance-tests
description: Write tests that detect performance regressions using CPU instruction counts and snapshot-based assertions
license: MIT
allowed-tools: Read Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: testing
---

# Performance Tests

## When to Use
When you need to catch performance regressions early in local test runs, before CI benchmarks. This complements (not replaces) proper benchmarks in CI.

## Background

The idea: instead of measuring wall-clock time (noisy, hardware-dependent), measure CPU instruction counts. If the instruction count changes, performance *might* have changed. It's an early warning, not a verdict.

Two approaches exist:
- **Real CPU counters** via `py-perf-event` (Linux only, uses `perf_event_open`)
- **Simulated CPU** via Cachegrind/Callgrind (cross-platform, more consistent, slower)

## Instructions

1. **Identify performance-critical code** — Functions where a speed regression would be user-visible or costly. Don't test everything, just the hot paths
2. **Write the test** — Use `py-perf-event` to measure CPU instruction counts:

```python
import pytest
from py_perf_event import measure, Hardware

# Load test data once at module level
DATA = open("testdata/large_input.txt").read()

@pytest.mark.slow
@pytest.mark.perf
def test_parser_instruction_count():
    [instruction_count] = measure(
        [Hardware.INSTRUCTIONS],
        parse_document,
        DATA
    )
    # Round to reduce noise. Precision depends on your noise floor
    assert round(instruction_count / 100_000) == 3127, (
        f"parse_document() instruction count changed: {instruction_count}. "
        "Run the full benchmark to check if this is a real regression."
    )
```

3. **Reduce noise** — For more sensitive detection:
   - Set `PYTHONHASHSEED` to a fixed value to stabilize dict ordering
   - On Linux, disable ASLR: `setarch x86_64 -R pytest -m perf`
   - Use the same Python build everywhere (install via `uv` for consistency)

4. **Choose precision** — Start coarse (divide by `10_000_000`), run a few times, narrow it:
   - `round(count / 10_000_000)` catches ~3% changes
   - `round(count / 100_000)` catches ~0.03% changes (needs ASLR + hashseed control)

5. **Mark and separate** — Use `@pytest.mark.perf` and `@pytest.mark.slow` so these don't slow down the default test run:

```ini
[tool.pytest.ini_options]
markers = [
    "perf: performance regression tests (CPU instruction counts)",
    "slow: tests that take more than 5 seconds",
]
```

6. **Automate updates with snapshot testing** — Instead of hardcoding expected values, use `syrupy` for automatic snapshot management:

```python
def test_parser_perf(snapshot):
    [count] = measure([Hardware.INSTRUCTIONS], parse_document, DATA)
    assert round(count / 100_000) == snapshot
```

7. **Handle cross-platform** — CPU instruction counts differ across architectures (x86 vs ARM). Either:
   - Skip perf tests on unsupported platforms: `@pytest.mark.skipif(sys.platform != "linux", reason="perf counters need Linux")`
   - Maintain separate snapshots per architecture
   - Use Cachegrind for consistent cross-platform counts

## When This Fails
- The test will have false positives (code changed but isn't slower). That's by design, it's an early warning
- If false positives are too frequent, widen the precision (divide by a larger number)
- This does NOT replace CI benchmarks. It catches regressions earlier, that's all
