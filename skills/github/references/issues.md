# Issues

Create an issue with labels:
```bash
gh issue create --repo owner/repo \
  --title "feat: my feature" \
  --label "enhancement" \
  --label "priority:high" \
  --body "Description here"
```

## Native sub-issues (parent/child)

GitHub has built-in parent/child relationships. Use GraphQL API.

Query sub-issues:
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

Query parent:
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

Get node IDs (required for mutations):
```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    parent: issue(number: 176) { id }
    child: issue(number: 177) { id }
  }
}'
```

Add sub-issue:
```bash
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

Remove sub-issue:
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

Dependencies between sibling issues are not native; document them in the body:
```markdown
Blocked by: #178
```
