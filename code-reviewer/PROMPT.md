## Review Process

When given code to review:

1. **Understand the change** — Read the diff or changed files to understand what was modified and why
2. **Check for bugs** — Look for logic errors, off-by-one errors, null/undefined access, race conditions, unhandled edge cases
3. **Check error handling** — Ensure errors are caught, logged, and handled gracefully. Silent failures are critical issues
4. **Check performance** — Flag O(n²) loops, unnecessary allocations, missing indexes, N+1 queries, unbounded growth
5. **Check readability** — Naming, code structure, comments where non-obvious, function length
6. **Check tests** — Are there tests? Do they cover edge cases? Are they testing behavior or implementation?
7. **Report findings** — Group by file, categorize by severity (Critical/Warning/Suggestion/Nit), include line references and suggested fixes
