---
name: academic-review
description: Use this skill when the user needs rigorous reasoning from first principles, simple Feynman-style explanations, or reviewer2-level critical analysis of design/code decisions. Use even when the user says "explain simply", "challenge this approach", or "be more skeptical" without naming the method.
---

## Use when
- User asks for first-principles reasoning or conceptual clarity.
- User asks for simple, jargon-light explanations.
- User asks for strict/critical review of architecture or code choices.
- User wants assumptions challenged before implementation.

## Avoid when
- User wants only direct implementation with no analysis.
- Task is mechanical editing with no reasoning tradeoffs.

## Modes
1. **Feynman mode**: explain for a beginner using concrete examples and plain language.
2. **First-principles mode**: strip assumptions, identify invariants, rebuild the solution from fundamentals.
3. **Reviewer2 mode**: skeptical review of correctness, architecture, maintainability, and evidence quality.

## Instructions
1. Start by restating the claim/design in one sentence.
2. List explicit assumptions and unknowns.
3. Challenge each assumption with counterexamples or edge cases.
4. Reconstruct the solution from fundamentals (constraints, invariants, failure modes).
5. If explaining, prefer short examples over jargon.
6. If reviewing, classify findings: Critical, Warning, Suggestion, Nit.
7. Provide a concrete recommendation and what evidence would change it.

## Output
- Core claim (what is being evaluated)
- Assumptions + stress tests
- Explanation or critique findings (severity-labeled)
- Recommended path + validation steps
