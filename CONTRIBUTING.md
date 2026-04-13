# Contributing to pesap/agents

This repository contains gitagent-compatible agents for pi.

## Scope

- No Python helper scripts are required for this repo.
- GitHub Actions workflows are not used in this repo.

## Schemas

`schemas/` is intentionally simple and based on the content already used by existing agents in this repository:

- `schemas/agent-schema.json` mirrors fields used in `*/agent.yaml`
- `schemas/skill-schema.json` mirrors frontmatter fields used in `*/skills/*/SKILL.md`

If you are creating a new agent, start from an existing agent folder and keep the same structure.

## Creating a New Agent

1. Create a new directory: `mkdir my-agent`
2. Add required files:
   - `agent.yaml`
   - `SOUL.md`
   - `RULES.md`
   - `README.md`
3. Add optional directories as needed:
   - `skills/<skill-name>/SKILL.md`
   - `knowledge/<topic>.md`
4. Confirm the agent loads in pi:
   - `/gitagent load my-agent`

## Agent Structure

```text
my-agent/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── README.md
├── skills/
│   └── my-skill/
│       └── SKILL.md
└── knowledge/
    └── reference.md
```

## Minimal `agent.yaml` Template

```yaml
spec_version: "0.1.0"
name: my-agent
version: 1.0.0
description: Brief summary of what this agent does
author: your-name
license: MIT
skills:
  - my-skill
pi:
  scope: project
  tools: "read,bash"
runtime:
  max_turns: 30
  timeout: 300
tags:
  - general
metadata:
  category: general
  feedback_memory_hook:
    enabled: true
    min_confidence: 0.9
    max_chars: 220
    redact_sensitive: true
```

## Minimal `SKILL.md` Frontmatter

```markdown
---
name: my-skill
description: What this skill does
license: MIT
metadata:
  author: your-name
  version: "1.0.0"
  category: general
---
```

## Submitting Changes

1. Create a branch
2. Make your changes
3. Test loading your updated/new agent in pi
4. Commit with a clear message
5. Open a pull request
