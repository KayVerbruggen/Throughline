// ---------------------------------------------------------------------------
// Human- and LLM-readable format documentation, scaffolded into a project.
//
// A Throughline project is just a folder of plain-text files, so it should be
// legible without the app. When a new project is created we drop a `README.md`
// at the root, an `AGENTS.md` generation contract, and a `README.md` inside each
// per-kind folder explaining that kind's exact file format. This lets a human
// read the model by hand and lets an LLM author valid artifacts straight away,
// with no access to this source.
//
// These are the *single source of truth* for that documentation: the same
// strings are written into new projects (see `tauriStorage.createProject`) and
// into the bundled `docs/` and `examples/pound-lock/` projects (via
// `scripts/emit-project-docs.ts`), so the two can never drift.
//
// The app's loader ignores `README.md` / `AGENTS.md` (see `read_project` in
// `src-tauri/src/storage.rs`), so these files sit safely alongside the artifacts
// without being parsed as ones.
// ---------------------------------------------------------------------------

export interface ProjectDocFile {
  /** "" for the project root, otherwise the per-kind folder name. */
  subdir: string;
  filename: string;
  content: string;
}

const ROOT_README = `# Throughline project

This folder is a **Throughline** project: a lightweight, plain-text model of a
system that traces it from the people it serves down to the tests that verify it.
There is no database and no binary format — every artifact is one Markdown file
with a YAML header, so the whole model is readable, diff-able, and git-friendly
without the app. You can edit these files by hand or have an LLM generate them;
the app watches the folder and reloads when files change underneath it.

## The trace spine

The heart of the model is a forward-only chain. Each artifact names its
**parent(s)** in a \`trace:\` list; the reverse direction ("what traces to me")
is computed, never stored.

\`\`\`
Stakeholder ──held by── Need ──trace──▶ Use Case ──trace──▶ Requirement ──trace──▶ Test
\`\`\`

- A **Need** names the **Stakeholder** who holds it.
- A **Use Case** traces to the **Needs** it satisfies.
- A **Requirement** traces to the **Use Cases** it makes precise (EARS "shall").
- A **Test** traces to the **Requirements** it verifies.

Around that spine sit four supporting kinds: **Components** (the parts of the
system) own the **Activities** that **Flows** sequence into behaviour;
**Decisions** record *why* the design is the way it is; the **Glossary** pins
down domain vocabulary.

## Folders and ids

One folder per kind, one file per artifact. **The filename is the artifact's id
plus \`.md\`** (e.g. \`N-006.md\`), and that id is repeated inside the file so
identity survives a rename — the in-file id always wins.

| Folder           | Kind         | Id prefix | What it holds                              |
|------------------|--------------|-----------|--------------------------------------------|
| \`stakeholders/\`  | Stakeholder  | \`SH-\`     | Who the system is for                      |
| \`needs/\`         | Need         | \`N-\`      | What those people need                     |
| \`use-cases/\`     | Use Case     | \`UC-\`     | How the system satisfies a need            |
| \`requirements/\`  | Requirement  | \`R-\`      | Precise "shall" statements (EARS)          |
| \`components/\`    | Component    | \`C-\`      | The parts of the system, as a hierarchy    |
| \`flows/\`         | Flow         | \`FL-\`     | One behaviour per use case, as steps       |
| \`decisions/\`     | Decision     | \`D-\`      | Architectural choices, as Y-statements     |
| \`glossary/\`      | Glossary     | \`G-\`      | Domain terms                               |
| \`tests/\`         | Test         | \`T-\`      | Verification of requirements               |

**Each folder has its own \`README.md\`** documenting that kind's frontmatter
fields, body, and a copy-paste template. Start there when authoring a file.

## File anatomy

Every artifact file is YAML **frontmatter** (between \`---\` fences) followed by an
optional Markdown **body**:

\`\`\`markdown
---
id: N-006
title: Structure and behaviour that cannot silently drift
status: approved
moscow: must
stakeholder: SH-001
tags:
  - consistency
created: "2026-07-14"
---

Free-text body — the rationale, description, or (for some kinds) a generated
sentence. Its meaning depends on the kind; see the folder's README.
\`\`\`

Parsing is deliberately forgiving (files are hand-edited and git-merged): unknown
keys are ignored, missing optional fields fall back to sensible defaults, and a
malformed file degrades rather than breaking the load. Serialization is
deterministic, so re-saving a file from the app produces a minimal, stable diff.

## The one rule that will surprise you

**Structure connections between components are never stored — they are derived
from behaviour.** Two components are shown as connected if and only if their
activities run back-to-back in some flow. So you shape the system diagram by
writing flows, not by drawing edges. The only structural links you *do* author
are a component's \`parent\` (what it is part of) and its \`uses\` (what it statically
depends on). See \`components/README.md\` and \`flows/README.md\`.

## Generated bodies

Two kinds have bodies that are **composed from their frontmatter slots, not
hand-typed**: a **Requirement**'s EARS sentence and a **Decision**'s Y-statement.
Edit the slots; the sentence follows. If you hand-write the body it will be
overwritten the next time the app saves the file.

## For LLMs

See **\`AGENTS.md\`** at the project root for a compact generation contract — the
invariants to respect, id allocation, expression syntax, and a worked example —
so you can author correct artifacts without reading the app's source.

---

*\`README.md\` and \`AGENTS.md\` files (root and per-folder) are documentation only;
the app's loader ignores them, so they never appear as artifacts.*
`;

