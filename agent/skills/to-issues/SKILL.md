---
name: to-issues
description: Break a plan/PRD into independently grabbable GitHub issues using thin vertical slices (tracer bullets). Use when users ask to convert specs into actionable implementation tickets.
---

## Source
- Adapted from: https://github.com/mattpocock/skills/tree/main/to-issues

## Use when
- User wants to turn a PRD/plan into GitHub issues.
- User asks for implementation ticket breakdown with dependencies.
- User wants AFK vs HITL slicing for parallel execution.

## Avoid when
- Input plan is too vague and user refuses clarification.
- User wants only a high-level roadmap without issue creation.

## Workflow
1. Gather source plan (conversation, markdown, or parent GitHub issue).
2. Explore codebase as needed for realistic boundaries.
3. Draft thin vertical slices (end-to-end behavior per slice).
4. Review slice list with user (granularity, dependencies, HITL/AFK labels).
5. Create issues in dependency order with acceptance criteria and blockers.
6. Link issues using GitHub's native sub-issues feature (see below).

## Issue Creation Format

### Labels via CLI flags (not body sections)
```bash
gh issue create \
  --title "feat: my feature" \
  --label "enhancement" \
  --label "AFK" \
  --body "..."
```

### Issue body structure
Include:
- Summary
- Parent reference (`Parent: #N`)
- Acceptance criteria
- Implementation notes (optional)
- `Blocked by: #N` for dependencies

Exclude:
- "Label" sections (use `--label` flag instead)
- "Further Notes" (internal, not public-facing)
- Redundant metadata already in GitHub UI

## GitHub Native Sub-issues

GitHub has built-in parent/child relationships for issues. Use these instead of tasklist workarounds.

### Query sub-issues (GraphQL)
```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    issue(number: 176) {
      subIssues(first: 10) {
        nodes { number title }
      }
    }
  }
}'
```

### Query parent (GraphQL)
```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    issue(number: 177) {
      parent { number title }
    }
  }
}'
```

### Add sub-issue (GraphQL mutation)
```bash
# Get issue node IDs first
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    parent: issue(number: 176) { id }
    child: issue(number: 177) { id }
  }
}'

# Add sub-issue
gh api graphql -f query='
mutation {
  addSubIssue(input: {
    issueId: "PARENT_NODE_ID",
    subIssueId: "CHILD_NODE_ID"
  }) {
    issue { number }
    subIssue { number }
  }
}'
```

### Remove sub-issue
```bash
gh api graphql -f query='
mutation {
  removeSubIssue(input: {
    issueId: "PARENT_NODE_ID",
    subIssueId: "CHILD_NODE_ID"
  }) {
    issue { number }
    subIssue { number }
  }
}'
```

### Best Practices
- PRD issue = parent, implementation slices = sub-issues
- Add `Parent: #N` in child body for human-readable back-reference
- Use `addSubIssue` mutation to create the actual relationship
- Dependencies between siblings: document in body with `Blocked by: #N`
- GitHub UI shows sub-issues in sidebar with completion tracking

## Output
- Approved slice breakdown
- Created issue list with sub-issue relationships
- HITL vs AFK labeling rationale
- Follow-up recommendations for execution order
