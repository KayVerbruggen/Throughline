# `decisions/` — Decision (`D-…`)

**Why the design is the way it is.** A design decision records an architectural
choice — including what was rejected and the downside accepted — so the rationale
outlives the people who made it. It traces to the use cases it serves;
components link back to the decisions that shaped them.

**Filename:** `D-<n>.md`, matching the `id`.

## The body is generated

The body is a **composed Y-statement** built from the slots below, never
hand-authored:

```
In the <context>, facing <concern>, we decided <decision> and not <alternatives>
to achieve <criterion>, accepting <downside>.
```

## Frontmatter

| Field          | Required | Type / values                       | Meaning |
|----------------|----------|-------------------------------------|---------|
| `id`           | yes      | `D-<n>`                              | Identity; equals the filename stem. |
| `title`        | yes      | string                              | Short name for the decision. |
| `status`       | no       | `proposed` \| `accepted` \| `superseded` | Lifecycle (a decision isn't MoSCoW-prioritised). Default `proposed`. |
| `trace`        | no       | list of `UC-<n>`                     | Use cases this decision addresses. |
| `context`      | yes      | string                              | The situation — "In the <context>". |
| `concern`      | yes      | string                              | The force at play — "facing <concern>". |
| `decision`     | yes      | string                              | The choice — "we decided <decision>". |
| `alternatives` | no       | string                              | What was rejected — "and not <alternatives>". |
| `criterion`    | yes      | string                              | The goal — "to achieve <criterion>". |
| `downside`     | no       | string                              | The accepted cost — "accepting <downside>". |
| `created`      | no       | `"YYYY-MM-DD"`                       | Creation date. |
| `inferred`     | no       | `true`                               | Low-confidence marker. |

## Template

```markdown
---
id: D-001
title: Single-source structure
status: accepted
trace:
  - UC-004
context: system-structure model
concern: a stored connection graph would drift out of sync with the flows
decision: to derive every connection from flow adjacency, and store none
alternatives: to let users draw and store connections directly
criterion: a single source of truth, so structure can't contradict behaviour
downside: a static dependency can't be shown unless a flow places two parts adjacent
---
```