const ROOT_AGENTS = `# AGENTS.md — authoring Throughline artifacts

You are generating or editing files in a **Throughline** project. Each artifact
is one Markdown file: YAML frontmatter + an optional Markdown body. This file is
the contract; each folder's \`README.md\` has the per-kind field detail and a
template. Follow the rules below and the files you write will load cleanly.

## Folders, kinds, id prefixes

| Folder          | Kind        | Prefix | Traces to (parent) |
|-----------------|-------------|--------|--------------------|
| \`stakeholders/\` | stakeholder | \`SH-\`  | — (root of spine)  |
| \`needs/\`        | need        | \`N-\`   | a stakeholder (via \`stakeholder:\`, not \`trace\`) |
| \`use-cases/\`    | use-case    | \`UC-\`  | needs (\`N-…\`)       |
| \`requirements/\` | requirement | \`R-\`   | use cases (\`UC-…\`)  |
| \`components/\`   | component   | \`C-\`   | — (structural, not spine) |
| \`flows/\`        | flow        | \`FL-\`  | — (referenced by a use case's \`flow:\`) |
| \`decisions/\`    | decision    | \`D-\`   | use cases (\`UC-…\`)  |
| \`glossary/\`     | glossary    | \`G-\`   | — |
| \`tests/\`        | test        | \`T-\`   | requirements (\`R-…\`) |

## Rules you must respect

1. **Filename = id + \`.md\`**, and repeat the id in the frontmatter. Ids are
   zero-padded to three digits within their prefix (\`N-001\`, \`N-002\`, …).
   Allocate the next unused number for the kind; never reuse or renumber.
2. **Trace is forward-only.** A child lists its parents in \`trace:\`. Never invent
   a reverse "children" field — the app computes those. Only reference ids that
   exist.
3. **Never author structure connections.** Component-to-component connections are
   derived from flow adjacency. To make two components connect, put their
   activities next to each other in a flow. The only stored structural links are
   a component's \`parent\` and \`uses\`.
4. **Generated bodies.** For a **requirement**, the body is the composed EARS
   sentence; for a **decision**, the composed Y-statement. Fill the slots
   (\`subject\`/\`action\`/… or \`context\`/\`concern\`/…); you may leave the body empty
   and the app will generate it. Do not rely on hand-written prose there.
5. **Activities live on components, not flows.** A flow's \`main\` / alternate
   \`steps\` are *references* to activity ids (\`ACT-…\`) that some component owns, or
   a flow id (\`FL-…\`) to invoke another use case's flow as a subflow. Define the
   activity under a component first, then reference it.
6. **Expression syntax** (activity \`pre\`/\`effects\`, alternate-path \`guard\`):
   references are \`<componentHandle>.<variableName>\`, where the handle is the
   camelCase of the component's title (\`"Interlock Controller"\` →
   \`interlockController\`). Guards/preconditions are boolean expressions using
   \`== != < <= > >= && || !\` and parentheses; effects are assignments with
   \`:=\` (\`upstreamGate.state := open\`). Variables must be declared on the
   component that owns the handle.
7. **YAML hygiene.** Quote values containing \`:\`, and quote date-like or
   number-like strings you want kept literal (\`created: "2026-07-14"\`,
   \`initial: "0"\`). Lists are YAML sequences (\`-\` items). Enumerated fields only
   accept their listed values (see the folder README) — an unknown value falls
   back to a default.

## Minimal worked example

\`\`\`markdown
# stakeholders/SH-001.md
---
id: "SH-001"
title: "Operator"
type: "primary"
---
Runs the system day to day.
\`\`\`

\`\`\`markdown
# needs/N-001.md
---
id: N-001
title: Safe shutdown
status: approved
moscow: must
stakeholder: SH-001
---
The operator needs to stop the system without leaving it in an unsafe state.
\`\`\`

\`\`\`markdown
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
\`\`\`

\`\`\`markdown
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
\`\`\`

For every field, its type, and the allowed values, read the target folder's
\`README.md\` before writing.
`;

