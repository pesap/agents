# README Maestro

> Turns your scrappy notes and source code into a README that makes developers actually want to use your software.

[![gitagent](https://img.shields.io/badge/gitagent-compatible-blue)](https://github.com/open-gitagent/gitagent)
[![license](https://img.shields.io/badge/license-MIT-green)](./agent.yaml)
[![category](https://img.shields.io/badge/category-developer--tools-orange)](./agent.yaml)

---

## What It Does

README Maestro is a documentation specialist agent that crafts compelling, beautiful, technically precise README files for software projects. It understands the full reader journey, from "what is this?" to "I'm installing it right now," and structures every README to serve that path.

It knows the conventions for OSS libraries, CLI tools, SaaS SDKs, internal tooling, and API clients. It writes the kind of README that gets retweeted.

## Load

```bash
/gitagent load readme-maestro
/gitagent load gh:pesap/agents/readme-maestro
```

---

## Table of Contents

* [Run](#run)
* [What It Writes](#what-it-writes)
* [What to Give It](#what-to-give-it)
* [Agent Structure](#agent-structure)
* [License](#license)

---

## Run

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/agents -a claude --no-cache
```

Or from a local clone:

```bash
cd ~/dev/agents
gitagent run -d readme-maestro -a claude -p "Write a README for my project. Here's what it does: ..."
```

Set your API key before running:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

---

## What It Writes

The agent adapts the README structure to the project type:

| Project Type     | Key Sections                                                              |
|------------------|---------------------------------------------------------------------------|
| OSS Library      | Hero, Badges, Install, Quickstart, Features, API Reference, Contributing  |
| CLI Tool         | Hero, Badges, Install, Usage + Examples, Commands Table, Configuration    |
| SaaS SDK         | Hero, Auth, Quickstart, Methods, Error Handling, Changelog                |
| Internal Tooling | Purpose, Prerequisites, Setup, Usage, Architecture, Troubleshooting       |

Every README gets a one-liner value proposition, a copy-pasteable install command above the fold, at least one complete working usage example, and a table of contents if it runs long.

---

## What to Give It

The more context, the better. At minimum, provide:

* What the project does, even a rough one-liner
* Who the primary audience is (OSS devs? DevOps teams? Internal engineers?)
* What you want them to do next (install it, star it, open a PR, sign up?)

Optionally share existing README drafts, source code, API docs, feature lists, or example commands. The agent will read and synthesize everything you provide.

---

## Agent Structure

```
readme-maestro/
├── agent.yaml                          # Identity, model, skills, runtime config
├── SOUL.md                             # Personality, values, domain expertise
├── RULES.md                            # Writing process, constraints, section templates
├── README.md                           # This file
└── skills/
    ├── technical-writing/
    │   └── SKILL.md                    # Clarity, precision, and audience-calibrated prose
    ├── markdown-formatting/
    │   └── SKILL.md                    # Markdown structure, rendering, and readability rules
    └── github-elements/
        └── SKILL.md                    # Full GitHub element reference: alerts, badges, banners,
                                        # Mermaid, collapsibles, references, footnotes, task lists
```

---

## License

MIT. See [agent.yaml](./agent.yaml).

---

Built with [gitagent](https://github.com/open-gitagent/gitagent).
