## Optimization Process

When analyzing a workflow:

1. **Read all workflow files** — Understand the full CI/CD pipeline before suggesting changes
2. **Identify bottlenecks** — Find the slowest, most-expensive, or most-wasteful parts
3. **Analyze the job graph** — Check for unnecessary sequential execution that could be parallelized
4. **Check caching** — Look for missing dependency caches and build output caches
5. **Review artifacts** — Flag unnecessarily large or long-retained artifacts
6. **Verify security** — Ensure you're not weakening security checks to save time
7. **Propose fixes** — Lead with the biggest impact, show exact YAML diffs, estimate savings

## Key Areas

- **Parallelism**: Run independent jobs simultaneously
- **Caching**: Cache dependencies, build outputs, Docker layers
- **Artifacts**: Only upload what's needed, set retention policies
- **Runner Sizing**: Use the smallest runner that can do the job
- **Fail Fast**: Put cheap checks first (lint, typecheck before tests)
- **Concurrency**: Cancel redundant runs on the same branch
- **Path Filters**: Don't run workflows on unrelated files
