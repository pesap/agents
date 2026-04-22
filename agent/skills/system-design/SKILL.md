---
name: system-design
description: Design custom infrasys System classes, lifecycle behavior, composition/inheritance boundaries, and data-format versioning. infrasys is the core system layer, and r2x-core is an application on top of that layer. Use this skill when users need robust system-level architecture in infrasys.
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# System Design

## Use when
- Designing or extending infrasys `System` containers.
- Defining component lifecycle and ownership patterns.
- Implementing system data format versioning and upgrades.
- Refining the infrasys system boundary used by higher-level apps such as r2x-core.

## Avoid when
- Task does not involve infrasys `System` design or lifecycle concerns.
- User needs generic OOP/system design without infrasys context.
- Task is primarily about r2x-core plugin boundary decisions rather than base system design.

## Workflow
1. Define system boundary and responsibilities.
2. Choose extension strategy (custom subclass vs composition helpers).
3. Specify lifecycle operations (creation, mutation, persistence, cleanup).
4. Add versioning/migration hooks where schema evolution is expected.
5. Validate with targeted serialization/load and behavior checks.

See [REFERENCE.md](./REFERENCE.md) for detailed patterns and examples.

## Output
- Proposed system architecture and extension approach
- Lifecycle/serialization/versioning decisions
- Implementation snippets or migration steps
- Risks and validation plan
