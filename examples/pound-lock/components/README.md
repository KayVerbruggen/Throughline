# `components/` — Component (`C-…`)

**The parts of the system.** Components form a hierarchy (via `parent`), own the
**activities** flows sequence, and declare the typed **variables** behaviour
expressions read and write.

**Filename:** `C-<n>.md`, matching the `id`. Body = free-text description.

## The structure rule

The **connections** drawn between components are **never stored here** — they are
derived from flows (two components connect iff their activities run back-to-back
in some flow). The only structural links you author are:

- `parent` — what this component is *part of* (composition). One parent, or `""`
  for top-level.
- `uses` — other components it *statically depends on* (imports/calls). Directed;
  distinct from the undirected, flow-derived connections.

## Frontmatter

| Field        | Required | Type / values        | Meaning |
|--------------|----------|----------------------|---------|
| `id`         | yes      | `C-<n>`               | Identity; equals the filename stem. |
| `title`      | yes      | string               | Component name. Its camelCase form is the **handle** used in expressions. |
| `parent`     | no       | `C-<n>`               | The component this is part of; `""`/absent = top-level. |
| `uses`       | no       | list of `C-<n>`       | Static dependencies (this component uses those). |
| `activities` | no       | list of activity objects | Units of behaviour it performs — see below. |
| `variables`  | no       | list of variable objects | Typed state it owns — see below. |
| `decisions`  | no       | list of `D-<n>`       | Design decisions that shaped it. |
| `created`    | no       | `"YYYY-MM-DD"`        | Creation date. |
| `inferred`   | no       | `true`                | Low-confidence marker. |

### Activity objects (`activities`)

| Field       | Type            | Meaning |
|-------------|-----------------|---------|
| `id`        | `ACT-<n>`        | **Project-wide** unique (flows reference it directly). |
| `label`     | string          | Human description of the step. |
| `pre`       | boolean expr    | Optional precondition guard over variables. |
| `effects`   | list of exprs   | Optional assignments (`handle.name := value`) applied when it runs. |
| `initiator` | `SH-<n>`/`C-<n>`  | Optional sender of this step, for the derived sequence diagram. |

### Variable objects (`variables`)

| Field         | Type                        | Meaning |
|---------------|-----------------------------|---------|
| `id`          | `VAR-<n>`                    | Project-wide unique. |
| `name`        | identifier                  | Referenced as `<handle>.<name>` in expressions. |
| `type`        | `bool` \| `int` \| `enum`     | The variable's type. |
| `min`/`max`   | number (int only)           | Optional bounds. |
| `values`      | list (enum only)            | The allowed members. |
| `initial`     | string                      | Starting value for the simulator (quote numbers: `"0"`). |
| `description` | string                      | What the variable means. |

## Expressions

References are `<handle>.<name>` — the handle is the camelCase of the component
**title** (`"Interlock Controller"` → `interlockController`). Guards/`pre` use
`== != < <= > >= && || !` and parentheses; `effects` assign with `:=`. The handle
must belong to a component that declares that variable.

## Template

```markdown
---
id: C-001
title: Controller
variables:
  - id: VAR-001
    name: running
    type: bool
    initial: "false"
activities:
  - id: ACT-001
    label: Halt all actuators
    effects:
      - "controller.running := false"
---

The safety brain of the system.
```
