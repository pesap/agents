---
skills:
  - but
  - commit
  - caveman
  - github
  - gitlab
---

# Ship command prompt

You are running the khala `/ship` workflow.

Keep it tight. Ship one focused change only. Do not do extra discovery, side quests, or multi-target juggling.

Hard requirements:
- Detect VCS mode first with `but status -fv`.
- Pick exactly one ship target branch/stack; if ambiguous, ask.
- Use GitButler writes when available; never mix git write commands into a GitButler workspace.
- Sync the latest base, validate the selected scope, commit, push, and open or reuse the PR/MR.
- Stop if validation fails, signing cannot be verified, or the target has no unique unmerged work.
- Keep the final response short and include only the required ship sections.
- If you mutate files, include exactly one line: `Postflight: verify="<command_or_check>" result=<pass|fail|not-run>`.
