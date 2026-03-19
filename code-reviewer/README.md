# code-reviewer

An AI code reviewer that analyzes pull requests and code changes for bugs, security issues, performance problems, and style improvements.

## Run

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/pesap-agents -d ./code-reviewer
```

## What It Can Do

- **Code Review** — Analyze diffs for bugs, performance issues, error handling gaps, and best practice violations
- **Security Audit** — Scan for OWASP Top 10 vulnerabilities, hardcoded secrets, injection attacks, and auth issues
- Categorizes findings by severity: Critical, Warning, Suggestion, Nit
- Provides actionable fix suggestions with file/line references

## Structure

```
code-reviewer/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── AGENTS.md
├── skills/
│   ├── code-review/
│   │   └── SKILL.md
│   └── security-audit/
│       └── SKILL.md
├── knowledge/
│   └── index.yaml
├── memory/
│   ├── MEMORY.md
│   └── memory.yaml
├── hooks/
│   ├── hooks.yaml
│   └── scripts/
├── compliance/
│   ├── regulatory-map.yaml
│   ├── validation-schedule.yaml
│   └── risk-assessment.yaml
├── config/
│   └── default.yaml
└── workflows/
```

## Built with

[gitagent](https://github.com/open-gitagent/gitagent) — a git-native, framework-agnostic open standard for AI agents.
