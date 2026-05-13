# PRs and review threads

Check CI status on a PR:
```bash
gh pr checks 55 --repo owner/repo
```

Check whether a branch already has an open PR:
```bash
gh pr list --repo owner/repo --state open --head my-branch \
  --json number,title,url,headRefName,baseRefName
```

Create a PR with an explicit body file:
```bash
gh pr create --repo owner/repo \
  --title "chore(ci): reduce duplicate workflow runs" \
  --body-file skills/github/pr-template.md
```

## Reply to reviewer comments in-thread (preferred)

List review comments and IDs:
```bash
gh api repos/OWNER/REPO/pulls/55/comments \
  --jq '.[] | {id, in_reply_to_id, user: .user.login, body, path, line, html_url}'
```

Reply directly to a review comment thread:
```bash
gh api -X POST repos/OWNER/REPO/pulls/55/comments \
  -F in_reply_to=COMMENT_ID \
  -f body='Thanks — addressed in commit abc123 on <file/section>.'
```

Delete mistaken general/standalone replies:
```bash
# General PR comment
gh api -X DELETE repos/OWNER/REPO/issues/comments/ISSUE_COMMENT_ID

# PR review comment
gh api -X DELETE repos/OWNER/REPO/pulls/comments/REVIEW_COMMENT_ID
```

Use `gh pr comment` only when there is no thread to reply to.

## Policies
- Prefer in-thread replies over loose PR comments.
- Check for an existing open PR for the same head branch before creating a new one.
- Use repo-local PR templates when present; otherwise use `skills/github/pr-template.md`.
- Prefer explicit `--body-file` injection over implicit defaults.
