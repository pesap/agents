---
name: commit
description: "Read this skill before making commits with GitButler"
---

Create a GitButler commit for the current changes using a concise Conventional Commits-style subject.

## Tool

`commit-check.sh` — validates commit message format with commitizen via uvx.

## Format

`<type>(<scope>): <summary>`

- `type` REQUIRED. Use `feat` for new features, `fix` for bug fixes. Other common types: `docs`, `refactor`, `chore`, `test`, `perf`.
- `scope` OPTIONAL. Short noun in parentheses for the affected area (for example `api`, `parser`, `ui`).
- `summary` REQUIRED. Short, imperative, <= 72 chars, no trailing period.

## Notes

- Body is OPTIONAL. If needed, add a blank line after the subject and write short paragraphs.
- Do NOT include breaking-change markers or footers.
- Do NOT add sign-offs (no `Signed-off-by`).
- Use GitButler (`but`) for commit mutations; do NOT use `git add` or `git commit`.
- Never create an unsigned commit. If commit signing is unavailable, failing, or unclear, stop and request user assistance before committing.
- Only commit; do NOT push.
- Commit only repo-local changes from the current working tree. If edits landed in an agent-installed skill, cache checkout, or any path outside the current repo, stop and fix scope before committing.
- If it is unclear whether a file should be included, ask the user which files to commit.
- Treat any caller-provided arguments as additional commit guidance. Common patterns:
  - Freeform instructions should influence scope, summary, and body.
  - File paths or globs should limit which files to commit. If files are specified, only stage/commit those unless the user explicitly asks otherwise.
  - If arguments combine files and instructions, honor both.

## Steps

1. Infer from the prompt if the user provided specific file paths/globs and/or additional instructions.
2. Confirm the files to commit are inside the current repository/worktree and match the user's intended scope.
3. Run `but status -fv` and `but diff` to understand the current changes (limit to argument-specified files if provided).
4. If GitButler setup is required, run `but setup --status-after`, then rerun `but status -fv`.
5. (Optional) Run `git log -n 50 --pretty=format:%s` to see commonly used scopes.
6. If there are ambiguous extra files, or the requested edits are not present in the repo-local diff, ask for clarification before committing.
7. Verify commit signing is configured and working for this repo/worktree. If signing cannot be confirmed, stop and ask for assistance.
8. Commit only the intended change IDs with `but commit <branch> -m "<subject>" --changes <ids> --status-after` (add body flags if needed).

## Validation

```bash
TOOL=skills/commit/commit-check.sh
$TOOL                # checks HEAD^!
$TOOL HEAD~3..HEAD   # checks a custom range
```
