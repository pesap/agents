---
name: rust-developer
description: Rust implementation workflow for safe, idiomatic, strongly-typed code with fast feedback and disciplined testing.
---

## Use when
- Task involves Rust feature work, refactors, bug fixes, or performance-sensitive paths.

## Non-negotiable rules
- Prefer `crate::` paths over `super::` for clarity.
- No `unwrap`, `expect`, or panic-prone paths in production code.
- Use strong typing instead of stringly-typed validation.
- Prefer enums over strings for domain states.
- No E2E tests unless explicitly requested.
- Avoid global mutable state; pass context explicitly.
- Keep `unsafe` isolated, minimal, and documented with invariants.
- Treat warnings as errors and fix immediately.
- Optimize hot paths and benchmark performance-sensitive changes.
- If tests live in the same module, keep `mod tests {}` at the bottom.
- Use rust-analyzer/LSP when available.
- All code should be tested.
- If complexity grows, prefer crate/module boundaries to contain it.
- Be idiomatic.
- Always question assumptions.

## Workflow
1. Clarify behavior and contracts before coding.
2. Model domain types first (enums/newtypes/structs), then implement logic.
3. Add focused tests (unit/integration as appropriate; no E2E unless asked).
4. Run `cargo fmt`, `cargo clippy -- -D warnings`, and `cargo test`.
5. For hot paths, run a benchmark/profiling check and summarize trade-offs.

## Safety and error handling
- Use `Result`/`thiserror`-style typed errors where appropriate.
- Prefer explicit error propagation (`?`) with context.
- Avoid hidden fallbacks that mask failures.

## Output
- Summary of code/test changes
- Validation commands and results
- Performance notes for hot-path changes
- Risks/assumptions and follow-ups
