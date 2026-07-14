# Reverse-engineering a codebase into Throughline — a guide for LLMs

You are being asked to read an existing codebase and produce a Throughline
project: a first-cut model that recovers the design intent the code only implies.
This guide is written by an agent that just did exactly that to Throughline's own
source (see the sibling [`README.md`](README.md) and the resulting artifacts in
this folder). It is a mix of *how the format works*, *how to think about the
mapping*, and *where the data model will fight you* — the last part is the most
valuable, because it's what you can't discover from the type definitions alone.

---

## 1. What you are producing

A folder with exactly these per-kind subfolders. The app reads nothing else:

```
<project>/
  stakeholders/   requirements/   decisions/
  needs/          components/     glossary/
  use-cases/      flows/          tests/
```

One file per artifact. **The filename is the id plus `.md`** (`N-006.md`), and the
id is *also* written inside the file — identity survives a rename because the
in-file id wins.

Each file is **YAML frontmatter + a Markdown body**:

```markdown
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

Free-text body. For most kinds this is the description / rationale.
```

Parsing is deliberately forgiving (missing fields coerce to defaults; a missing
frontmatter block treats the whole file as body), so a slightly-off file still
loads. Do not rely on that — aim to emit clean files — but know that you will not
"break the project" with one imperfect record.

### Id conventions (must match exactly)

| Kind        | Prefix | Example  | Folder          |
|-------------|--------|----------|-----------------|
| stakeholder | `SH-`  | `SH-001` | `stakeholders/` |
| need        | `N-`   | `N-001`  | `needs/`        |
| use case    | `UC-`  | `UC-001` | `use-cases/`    |
| requirement | `R-`   | `R-001`  | `requirements/` |
| component   | `C-`   | `C-001`  | `components/`   |
| flow        | `FL-`  | `FL-001` | `flows/`        |
| decision    | `D-`   | `D-001`  | `decisions/`    |
| glossary    | `G-`   | `G-001`  | `glossary/`     |
| test        | `T-`   | `T-001`  | `tests/`        |

Nested ids, all **project-wide unique**: `ACT-001` (activity), `VAR-001`
(variable), `US-001` (user story, per use case), `AP-1` (alternate path, per
flow — note: *not* zero-padded). Numbers are zero-padded to 3 digits except
`AP-`. When the tool generates the next id it takes `max(existing) + 1` per
prefix, so keep them dense and contiguous if you can.

### Field cheat-sheet per kind

