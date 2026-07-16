# `needs/` — Need (`N-…`)

**What a stakeholder needs.** A need is a problem or goal in the stakeholder's
terms, before any solution. Use cases trace *up* to needs, so a need with no use
case is an unmet need (visible in the Traceability view).

**Filename:** `N-<n>.md`, matching the `id`.

## Frontmatter

| Field         | Required | Type / values                    | Meaning |
|---------------|----------|----------------------------------|---------|
| `id`          | yes      | `N-<n>`                           | Identity; equals the filename stem. |
| `title`       | yes      | string                           | Short statement of the need. |
| `status`      | no       | `draft` \| `approved` \| `deprecated` | Lifecycle. Default `draft`. |
| `moscow`      | no       | `must` \| `should` \| `could` \| `wont` | Priority. Default `should`. |
| `stakeholder` | no       | `SH-<n>`                          | The stakeholder who holds this need; `""`/absent = unassigned. |
| `source`      | no       | string                           | Where the need came from (a document, interview, etc.). |
| `tags`        | no       | list of strings                  | Free-form labels for grouping/filter. |
| `created`     | no       | `"YYYY-MM-DD"`                    | Creation date. |
| `inferred`    | no       | `true`                            | Low-confidence marker. |

## Body

Free text: the rationale — why this matters, in the stakeholder's language.

## Template

```markdown
---
id: N-001
title: Safe shutdown
status: approved
moscow: must
stakeholder: SH-001
tags:
  - safety
---

The operator needs to stop the system without leaving it in an unsafe state.
```
