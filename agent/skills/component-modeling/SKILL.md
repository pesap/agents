---
name: component-modeling
description: Design infrasys Component subclasses, composition/associations, supplemental attributes, pint quantities, and copy semantics. infrasys provides the component model foundation, and r2x-core consumes that model as an application layer. Use this skill when users need robust component models or validation rules in infrasys-based systems.
license: MIT
allowed-tools: Read Edit Grep Glob Bash Write
metadata:
  author: psanchez
  version: "1.0.0"
  category: infrastructure-systems
---

# Component Modeling

## Use when
- Defining or refactoring `Component` subclasses in infrasys.
- Deciding between inheritance and composition for domain entities.
- Implementing validation, quantity/unit handling, or copy/deepcopy behavior.
- Preparing component schemas consumed by r2x-core systems or transforms.

## Avoid when
- Task is framework-agnostic and not tied to infrasys Component semantics.
- User needs quick implementation without domain-modeling concerns.
- Main decision is r2x-core plugin lifecycle behavior instead of component schema design.

## Workflow
1. Define the domain object boundary and required fields.
2. Choose inheritance/composition strategy (avoid instantiating mixed base+subclass hierarchies).
3. Model associations and supplemental attributes explicitly.
4. Apply quantity/unit handling and copy semantics safely.
5. Add targeted validation hooks (for example `check_component_addition`).
6. Validate with focused checks for serialization and system integration.

See [REFERENCE.md](./REFERENCE.md) for full patterns and examples.

## Output
- Recommended component model and inheritance/composition choices
- Validation/copy semantics guidance for touched types
- Concrete code patterns to apply or avoid
- Risks and follow-up checks