// --- per-kind folder READMEs ------------------------------------------------

const STAKEHOLDERS_README = `# \`stakeholders/\` — Stakeholder (\`SH-…\`)

**Who the system is for.** A stakeholder is a person or party the design serves
or affects. Needs hang off stakeholders (a Need names its stakeholder), so this
is the root of the trace spine. Stakeholders are *not* prioritised — no
status/MoSCoW — they're just who's in the picture.

**Filename:** \`SH-<n>.md\` (e.g. \`SH-001.md\`), matching the \`id\`.

## Frontmatter

| Field      | Required | Type / values             | Meaning |
|------------|----------|---------------------------|---------|
| \`id\`       | yes      | \`SH-<n>\`                   | Identity; must equal the filename stem. |
| \`title\`    | yes      | string                    | The stakeholder's name/role, e.g. "Lock Operator". |
| \`type\`     | no       | \`primary\` \\| \`secondary\`   | Direct target of the design (\`primary\`) vs indirectly affected (\`secondary\`). Default \`primary\`. |
| \`created\`  | no       | \`"YYYY-MM-DD"\`             | Creation date (quote it). |
| \`inferred\` | no       | \`true\`                     | Mark as low-confidence / not yet human-confirmed. Omit when trusted. |

## Body

Free text: who they are and what they care about.

## Template

\`\`\`markdown
---
id: "SH-001"
title: "Operator"
type: "primary"
---

Runs the system day to day; cares about a predictable, safe routine.
\`\`\`
`;

const NEEDS_README = `# \`needs/\` — Need (\`N-…\`)

**What a stakeholder needs.** A need is a problem or goal in the stakeholder's
terms, before any solution. Use cases trace *up* to needs, so a need with no use
case is an unmet need (visible in the Traceability view).

**Filename:** \`N-<n>.md\`, matching the \`id\`.

## Frontmatter

| Field         | Required | Type / values                    | Meaning |
|---------------|----------|----------------------------------|---------|
| \`id\`          | yes      | \`N-<n>\`                           | Identity; equals the filename stem. |
| \`title\`       | yes      | string                           | Short statement of the need. |
| \`status\`      | no       | \`draft\` \\| \`approved\` \\| \`deprecated\` | Lifecycle. Default \`draft\`. |
| \`moscow\`      | no       | \`must\` \\| \`should\` \\| \`could\` \\| \`wont\` | Priority. Default \`should\`. |
| \`stakeholder\` | no       | \`SH-<n>\`                          | The stakeholder who holds this need; \`""\`/absent = unassigned. |
| \`source\`      | no       | string                           | Where the need came from (a document, interview, etc.). |
| \`tags\`        | no       | list of strings                  | Free-form labels for grouping/filter. |
| \`created\`     | no       | \`"YYYY-MM-DD"\`                    | Creation date. |
| \`inferred\`    | no       | \`true\`                            | Low-confidence marker. |

## Body

Free text: the rationale — why this matters, in the stakeholder's language.

## Template

\`\`\`markdown
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
\`\`\`
`;

