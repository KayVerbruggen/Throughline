# `use-cases/` — Use Case (`UC-…`)

**How the system satisfies needs.** A use case is a goal the system helps a user
achieve, told through user stories. It traces *up* to the needs it serves and
*down* (via `flow:`) to the behaviour that realises it.

**Filename:** `UC-<n>.md`, matching the `id`. **The body is empty** — everything
lives in frontmatter, and the behaviour is a separate Flow artifact.

## Frontmatter

| Field           | Required | Type / values                    | Meaning |
|-----------------|----------|----------------------------------|---------|
| `id`            | yes      | `UC-<n>`                          | Identity; equals the filename stem. |
| `title`         | yes      | string                           | The user's goal, e.g. "Pass a vessel downstream". |
| `status`        | no       | `draft` \| `approved` \| `deprecated` | Lifecycle. Default `draft`. |
| `moscow`        | no       | `must` \| `should` \| `could` \| `wont` | Priority. Default `should`. |
| `trace`         | no       | list of `N-<n>`                   | The needs this use case satisfies. |
| `actors`        | no       | list of strings                  | Participants (often stakeholder names, plus the system). |
| `stories`       | no       | list of story objects            | User stories — see below. |
| `preconditions` | no       | list of strings                  | What must hold before the use case runs. |
| `flow`          | no       | `FL-<n>`                          | The flow that implements this use case's behaviour. |
| `created`       | no       | `"YYYY-MM-DD"`                    | Creation date. |
| `inferred`      | no       | `true`                            | Low-confidence marker. |

### Story objects (`stories`)

Each is the fixed "As a / I want / so that" template:

| Field     | Type   | Meaning |
|-----------|--------|---------|
| `id`      | `US-<n>` | Unique within this use case. |
| `as_a`    | string | The role. |
| `i_want`  | string | The capability wanted. |
| `so_that` | string | The payoff / reason. |

## Template

```markdown
---
id: UC-001
title: Emergency stop
status: approved
trace:
  - N-001
moscow: must
actors:
  - Operator
stories:
  - id: US-001
    as_a: Operator
    i_want: to halt the system with one action
    so_that: I can respond to a hazard immediately
preconditions:
  - The system is running
flow: FL-001
---
```
