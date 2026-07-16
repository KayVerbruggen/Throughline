# AGENTS.md — authoring Throughline artifacts

You are generating or editing files in a **Throughline** project. Each artifact
is one Markdown file: YAML frontmatter + an optional Markdown body. This file is
the contract; each folder's `README.md` has the per-kind field detail and a
template. Follow the rules below and the files you write will load cleanly.

## Folders, kinds, id prefixes

| Folder          | Kind        | Prefix | Traces to (parent) |
|-----------------|-------------|--------|--------------------|
| `stakeholders/` | stakeholder | `SH-`  | — (root of spine)  |
| `needs/`        | need        | `N-`   | a stakeholder (via `stakeholder:`, not `trace`) |
| `use-cases/`    | use-case    | `UC-`  | needs (`N-…`)       |
| `requirements/` | requirement | `R-`   | use cases (`UC-…`)  |
| `components/`   | component   | `C-`   | — (structural, not spine) |
| `flows/`        | flow        | `FL-`  | — (referenced by a use case's `flow:`) |
| `decisions/`    | decision    | `D-`   | use cases (`UC-…`)  |
| `glossary/`     | glossary    | `G-`   | — |
| `tests/`        | test        | `T-`   | requirements (`R-…`) |

## Rules you must respect

1. **Filename = id + `.md`**, and repeat the id in the frontmatter. Ids are
   zero-padded to three digits within their prefix (`N-001`, `N-002`, …).
   Allocate the next unused number for the kind; never reuse or renumber.
2. **Trace is forward-only.** A child lists its parents in `trace:`. Never invent
   a reverse "children" field — the app computes those. Only reference ids that
   exist.
3. **Never author structure connections.** Component-to-component connections are
   derived from flow adjacency. To make two components connect, put their
   activities next to each other in a flow. The only stored structural links are
   a component's `parent` and `uses`.
4. **Generated bodies.** For a **requirement**, the body is the composed EARS
   sentence; for a **decision**, the composed Y-statement. Fill the slots
   (`subject`/`action`/… or `context`/`concern`/…); you may leave the body empty
   and the app will generate it. Do not rely on hand-written prose there.
5. **Activities live on components, not flows.** A flow's `main` / alternate
   `steps` are *references* to activity ids (`ACT-…`) that some component owns, or
   a flow id (`FL-…`) to invoke another use case's flow as a subflow. Define the
   activity under a component first, then reference it.
6. **Expression syntax** (activity `pre`/`effects`, alternate-path `guard`):
   references are `<componentHandle>.<variableName>`, where the handle is the
   camelCase of the component's title (`"Interlock Controller"` →
   `interlockController`). Guards/preconditions are boolean expressions using
   `== != < <= > >= && || !` and parentheses; effects are assignments with
   `:=` (`upstreamGate.state := open`). Variables must be declared on the
   component that owns the handle.
7. **YAML hygiene.** Quote values containing `:`, and quote date-like or
   number-like strings you want kept literal (`created: "2026-07-14"`,
   `initial: "0"`). Lists are YAML sequences (`-` items). Enumerated fields only
   accept their listed values (see the folder README) — an unknown value falls
   back to a default.

## Minimal worked example

```markdown
# stakeholders/SH-001.md
---
id: "SH-001"
title: "Operator"
type: "primary"
---
Runs the system day to day.
```

```markdown
# needs/N-001.md
---
id: N-001
title: Safe shutdown
status: approved
moscow: must
stakeholder: SH-001
---
The operator needs to stop the system without leaving it in an unsafe state.
```

```markdown
# use-cases/UC-001.md
---
id: UC-001
title: Emergency stop
status: approved
trace: [N-001]
moscow: must
actors: [Operator]
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

```markdown
# requirements/R-001.md
---
id: R-001
title: Halt on stop
status: approved
trace: [UC-001]
format: EARS
ears_pattern: event-driven
condition: the operator presses the emergency stop
subject: system
action: halt all actuators
constraint: within 500 ms
moscow: must
---
```

For every field, its type, and the allowed values, read the target folder's
`README.md` before writing.
