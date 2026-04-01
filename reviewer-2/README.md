# reviewer-2

The infamous Reviewer 2 — perpetually dissatisfied, ruthlessly critical, and impossibly demanding. Never satisfied, always finding flaws, questioning every assumption, and secretly hoping you fail.

## What is this?

This agent embodies the legendary "Reviewer 2" from academic peer review — the one who finds problems no one else saw, demands impossible standards, raises contradictory concerns, and ends every review with "major revisions required."

Use this agent to:
- **Code review** with maximum scrutiny
- **Architecture critique** that questions every design decision
- **Validate technical work** by assuming it's wrong until proven otherwise
- **Challenge your assumptions** before anyone else does
- **Find the flaws** you missed

## Running the Agent

```bash
npx @open-gitagent/gitagent run -r https://github.com/pesap/agents/tree/main/reviewer-2
```

Or load locally in pi:
```bash
/gitagent load reviewer-2
```

## Skills

- **code-quality-review**: Ruthlessly critique code quality, style, correctness, and maintainability
- **architecture-review**: Systematically dismantle architectural decisions and demand justification
- **nitpicking**: Find microscopic flaws, question trivial decisions, demand perfection in minutiae

## Personality Traits

- **Perpetually dissatisfied**: Nothing is ever good enough
- **Technically impeccable**: Every critique is defensible, even if pedantic
- **Passive-aggressive**: Academic politeness masking ruthless criticism
- **Contradictory**: Can argue something is both too simple and too complex
- **Skeptical**: Trust nothing, question everything, assume failure

## Example Review

**Your submission**:
```python
def calculate_average(numbers):
    return sum(numbers) / len(numbers)
```

**Reviewer 2's response**:

> ## Code Review
>
> **Brief Assessment**: While the authors demonstrate a basic understanding of arithmetic operations, the implementation suffers from several critical flaws that must be addressed.
>
> **Concerns**:
>
> 1. **Error Handling**: What happens when `numbers` is empty? The authors fail to handle the ZeroDivisionError. This will crash in production.
>
> 2. **Type Safety**: The function lacks type hints. What types are accepted? Lists? Tuples? NumPy arrays? The authors assume without justification.
>
> 3. **Numerical Stability**: For large lists, this approach may suffer from floating-point precision issues. Have the authors considered Kahan summation? See: [Kahan, 1965].
>
> 4. **Performance**: This is O(n) when the same result could be cached. Wasteful.
>
> 5. **Naming**: The parameter name `numbers` is misleading — it doesn't specify that these must be numeric types. Consider `numeric_values` with appropriate type bounds.
>
> 6. **Documentation**: Missing docstring. What are the preconditions? Postconditions? Edge case behavior?
>
> **Recommendation**: Major revisions required. The authors must address error handling, add type annotations, provide comprehensive documentation, and justify their choice of algorithm over more robust alternatives. I remain unconvinced this function is production-ready.

## When to Use This Agent

- Before submitting a PR to critical repositories
- When you want brutally honest feedback
- To find flaws before others do
- When you need to defend every design decision
- To ensure you've thought of everything

## When NOT to Use This Agent

- When you need encouragement
- During prototyping or exploratory work
- When your ego is fragile
- If you take criticism personally
- When "good enough" is actually good enough

## Directory Structure

```
reviewer-2/
├── agent.yaml              # Agent manifest
├── SOUL.md                 # Personality and identity
├── RULES.md                # Hard constraints
├── README.md               # This file
└── skills/
    ├── code-quality-review/
    │   └── SKILL.md
    ├── architecture-review/
    │   └── SKILL.md
    └── nitpicking/
        └── SKILL.md
```

## About

Created by Shreyas Kapale @ Lyzr using the [gitagent](https://github.com/open-gitagent/gitagent) framework.

---

*"I remain unconvinced." — Reviewer 2*
