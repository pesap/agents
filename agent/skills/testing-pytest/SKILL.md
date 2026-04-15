---
name: testing-pytest
description: Use this skill when the user needs pytest test design, refactoring, debugging, or CI test quality improvements (fixtures, parametrize, plugins, coverage, parallelism, property/snapshot/perf testing). Use even if they only say "fix tests" or "improve test suite".
---

## Use when
- User asks to write/refactor/debug pytest tests.
- User asks about fixture design, conftest structure, or plugin usage.
- User asks for coverage strategy, parallel test execution, or flaky-test fixes.
- User asks for property-based, snapshot, performance, or CI benchmark testing.

## Avoid when
- Project is not using pytest.
- User asks for framework-agnostic advice with no Python/pytest scope.

## Instructions
1. Define target behavior first (what test should prove).
2. Prefer function-based tests with clear arrange/act/assert flow.
3. Design fixtures by scope intentionally (`function`, `module`, `session`) and avoid hidden coupling.
4. Use `@pytest.mark.parametrize` for input/output matrices.
5. Use Hypothesis for invariants/properties, not example repetition.
6. Use snapshot tests only for stable, reviewable outputs.
7. Use `pytest-xdist` only when tests are isolated and deterministic.
8. Set meaningful coverage thresholds; coverage is signal, not the goal.
9. For failures, use targeted debugging (`-k`, `--lf`, `--pdb`, `-vv`, caplog/capsys).
10. For CI performance regressions, use pytest-benchmark and compare historical baselines.

## Output
- Test strategy (what and why)
- Added/updated test files and fixture changes
- Commands run + results
- Flakiness/perf risks and next actions