const USE_CASES_README = `# \`use-cases/\` — Use Case (\`UC-…\`)

**How the system satisfies needs.** A use case is a goal the system helps a user
achieve, told through user stories. It traces *up* to the needs it serves and
*down* (via \`flow:\`) to the behaviour that realises it.

**Filename:** \`UC-<n>.md\`, matching the \`id\`. **The body is empty** — everything
lives in frontmatter, and the behaviour is a separate Flow artifact.

## Frontmatter

| Field           | Required | Type / values                    | Meaning |
|-----------------|----------|----------------------------------|---------|
| \`id\`            | yes      | \`UC-<n>\`                          | Identity; equals the filename stem. |
| \`title\`         | yes      | string                           | The user's goal, e.g. "Pass a vessel downstream". |
| \`status\`        | no       | \`draft\` \\| \`approved\` \\| \`deprecated\` | Lifecycle. Default \`draft\`. |
| \`moscow\`        | no       | \`must\` \\| \`should\` \\| \`could\` \\| \`wont\` | Priority. Default \`should\`. |
| \`trace\`         | no       | list of \`N-<n>\`                   | The needs this use case satisfies. |
| \`actors\`        | no       | list of strings                  | Participants (often stakeholder names, plus the system). |
| \`stories\`       | no       | list of story objects            | User stories — see below. |
| \`preconditions\` | no       | list of strings                  | What must hold before the use case runs. |
| \`flow\`          | no       | \`FL-<n>\`                          | The flow that implements this use case's behaviour. |
| \`created\`       | no       | \`"YYYY-MM-DD"\`                    | Creation date. |
| \`inferred\`      | no       | \`true\`                            | Low-confidence marker. |

### Story objects (\`stories\`)

Each is the fixed "As a / I want / so that" template:

| Field     | Type   | Meaning |
|-----------|--------|---------|
| \`id\`      | \`US-<n>\` | Unique within this use case. |
| \`as_a\`    | string | The role. |
| \`i_want\`  | string | The capability wanted. |
| \`so_that\` | string | The payoff / reason. |

## Template

\`\`\`markdown
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
\`\`\`
`;

const REQUIREMENTS_README = `# \`requirements/\` — Requirement (\`R-…\`)

**Precise "shall" statements.** A requirement makes a use case testable, written
in **EARS** (Easy Approach to Requirements Syntax). It traces *up* to the use
cases it constrains and is verified *down* by tests.

**Filename:** \`R-<n>.md\`, matching the \`id\`.

## The body is generated

The Markdown body is the **composed EARS sentence** — built from the slots below,
never hand-authored. Fill the slots; leave the body empty and the app writes it:

\`\`\`
[KEYWORD <condition>,] the <subject> shall <action> <object> <constraint>.
\`\`\`

## Frontmatter

| Field          | Required | Type / values | Meaning |
|----------------|----------|---------------|---------|
| \`id\`           | yes      | \`R-<n>\`        | Identity; equals the filename stem. |
| \`title\`        | yes      | string        | Short handle for the requirement. |
| \`status\`       | no       | \`draft\` \\| \`approved\` \\| \`deprecated\` | Lifecycle. Default \`draft\`. |
| \`moscow\`       | no       | \`must\` \\| \`should\` \\| \`could\` \\| \`wont\` | Priority. Default \`should\`. |
| \`trace\`        | no       | list of \`UC-<n>\` | The use cases this requirement makes precise. |
| \`format\`       | no       | \`EARS\`        | Always \`EARS\`. |
| \`ears_pattern\` | no       | see below     | Which EARS pattern. Default \`ubiquitous\`. |
| \`condition\`    | when patterned | string  | The WHEN/WHILE/IF/WHERE clause. Empty for \`ubiquitous\`. |
| \`subject\`      | yes      | string        | Who "shall" — e.g. "lock system". |
| \`action\`       | yes      | string        | The required verb phrase — e.g. "halt all actuators". |
| \`object\`       | no       | string        | Object of the action. |
| \`constraint\`   | no       | string        | A qualifier — e.g. "within 500 ms". |
| \`created\`      | no       | \`"YYYY-MM-DD"\` | Creation date. |
| \`inferred\`     | no       | \`true\`        | Low-confidence marker. |

### EARS patterns (\`ears_pattern\`)

| Value                | Keyword       | Use when… |
|----------------------|---------------|-----------|
| \`ubiquitous\`         | (none)        | An ever-present property. No \`condition\`. |
| \`event-driven\`      | WHEN          | A response to a triggering event. |
| \`state-driven\`      | WHILE         | Active while the system is in a state. |
| \`unwanted-behavior\` | IF … THEN     | Handling an error / unwanted condition. |
| \`optional\`          | WHERE         | Applies only where an optional feature is present. |
| \`complex\`           | WHEN (+state) | Combines a state and a trigger. |

## Template

\`\`\`markdown
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
\`\`\`
`;

