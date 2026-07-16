# `flows/` — Flow (`FL-…`)

**One behaviour, as ordered steps.** A flow is the behaviour of a single use case
(the use case points to it via `flow:`). It is a `main` sequence of steps plus
`alternates` that branch off and rejoin. Flows are what **derive** the structure
diagram: adjacent steps owned by different components become a connection.

**Filename:** `FL-<n>.md`, matching the `id`. Body is empty.

## Steps are references

Each entry in `main` (and each alternate's `steps`) is one of:

- an **activity id** (`ACT-…`) — defined on some component (see
  `components/README.md`); or
- a **flow id** (`FL-…`) — a **subflow**: invoke another use case's flow inline,
  rather than restating its steps. Connections derive *through* the call.

## Frontmatter

| Field        | Required | Type / values          | Meaning |
|--------------|----------|------------------------|---------|
| `id`         | yes      | `FL-<n>`                | Identity; equals the filename stem. |
| `title`      | yes      | string                 | Usually mirrors the use case's title. |
| `main`       | yes      | list of `ACT-…`/`FL-…`  | The happy-path steps, in order. |
| `alternates` | no       | list of alt-path objects | Branches — see below. |
| `created`    | no       | `"YYYY-MM-DD"`          | Creation date. |
| `inferred`   | no       | `true`                  | Low-confidence marker. |

### Alternate-path objects (`alternates`)

Indices are **0-based positions into `main`**.

| Field       | Type              | Meaning |
|-------------|-------------------|---------|
| `id`        | `AP-<n>`           | Unique within this flow. |
| `condition` | string            | Human label for the branch, e.g. "the chamber is not clear". |
| `guard`     | boolean expr      | Optional formal guard over component variables (see `components/README.md`). |
| `after`     | int               | Diverges *after* this main-step index. |
| `rejoin`    | int               | Rejoins the main flow at this index, or `-1` to end the flow. |
| `steps`     | list of `ACT-…`/`FL-…` | The branch's own steps. |

## Template

```markdown
---
id: FL-001
title: Emergency stop
main:
  - ACT-001
  - ACT-002
alternates:
  - id: AP-1
    condition: the system is already stopped
    guard: controller.running == false
    after: 0
    rejoin: -1
    steps:
      - ACT-003
---
```
