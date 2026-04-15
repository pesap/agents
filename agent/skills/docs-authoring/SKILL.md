---
name: docs-authoring
description: Use this skill when writing or revising README/docs content that must be technically accurate, easy to scan, and render cleanly on GitHub. Use for setup guides, API docs, troubleshooting, and release notes, even if the user only asks to "clean up docs" or "improve README".
---

## Use when
- User asks to write, rewrite, or improve README/docs.
- User asks for clearer setup, usage, API, or troubleshooting sections.
- User asks for better Markdown structure or GitHub rendering.
- User asks for badges, alerts, tables, Mermaid diagrams, or collapsible sections.

## Avoid when
- Task is code implementation/debugging without doc changes.
- User asks for marketing copy, branding, or opinion pieces.

## Instructions
1. Start with user outcome first, then only the details needed to achieve it.
2. Keep terminology consistent with code/CLI/API naming.
3. Use scan-friendly structure: short sections, short paragraphs, bullets where useful.
4. Use strict heading hierarchy (no skipped levels).
5. Use fenced code blocks with language hints (`bash`, `json`, `yaml`, etc.).
6. Prefer relative links for repo-local docs/assets.
7. Use tables only for true comparisons/reference data.
8. Validate technical claims against repo artifacts before stating as fact.
9. Label assumptions explicitly when uncertain.

## GitHub formatting defaults
- Keep badges concise (CI/version/license/coverage), and link each badge to its target.
- Use callouts sparingly: `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`.
- Use `<details><summary>...</summary>...</details>` for non-critical long sections.
- Use Mermaid for simple architecture/flow diagrams when it improves comprehension.
- Use `<kbd>` for keyboard shortcuts.

## Output
- What changed (sections/files)
- Rendering/format choices made
- Any assumptions or unverifiable claims