- **stakeholder** — `title` (their name), `type: primary | secondary`, body =
  description. No status/moscow (stakeholders aren't prioritised).
- **need** — `status`, `moscow`, `stakeholder: SH-xxx` (who holds it), optional
  `source`, `tags: []`, body = rationale.
- **use-case** — `trace: [N-xxx]` (parent needs), `actors: []`, `stories: [{id,
  as_a, i_want, so_that}]`, `preconditions: []`, `flow: FL-xxx` (or `""`). Body is
  empty — a use case carries no prose.
- **requirement** — `trace: [UC-xxx]`, `format: EARS`, `ears_pattern`, and the
  **structured slots** `condition`, `subject`, `action`, `object`, `constraint`.
  The body is the *composed* sentence and is generated, never authored (see §2).
- **component** — optional `parent: C-xxx`, `activities: [{id, label, pre?,
  effects?}]`, `variables: [{id, name, type, …}]`, body = description.
- **flow** — `main: [ACT-xxx]` (ordered), `alternates: [{id, condition, guard?,
  after, rejoin, steps}]`. Body empty.
- **decision** — `status: proposed | accepted | superseded`, `trace: [UC-xxx]`
  (the use cases it addresses), and the **structured slots** `context`,
  `concern`, `decision`, `alternatives`, `criterion`, `downside`. Body is the
  *composed* Y-statement, generated like a requirement (see §2). A component
  links to a decision via its own `decisions: [D-xxx]` list, not the other way.
- **glossary** — `title` (the term), optional `aliases: []`, body = the
  definition. No status. Use `[[G-xxx]]`/`[[D-xxx]]` in bodies to cross-link.
- **test** — `trace: [R-xxx]` (the requirements it verifies), `file` (path to the
  test in the repo), `result: pass | fail | unknown`, body = description. No
  status/moscow. A test is the leaf of the trace spine (it covers requirements the
  way requirements cover use cases); the tool never runs it — `result` is what an
  author or CI recorded.

Every kind also takes an optional `inferred: true` — the low-confidence marker
described in §7. Omit it for artifacts you're sure of.

---

## 2. EARS requirements (get the composition right)

Requirements are not free text. Fill the structured slots and the tool composes
the sentence into the body. Match this composition when you write the body so the
file round-trips cleanly:

| `ears_pattern`      | Composed shape                                              |
|---------------------|-------------------------------------------------------------|
| `ubiquitous`        | `The <subject> shall <action> <object> <constraint>.`       |
| `event-driven`      | `WHEN <condition>, the <subject> shall <action> ….`         |
| `state-driven`      | `WHILE <condition>, the <subject> shall <action> ….`        |
| `unwanted-behavior` | `IF <condition>, THEN the <subject> shall <action> ….`      |
| `optional`          | `WHERE <condition>, the <subject> shall <action> ….`        |
| `complex`           | `WHEN <condition>, the <subject> shall <action> ….`         |

`action`/`object`/`constraint` are just joined with spaces after "shall", so
write them so they read as one phrase. `ubiquitous` takes no condition.

---

## 3. Recommended order of work

Reverse-engineering is bottom-heavy — the code gives you structure and behaviour
directly, and you infer the intent above it. But author top-down so ids and
traces resolve as you go:

1. **Find the system boundary and the actors.** Entry points, CLI commands, HTTP
   routes, the main window, public API. These become **use-case actors** and hint
   at use cases.
2. **Recover stakeholders and needs.** Read the README, product docs, issue
   tracker, comments that say *why*. Who is this for, and what do they need? This
   is the most inferential layer — it is fine for it to be thin and marked
   `draft`.
3. **Draft use cases** from the externally-visible behaviours (a command, an
   endpoint, a screen). Give each a user story or two and trace it to the needs.
4. **Write requirements** as EARS statements for the concrete "shall"s you can
   read off the code (validation rules, error handling, invariants). Trace each to
   a use case.
5. **Map the code to components.** This is the reliable part — see §4.
6. **Extract activities** — the responsibilities of each component (roughly, its
   key exported functions or units of work).
7. **Author flows** for the handful of important end-to-end behaviours, ordering
   activities across components. **This is also how you encode that component A
   talks to component B** — see §5.

Then **validate** (§6) and **stop early** (§7).

---

## 4. Mapping code → components

- A **module / package / directory** with a clear responsibility → one
  **component**. Its folder or file path is worth putting in the description.
- **Composition / ownership** (a submodule inside a module, a subsystem inside the
  app) → the `parent` field. Pick a single root component for the whole app and
  nest everything under it.
- A component's **key responsibilities** (major exported functions, the verbs in
  its public surface) → **activities**. Keep labels human ("Parse a file into a
  typed artifact"), one component owns each activity.
- **Typed state a module owns** (a status enum, a counter, a dirty flag) →
  **variables**, if you intend to formalise any behaviour that reads it (§5).
  `type` is `bool`, `int` (`min`/`max` optional), or `enum` (`values: []`).

Don't over-decompose. Ten to twenty components with a clear hierarchy beats fifty
with none.

---

## 5. The rules that will surprise you

These are the things the type definitions won't tell you and that cost the most
time. Internalise them before you start.

### 5a. Connections between components are NEVER stored — derive them via flows

This is the single most important rule. There is no "C-002 depends on C-003"
field anywhere. The Structure view draws a connection between two components
**iff one component's activity runs immediately before the other's within some
flow.** So:

> To express that module A calls / talks to / depends on module B, you must
> author a **flow** whose ordered steps put an A-activity next to a B-activity.

A static dependency (an `import`, a function call) is *not* expressible on its
own. If two components clearly interact but you can't situate that interaction in
any behaviour, you have two bad options: invent a thin flow just to carry the
edge, or leave the edge out. Prefer authoring a *real* end-to-end flow that
naturally chains them. When self-modelling Throughline, three genuine flows (load
a project, edit-and-save, formalise a guard) produced nine connections for free —
that is the intended workflow. Don't try to enumerate the dependency graph
directly; pick the important behaviours and let the edges fall out.

### 5b. Traces are forward-only and strictly typed by level

A child references its parents in `trace`; reverse lookups are computed, never
stored. And the levels are fixed: **need → use case → requirement → test.** A use
case's `trace` may only contain need ids; a requirement's `trace` may only contain
use case ids; a **test's `trace` may only contain requirement ids.** You cannot
trace a requirement straight to a need, and — importantly — **you cannot trace a
requirement or a need to a component.** A component's link to the spine is inferred
only through the flows it participates in. A component used in no flow is orphaned
from traceability entirely. Plan your flows so the components you care about are
reachable.

### 5c. Guards reference components by a derived handle, not by id

An alternate path's optional `guard` is a boolean expression over component
variables, written `<handle>.<name>` — e.g. `applicationStore.dirty == false`.
The **handle is the camelCase of the component's *title*** ("Application Store" →
`applicationStore`, "Expression Engine" → `expressionEngine`), *not* its id (ids
contain a hyphen, which the expression grammar reads as minus). Consequences:

