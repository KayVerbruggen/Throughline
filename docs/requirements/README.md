# `requirements/` — Requirement (`R-…`)

**Precise "shall" statements.** A requirement makes a use case testable, written
in **EARS** (Easy Approach to Requirements Syntax). It traces *up* to the use
cases it constrains and is verified *down* by tests.

**Filename:** `R-<n>.md`, matching the `id`.

## The body is generated

The Markdown body is the **composed EARS sentence** — built from the slots below,
never hand-authored. Fill the slots; leave the body empty and the app writes it:

```
[KEYWORD <condition>,] the <subject> shall <action> <object> <constraint>.
```

## Frontmatter

| Field          | Required | Type / values | Meaning |
|----------------|----------|---------------|---------|
| `id`           | yes      | `R-<n>`        | Identity; equals the filename stem. |
| `title`        | yes      | string        | Short handle for the requirement. |
| `status`       | no       | `draft` \| `approved` \| `deprecated` | Lifecycle. Default `draft`. |
| `moscow`       | no       | `must` \| `should` \| `could` \| `wont` | Priority. Default `should`. |
| `trace`        | no       | list of `UC-<n>` | The use cases this requirement makes precise. |
| `format`       | no       | `EARS`        | Always `EARS`. |
| `ears_pattern` | no       | see below     | Which EARS pattern. Default `ubiquitous`. |
| `condition`    | when patterned | string  | The WHEN/WHILE/IF/WHERE clause. Empty for `ubiquitous`. |
| `subject`      | yes      | string        | Who "shall" — e.g. "lock system". |
| `action`       | yes      | string        | The required verb phrase — e.g. "halt all actuators". |
| `object`       | no       | string        | Object of the action. |
| `constraint`   | no       | string        | A qualifier — e.g. "within 500 ms". |
| `created`      | no       | `"YYYY-MM-DD"` | Creation date. |
| `inferred`     | no       | `true`        | Low-confidence marker. |

### EARS patterns (`ears_pattern`)

| Value                | Keyword       | Use when… |
|----------------------|---------------|-----------|
| `ubiquitous`         | (none)        | An ever-present property. No `condition`. |
| `event-driven`      | WHEN          | A response to a triggering event. |
| `state-driven`      | WHILE         | Active while the system is in a state. |
| `unwanted-behavior` | IF … THEN     | Handling an error / unwanted condition. |
| `optional`          | WHERE         | Applies only where an optional feature is present. |
| `complex`           | WHEN (+state) | Combines a state and a trigger. |

## Template

```markdown
---
id: R-001
title: Halt on stop
status: approved
trace:
  - UC-001
format: EARS
ears_pattern: event-driven
condition: the operator presses the emergency stop
subject: system
action: halt all actuators
constraint: within 500 ms
moscow: must
---

WHEN the operator presses the emergency stop, the system shall halt all actuators within 500 ms.
```
