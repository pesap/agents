# pytest-whisperer

A pytest specialist that writes, organizes, and optimizes Python test suites. Prefers plain functions over classes, fixtures over setup methods, and the testing pyramid over chaos.

## Load

```
/gitagent load pytest-whisperer
/gitagent load pesap/agents/pytest-whisperer
```

## Run

```
npx @open-gitagent/gitagent run -r https://github.com/pesap/agents -a pytest-whisperer
```

## Skills

- **write-tests** — Write new pytest tests using plain functions, fixtures, parametrize, and descriptive naming
- **organize-tests** — Organize a test suite using the testing pyramid, mirror the app structure, and apply consistent conventions
- **fixtures-and-conftest** — Design fixtures and conftest.py files for clean setup, proper scoping, and zero test interdependence
- **performance-tests** — Write tests that detect performance regressions using CPU instruction counts and snapshot assertions
- **refactor-tests** — Refactor from classes to functions, eliminate mocks, fix flaky tests, and modernize to idiomatic pytest
- **parametrize-mastery** — Advanced parametrize patterns: table-driven tests, indirect parametrize, combinatorial stacking, external data, readable IDs
- **test-debugging** — Diagnose failures with --lf, --pdb, traceback control, capsys, caplog, and stepwise mode
- **coverage-analysis** — Configure pytest-cov, set thresholds, interpret branch coverage, and integrate diff-cover in CI
- **property-based-testing** — Write property-based tests with Hypothesis: strategies, shrinking, stateful testing, and profile management
- **parallel-execution** — Configure pytest-xdist for parallel runs, resource isolation per worker, and CI test splitting
- **test-data-management** — Factory fixtures, data files, faker, and builder patterns for maintainable test data
- **snapshot-testing** — Use syrupy for snapshot testing: filtering non-deterministic fields, parametrized snapshots, cleanup
- **ci-benchmarks** — Continuous benchmarking with pytest-benchmark and github-action-benchmark for regression detection and chart visualization

## Structure

```
pytest-whisperer/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── README.md
└── skills/
    ├── write-tests/
    │   └── SKILL.md
    ├── organize-tests/
    │   └── SKILL.md
    ├── fixtures-and-conftest/
    │   └── SKILL.md
    ├── performance-tests/
    │   └── SKILL.md
    ├── refactor-tests/
    │   └── SKILL.md
    ├── parametrize-mastery/
    │   └── SKILL.md
    ├── test-debugging/
    │   └── SKILL.md
    ├── coverage-analysis/
    │   └── SKILL.md
    ├── property-based-testing/
    │   └── SKILL.md
    ├── parallel-execution/
    │   └── SKILL.md
    ├── test-data-management/
    │   └── SKILL.md
    ├── snapshot-testing/
    │   └── SKILL.md
    └── ci-benchmarks/
        └── SKILL.md
```

## Links

- [gitagent](https://github.com/open-gitagent/gitagent)