const COMPONENTS_README = `# \`components/\` — Component (\`C-…\`)

**The parts of the system.** Components form a hierarchy (via \`parent\`), own the
**activities** flows sequence, and declare the typed **variables** behaviour
expressions read and write.

**Filename:** \`C-<n>.md\`, matching the \`id\`. Body = free-text description.

## The structure rule

The **connections** drawn between components are **never stored here** — they are
derived from flows (two components connect iff their activities run back-to-back
in some flow). The only structural links you author are:

- \`parent\` — what this component is *part of* (composition). One parent, or \`""\`
  for top-level.
- \`uses\` — other components it *statically depends on* (imports/calls). Directed;
  distinct from the undirected, flow-derived connections.

## Frontmatter

| Field        | Required | Type / values        | Meaning |
|--------------|----------|----------------------|---------|
| \`id\`         | yes      | \`C-<n>\`               | Identity; equals the filename stem. |
| \`title\`      | yes      | string               | Component name. Its camelCase form is the **handle** used in expressions. |
| \`parent\`     | no       | \`C-<n>\`               | The component this is part of; \`""\`/absent = top-level. |
| \`uses\`       | no       | list of \`C-<n>\`       | Static dependencies (this component uses those). |
| \`activities\` | no       | list of activity objects | Units of behaviour it performs — see below. |
| \`variables\`  | no       | list of variable objects | Typed state it owns — see below. |
| \`decisions\`  | no       | list of \`D-<n>\`       | Design decisions that shaped it. |
| \`created\`    | no       | \`"YYYY-MM-DD"\`        | Creation date. |
| \`inferred\`   | no       | \`true\`                | Low-confidence marker. |

### Activity objects (\`activities\`)

| Field       | Type            | Meaning |
|-------------|-----------------|---------|
| \`id\`        | \`ACT-<n>\`        | **Project-wide** unique (flows reference it directly). |
| \`label\`     | string          | Human description of the step. |
| \`pre\`       | boolean expr    | Optional precondition guard over variables. |
| \`effects\`   | list of exprs   | Optional assignments (\`handle.name := value\`) applied when it runs. |
| \`initiator\` | \`SH-<n>\`/\`C-<n>\`  | Optional sender of this step, for the derived sequence diagram. |

### Variable objects (\`variables\`)

| Field         | Type                        | Meaning |
|---------------|-----------------------------|---------|
| \`id\`          | \`VAR-<n>\`                    | Project-wide unique. |
| \`name\`        | identifier                  | Referenced as \`<handle>.<name>\` in expressions. |
| \`type\`        | \`bool\` \\| \`int\` \\| \`enum\`     | The variable's type. |
| \`min\`/\`max\`   | number (int only)           | Optional bounds. |
| \`values\`      | list (enum only)            | The allowed members. |
| \`initial\`     | string                      | Starting value for the simulator (quote numbers: \`"0"\`). |
| \`description\` | string                      | What the variable means. |

**Declare one variable over the states that can actually occur — not one per
thing you can point at.** If two candidate variables can never legally vary
independently, they are one variable. Two red/green signs that must never both
be green are not \`upper: red|green\` + \`lower: red|green\` (four states, one of
them the exact failure the signs exist to prevent) — they are
\`permits: neither|upper|lower\`. Modelling them separately lets the project write
down an illegal state, and forces an activity for every *combination*
("show red at the upper reach", "show red on both reaches", …) instead of one per
real transition. The tell: **you are writing an activity whose effects set both
variables together.**

## Expressions

References are \`<handle>.<name>\` — the handle is the camelCase of the component
**title** (\`"Interlock Controller"\` → \`interlockController\`). Guards/\`pre\` use
\`== != < <= > >= && || !\` and parentheses; \`effects\` assign with \`:=\`. The handle
must belong to a component that declares that variable.

## Template

\`\`\`markdown
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
\`\`\`
`;

