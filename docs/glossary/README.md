# `glossary/` — Glossary term (`G-…`)

**The project's shared vocabulary.** A glossary entry defines one domain term so
other artifacts can use it precisely instead of restating it. The title is the
term; the body is its definition.

**Filename:** `G-<n>.md`, matching the `id`.

## Frontmatter

| Field      | Required | Type / values   | Meaning |
|------------|----------|-----------------|---------|
| `id`       | yes      | `G-<n>`          | Identity; equals the filename stem. |
| `title`    | yes      | string          | The term being defined. |
| `aliases`  | no       | list of strings | Synonyms / abbreviations that mean the same thing. |
| `created`  | no       | `"YYYY-MM-DD"`   | Creation date. |
| `inferred` | no       | `true`           | Low-confidence marker. |

## Body

The definition (Markdown). Cross-link related terms or decisions in prose.

## Template

```markdown
---
id: G-001
title: Structure connection
aliases:
  - connection
---

A link drawn between two components in the Structure view. It is **derived**, not
stored: two components connect exactly when their activities run back-to-back in
some flow.
```
