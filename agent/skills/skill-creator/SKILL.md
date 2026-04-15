---
name: skill-creator
description: Create or improve reusable SKILL.md files with clear trigger behavior, safety boundaries, and lightweight validation. Use when users ask to build a new skill, upgrade an existing skill, tune "Use when/Avoid when" sections, or run /learn-skill.
---

## Use when
- User wants a new reusable skill.
- User wants to improve an existing SKILL.md.
- User asks for better trigger behavior, safer boundaries, or clearer output format.
- User runs `/learn-skill`.

## Avoid when
- Task is not about skills (feature work, bugfixes, general coding).
- User only wants one-off prompt help, not reusable skill logic.
- Scope is intentionally fixed and no trigger/boundary updates are desired.

## Workflow
1. **Scope**
   - Capture intent, trigger, output format, and boundaries.
   - Reuse conversation context first, ask clarifying questions only where ambiguous.
2. **Interview**
   - Clarify edge cases, constraints, dependencies, and safety limits.
3. **Draft**
   - Write or update `SKILL.md` with compact, general instructions.
   - Include explicit `Use when` and `Avoid when` sections.
   - Apply description optimization principles (see below).
4. **Validate**
   - Check trigger quality, safety, brevity, and reusability (no overfitting).
5. **Test plan**
   - For non-trivial skills, propose 2-3 realistic test prompts.
   - Include near-miss negatives (should NOT trigger).
6. **Save**
   - Write/update target files (or clearly mark dry-run output).
7. **Learn**
   - Persist concise notes about trigger choices and boundary decisions.

## Description optimization principles

The `description` field carries the entire burden of triggering. A skill only helps if it gets activated.

### Writing effective descriptions

1. **Use imperative phrasing** — Frame as instruction: "Use this skill when..." not "This skill does..."
2. **Focus on user intent, not implementation** — Describe what user is trying to achieve, not skill internals
3. **Be pushy** — Explicitly list contexts where skill applies, including when user doesn't name the domain: "even if they don't explicitly mention 'CSV' or 'analysis'"
4. **Keep concise** — Few sentences to short paragraph. Hard limit: 1024 characters

### Example transformation

```yaml
# Before (too narrow)
description: Process CSV files.

# After (intent-focused, broader triggers)
description: >
  Analyze CSV and tabular data files — compute summary statistics,
  add derived columns, generate charts, and clean messy data. Use this
  skill when the user has a CSV, TSV, or Excel file and wants to
  explore, transform, or visualize the data, even if they don't
  explicitly mention "CSV" or "analysis."
```

### Trigger testing

Design eval queries to test descriptions:

**Should-trigger queries (8-10):**
- Vary phrasing (formal, casual, typos)
- Vary explicitness ("analyze this CSV" vs "my boss wants a chart from this data file")
- Mix terse and context-heavy prompts
- Include multi-step tasks where skill is buried in larger chain

**Should-NOT-trigger queries (8-10):**
- Focus on **near-misses** — queries sharing keywords but needing something different
- Bad: "Write a fibonacci function" (obviously irrelevant)
- Good: "Write a python script that reads a csv and uploads to postgres" (involves CSV but task is ETL, not analysis)

### Avoiding overfitting

- Don't add specific keywords from failed queries — find the general category instead
- If should-trigger fails: description may be too narrow, broaden scope
- If should-NOT-trigger fails: description may be too broad, add specificity about what skill does NOT do
- Try structurally different framing if incremental tweaks aren't working

## Output format
- Skill summary
- Generated artifacts (paths + what changed)
- Learnings
- `Result: success|partial|failed`
- `Confidence: 0..1`
