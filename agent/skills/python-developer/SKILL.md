---
name: python-developer
description: Python implementation workflow aligned with the python-developer subagent spec (uv tooling, typed APIs, structured returns, focused pytest validation).
---

## Use when
- The task is primarily Python feature work, bug fixing, or refactoring.
- The user expects explicit typing, maintainable APIs, and test-backed changes.
- You need a repeatable Python delivery contract instead of ad-hoc prompting.

## Avoid when
- The task is not Python-centric.
- The user explicitly asks for a one-off quick patch without reusable workflow.
- No code changes are required (planning-only or status-only requests).

## Mission
- Deliver production-grade Python changes that are explicit, typed, and maintainable.
- Prefer root-cause fixes over superficial patches.
- Keep diffs minimal, test-backed, and easy to review.

## Operating rules
1) Tooling
- Use `uv` + `pyproject.toml` by default.
- Use `uv sync` for dependency/environment setup.
- Run Python commands via `uv run`.
- Do not introduce Poetry, pip-only venv flows, or `requirements.txt` unless asked.

2) API design
- Require explicit type hints.
- Return one structured object (`dataclass`/`TypedDict`/Pydantic) over loose multi-value returns.
- Keep signatures compact; prefer keyword-only args beyond 1-2 positional args.
- Name functions so the action + primary object are obvious.

3) Error handling
- Avoid broad `try/except` and catch-all handlers.
- Handle expected failure modes with specific exceptions.
- Fail fast at boundaries with clear errors.

4) Performance and async
- Use async patterns for I/O-bound paths.
- Keep hot paths allocation-aware and straightforward.

5) Testing
- Use `pytest` with function-based tests and fixtures.
- Avoid class-based tests unless framework constraints require them.
- Add regression tests for bug fixes.
- Run targeted tests for touched paths unless full-suite is requested.
- For deep pytest strategy (fixtures/plugins/parametrize/property/snapshot/perf/CI), load `testing-pytest`.

6) Communication
- Be concise and direct.
- Always report changed files, validation commands, and residual risks.

7) Logging and output
- Prefer structured logs for operational messages (`logging` with JSON payloads or `loguru`).
- Do not use `print(...)` for routine progress/success/failure chatter.
- Print to stdout only when a command contract explicitly requires user-facing or machine-readable output.

8) Naming and entrypoints
- Avoid leading-underscore private methods/functions in normal project code; prefer explicit public names.
- Treat "private" naming as hidden magic unless a framework/protocol explicitly requires it.
- Prefer callable functions over `if __name__ == "__main__":` blocks unless the user explicitly asks for a script entrypoint.

9) Documentation and docstrings
- Use NumPy-style docstrings for every new or modified function/method.
- Each function/method docstring must include at least one runnable example in an `Examples` section.
- Keep examples minimal and realistic (copy/paste friendly).

## Syntax examples reference
- See `SYNTAX_DO_DONT.md` in this same skill directory.
- See `NUMPY_DOCSTRING_STYLE.md` for required docstring structure and examples.
- Keep these patterns consistent in implementation and review:
  - Function signatures (primary subject positional, config keyword-only)
  - Structured returns (single typed object)
  - Narrow exception handling (no catch-all)
  - Async-safe syntax (no blocking calls in async flows)
  - Structured logging (avoid print-driven progress output)
  - Public naming (avoid underscore-private helpers by default)
  - Entry style (prefer callable entry functions over `__main__` guards unless requested)
  - NumPy docstring format with at least one example per function/method
## Workflow
1. Restate assumptions and acceptance criteria.
2. Read touched code paths end-to-end.
3. Implement the smallest root-cause fix.
4. Add/update targeted pytest coverage.
5. Run relevant checks (prefer `uv run ...`) and capture pass/fail.
6. Summarize behavior change, evidence, and open risks.

## Output
- Assumptions and approach
- File-level changes
- Validation commands + results
- Risks / follow-ups

## Test prompts
1. "Use python-developer to add a typed parser that returns a dataclass and rejects invalid JSON with narrow exceptions."
2. "Use python-developer to refactor this Python function to keyword-only args and add pytest regression tests."
3. "Use python-developer to debug this failing async API path and provide root-cause fix with targeted uv-run tests."