const FLOWS_README = `# \`flows/\` — Flow (\`FL-…\`)

**One behaviour, as ordered steps.** A flow is the behaviour of a single use case
(the use case points to it via \`flow:\`). It is a \`main\` sequence of steps plus
\`alternates\` that branch off and rejoin. Flows are what **derive** the structure
diagram: adjacent steps owned by different components become a connection.

**Filename:** \`FL-<n>.md\`, matching the \`id\`. Body is empty.

## Steps are references

Each entry in \`main\` (and each alternate's \`steps\`) is one of:

- an **activity id** (\`ACT-…\`) — defined on some component (see
  \`components/README.md\`); or
- a **flow id** (\`FL-…\`) — a **subflow**: invoke another use case's flow inline,
  rather than restating its steps. Connections derive *through* the call, and
  running the flow *executes* the call — the callee's guards and effects act on
  the same component variables, then the caller resumes after the call step.

## Frontmatter

| Field        | Required | Type / values          | Meaning |
|--------------|----------|------------------------|---------|
| \`id\`         | yes      | \`FL-<n>\`                | Identity; equals the filename stem. |
| \`title\`      | yes      | string                 | Usually mirrors the use case's title. |
| \`main\`       | yes      | list of \`ACT-…\`/\`FL-…\`  | The happy-path steps, in order. |
| \`alternates\` | no       | list of alt-path objects | Branches — see below. |
| \`created\`    | no       | \`"YYYY-MM-DD"\`          | Creation date. |
| \`inferred\`   | no       | \`true\`                  | Low-confidence marker. |

### Alternate-path objects (\`alternates\`)

Indices are **0-based positions into \`main\`**.

| Field       | Type              | Meaning |
|-------------|-------------------|---------|
| \`id\`        | \`AP-<n>\`           | Unique within this flow. |
| \`condition\` | string            | Human label for the branch, e.g. "the chamber is not clear". |
| \`guard\`     | boolean expr      | Optional formal guard over component variables (see \`components/README.md\`). |
| \`after\`     | int               | Diverges *after* this main-step index. |
| \`rejoin\`    | int               | Rejoins the main flow at this index, or \`-1\` to end the flow. |
| \`steps\`     | list of \`ACT-…\`/\`FL-…\` | The branch's own steps. |

## Template

\`\`\`markdown
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
\`\`\`
`;

const DECISIONS_README = `# \`decisions/\` — Decision (\`D-…\`)

**Why the design is the way it is.** A design decision records an architectural
choice — including what was rejected and the downside accepted — so the rationale
outlives the people who made it. It traces to the use cases it serves;
components link back to the decisions that shaped them.

**Filename:** \`D-<n>.md\`, matching the \`id\`.

## The body is generated

The body is a **composed Y-statement** built from the slots below, never
hand-authored:

\`\`\`
In the <context>, facing <concern>, we decided <decision> and not <alternatives>
to achieve <criterion>, accepting <downside>.
\`\`\`

## Frontmatter

| Field          | Required | Type / values                       | Meaning |
|----------------|----------|-------------------------------------|---------|
| \`id\`           | yes      | \`D-<n>\`                              | Identity; equals the filename stem. |
| \`title\`        | yes      | string                              | Short name for the decision. |
| \`status\`       | no       | \`proposed\` \\| \`accepted\` \\| \`superseded\` | Lifecycle (a decision isn't MoSCoW-prioritised). Default \`proposed\`. |
| \`trace\`        | no       | list of \`UC-<n>\`                     | Use cases this decision addresses. |
| \`context\`      | yes      | string                              | The situation — "In the <context>". |
| \`concern\`      | yes      | string                              | The force at play — "facing <concern>". |
| \`decision\`     | yes      | string                              | The choice — "we decided <decision>". |
| \`alternatives\` | no       | string                              | What was rejected — "and not <alternatives>". |
| \`criterion\`    | yes      | string                              | The goal — "to achieve <criterion>". |
| \`downside\`     | no       | string                              | The accepted cost — "accepting <downside>". |
| \`created\`      | no       | \`"YYYY-MM-DD"\`                       | Creation date. |
| \`inferred\`     | no       | \`true\`                               | Low-confidence marker. |

## Template

\`\`\`markdown
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
\`\`\`
`;