- Only reference a variable that actually exists on that component, with a
  matching type, or the guard fails to type-check.
- **Renaming a component silently breaks every guard that referenced it**, because
  the handle changes. Name components before you write guards.
- Guards are optional. Leave `guard` off a branch you can't formalise; keep the
  human-readable `condition` either way.

### 5d. One parent only; hierarchy is a strict tree

`parent` is a single id. A module that genuinely belongs to two subsystems
(shared utilities, a serializer used by both storage and model) has to be filed
under one. Put it where it most belongs and mention the other relationship in the
description prose.

### 5e. EARS is aimed at external behaviour, not internal invariants

"Reverse lookups are computed, never stored" is a design invariant, but EARS
forces it into "the <subject> shall …" phrasing. Expect some requirements to read
a little forced when the thing you're describing is an architectural property
rather than an observable behaviour. Pick the closest pattern (`ubiquitous` for
always-true properties) and use the `constraint` slot for the "never/only …" part.

For the *choices* behind those invariants — "we derive structure from behaviour
**instead of** storing it, accepting X" — reach for a **decision** (`D-`), not a
requirement. A decision is authored as a fixed Y-statement composed from slots:

> In the `<context>`, facing `<concern>`, we decided `<decision>` and not
> `<alternatives>` to achieve `<criterion>`, accepting `<downside>`.

Decisions `trace` to the use cases they serve, and the component they shaped
links back via its own `decisions: [D-xxx]` list. This is where the *why* that
used to get crammed into component descriptions now belongs — and, for
reverse-engineering, recovering the *why* is the whole point. The four decisions
in this project's `decisions/` folder record exactly the rules in this section.

### 5f. Flow index bookkeeping

`after` and `rejoin` are **0-based indices into the flow's `main` array**, not
activity ids. An alternate diverges after `main[after]`, runs its `steps`, then
rejoins at `main[rejoin]` — or terminates the flow when `rejoin` is `-1`. Keep
these in range; off-by-one here produces a broken diagram, not a load error.

---

## 6. Validate before you hand off

Cheap checks that catch most mistakes:

- Every id referenced from a flow (`main`, `alternates[].steps`) exists as an
  `ACT-` id on some component.
- Every `after`/`rejoin` is a valid index into `main` (or `-1` for `rejoin`).
- Every `trace` points *up one level* and hits a real id; every `stakeholder` and
  `parent` id resolves.
- Every `guard` type-checks: its handle resolves to a component, its `name` to a
  variable on that component, and the operator types line up.
- Every **decision** `trace` hits a real use case, and every id in a component's
  `decisions` list resolves to a real `D-` — the body matches the composed
  Y-statement, same as the EARS check.
- Look at the derived connection graph and the coverage gaps (needs with no use
  case, use cases with no requirement) and sanity-check them.

You can run these mechanically. When this folder was built, a ~60-line script
loaded every file through the tool's own `parseArtifact`, ran `structureEdges`
and `analyzeGuard`, and checked the trace/parent/index invariants above — worth
reproducing for any non-trivial reverse-engineering job.

---

## 7. Set the right expectations

- **It's a first cut.** Structure and behaviour will be fairly accurate (they come
  from the code); needs and stakeholders are inferred and will need a human to
  confirm. Set **`inferred: true`** on the artifacts you deduced rather than read
  straight from the code — it's a dedicated confidence marker, separate from
  `status`, so a reviewer can see exactly what to check first without you having
  to misuse `status: draft` for two different things.
- **Flag gaps, don't invent.** A need with no use case, or a component with no
  flow, is useful signal for the reviewer. Leaving an honest gap (as N-008 is left
  here) beats fabricating an artifact to fill it.
- **Prefer fewer, real behaviours over exhaustive coverage.** Three good flows
  that cross the whole system teach more — and derive more structure — than a flow
  per function.
- **Keep the prose about *why*.** The code already says *what*. The value you add
  is intent: whose need, which use case, what invariant. Spend your words there —
  and put the load-bearing architectural choices in **decisions** (§5e) and the
  domain vocabulary in the **glossary**, so the *why* is structured, not buried.
