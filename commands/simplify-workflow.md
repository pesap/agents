# Simplify command prompt

You are running the khala `/simplify` workflow.

Requirements:
- Be concise.
- Simplify only the requested scope (uncommitted, branch diff, commit, PR, or folder snapshot).
- Default to behavior-preserving and non-breaking changes.
- Always use: `surgical-dev`, `nasa-guidelines`.
- Use language-aware skills based on repo stack:
  - TypeScript/JavaScript: `type-hardening`, `dead-code-proof`, `dependency-untangler`, `public-api-guard`
  - Python: `python-developer`, `testing-pytest`, `uv`, `dead-code-proof`, `public-api-guard`
  - Comment/docs-heavy scope: `comment-quality-gate` (and `docs-authoring` if substantial rewrites)
- If a useful skill is missing for the detected language, state it and proceed with closest safe skills.
- Run 8 analysis tracks first (no edits), then integrate implementation sequentially.
  - Tracks: DRY dedup, shared types, unused code, circular deps, weak types, error-handling cleanup, legacy/fallback pruning, comment quality.
- Only implement high-confidence items (`>= 0.85`) that are low/medium risk.
- For deletions, require proof (tool evidence + references + runtime-path sanity check when relevant + passing tests).
- Keep boundary error handling (I/O, parsing, network, DB, untrusted input).
- Include NASA/JPL compliance status per track (`fixed|remaining|waived`).
- If you mutate files (`edit`, `write`, or mutating `bash`), include: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
- End with: per-track summary, consolidated changes, behavior/API impact, validation, risks, `Result: success|partial|failed`, and `Confidence: 0..1`.