const GLOSSARY_README = `# \`glossary/\` — Glossary term (\`G-…\`)

**The project's shared vocabulary.** A glossary entry defines one domain term so
other artifacts can use it precisely instead of restating it. The title is the
term; the body is its definition.

**Filename:** \`G-<n>.md\`, matching the \`id\`.

## Frontmatter

| Field      | Required | Type / values   | Meaning |
|------------|----------|-----------------|---------|
| \`id\`       | yes      | \`G-<n>\`          | Identity; equals the filename stem. |
| \`title\`    | yes      | string          | The term being defined. |
| \`aliases\`  | no       | list of strings | Synonyms / abbreviations that mean the same thing. |
| \`created\`  | no       | \`"YYYY-MM-DD"\`   | Creation date. |
| \`inferred\` | no       | \`true\`           | Low-confidence marker. |

## Body

The definition (Markdown). Cross-link related terms or decisions in prose.

## Template

\`\`\`markdown
---
id: G-001
title: Structure connection
aliases:
  - connection
---

A link drawn between two components in the Structure view. It is **derived**, not
stored: two components connect exactly when their activities run back-to-back in
some flow.
\`\`\`
`;

const TESTS_README = `# \`tests/\` — Test (\`T-…\`)

**Verification of requirements.** A test is the leaf of the trace spine: it
traces to the requirement(s) it checks and records its latest result. The tool
never runs the test — an author or CI records the outcome into the file.

**Filename:** \`T-<n>.md\`, matching the \`id\`. Body = description of what it checks.

## Frontmatter

| Field      | Required | Type / values              | Meaning |
|------------|----------|----------------------------|---------|
| \`id\`       | yes      | \`T-<n>\`                     | Identity; equals the filename stem. |
| \`title\`    | yes      | string                     | Short name for the test. |
| \`trace\`    | no       | list of \`R-<n>\`             | The requirements this test verifies. |
| \`file\`     | no       | path string                | Where the test lives, e.g. \`src/model/trace.test.ts\`. |
| \`result\`   | no       | \`pass\` \\| \`fail\` \\| \`unknown\` | Latest known outcome. Default \`unknown\` (not yet run/recorded). |
| \`created\`  | no       | \`"YYYY-MM-DD"\`              | Creation date. |
| \`inferred\` | no       | \`true\`                      | Low-confidence marker. |

## Template

\`\`\`markdown
---
id: T-001
title: Halt on stop is immediate
trace:
  - R-001
result: pass
file: src/controller/stop.test.ts
---

Asserts that pressing the emergency stop drives every actuator to halted within
the 500 ms budget.
\`\`\`
`;

/**
 * Every documentation file scaffolded into a project, in a stable order. The
 * root README/AGENTS first, then one README per kind folder.
 */
export const PROJECT_DOC_FILES: ProjectDocFile[] = [
  { subdir: "", filename: "README.md", content: ROOT_README },
  { subdir: "", filename: "AGENTS.md", content: ROOT_AGENTS },
  { subdir: "stakeholders", filename: "README.md", content: STAKEHOLDERS_README },
  { subdir: "needs", filename: "README.md", content: NEEDS_README },
  { subdir: "use-cases", filename: "README.md", content: USE_CASES_README },
  { subdir: "requirements", filename: "README.md", content: REQUIREMENTS_README },
  { subdir: "components", filename: "README.md", content: COMPONENTS_README },
  { subdir: "flows", filename: "README.md", content: FLOWS_README },
  { subdir: "decisions", filename: "README.md", content: DECISIONS_README },
  { subdir: "glossary", filename: "README.md", content: GLOSSARY_README },
  { subdir: "tests", filename: "README.md", content: TESTS_README },
];
