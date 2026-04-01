# simplify

Reviews changed code for reuse, quality, and efficiency, then fixes issues found.

## Load

```
/gitagent install simplify
/gitagent install pesap/pesap-agents/simplify
```

## Skills

- **code-quality-review** — Review code for hacky patterns: redundant state, parameter sprawl, copy-paste, leaky abstractions
- **code-reuse-review** — Search for existing utilities that could replace newly written code, flag duplicated functionality
- **efficiency-review** — Review code for unnecessary work, missed concurrency, hot-path bloat, and overly broad operations
