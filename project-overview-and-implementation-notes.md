# Project Overview & Implementation Notes

This document combines the project's use case model with the technical
decisions made for the first implementation slice (Needs, Use Cases,
Requirements, Traceability views). Intended to be handed to Claude Code
alongside a Claude Design handoff bundle.

---

# Part 1: Stakeholders, Needs, Use Cases & User Stories

Starting point for implementation. Covers the first two layers of the
V-model spine (Needs → Use Cases/User Stories) for the modeling tool itself.

## Stakeholders & Needs

| ID | Stakeholder | Also an Actor? | Need |
|----|------------|-----------------|------|
| N1 | Software Engineer | Yes | A structured but lightweight way to design a system — from stakeholder needs down to requirements — that stays internally consistent, without the overhead of a heavyweight MBSE tool. |
| N2 | Software Engineer | Yes | Confidence that a change to any part of the design is reflected or flagged across every related artifact, so nothing drifts silently out of sync. |
| N3 | LLM (AI coding agent) | Yes | Well-structured, unambiguous project documentation that can be directly consumed to begin or continue implementation work. |
| N4 | Software Engineer | Yes | A way to retroactively bring an existing, already-built codebase under the model — structure, behavior, and requirement drafts — without redoing design from scratch. |
| N5 | Software Engineer | Yes | Working implementation code produced efficiently from the design, with a clear boundary between the fixed generated scaffold and the hand/AI-written logic inside it. |
| N6 | Software Engineer | Yes | Confidence that the implementation actually satisfies the requirements and behavior it's supposed to, verified by tests rather than assumed. |

*Note: N1 and N2 split the single "software engineers" need from the rough
notes into two, since they're checked differently — N1 is about the design
process itself, N2 is specifically about traceability/consistency across
changes.*

---

## UC-1: Capture Stakeholders and Needs

**Primary actor:** Software Engineer · **Covers:** N1

The engineer records the system's stakeholders — marking which are also
actors — and each stakeholder's underlying need, before any design work
begins.

| Actor | Need | Reason |
|-------|------|--------|
| Software Engineer | Record a list of stakeholders and mark whether each is also an actor | So I know who my design decisions are ultimately for |
| Software Engineer | Keep each stakeholder's need as a short, plain statement | So later use cases can be checked against it without ambiguity |
| LLM | Draft a first-pass stakeholder/need list from a short project description | So the engineer starts from a draft to review and correct, rather than a blank page |

## UC-2: Define Use Cases and User Stories

**Primary actor:** Software Engineer · **Covers:** N1

For each need, the engineer defines one or more use cases, and for each use
case one or more user stories in "As a / I need / so that" form. Actor and
Use Case fields are drawn from shared dropdowns. Every use case must cover at
least one need and every need must be covered by at least one use case; a use
case diagram is generated automatically from this data.

| Actor | Need | Reason |
|-------|------|--------|
| Software Engineer | Write user stories in a fixed "As a / I need / so that" template with Actor picked from a dropdown | So I spend effort on content, not wording |
| Software Engineer | Be warned if a use case covers no stakeholder need, or a need is covered by no use case | So I catch missing or unnecessary work early |
| Software Engineer | Get a use case diagram generated automatically from actors and use cases | So I don't have to draw and maintain it separately |
| LLM | Draft candidate use cases and user stories for a given need | So the engineer reviews and edits a starting point instead of writing every one from scratch |

## UC-3: Define System Behavior Through Scenarios

**Primary actors:** Software Engineer, LLM · **Covers:** N1

The engineer bootstraps behavior from concrete scenarios rather than
authoring a state chart directly: describing a main flow, tagging each step
with a responsible component, adding anchored alternate/error flows,
expressing decisions as guarded branches, then merging fragments into one
canonical state chart per component and validating by replay.

| Actor | Need | Reason |
|-------|------|--------|
| Software Engineer | Describe a use case's main flow as a plain ordered list of steps | So I don't have to invent a state chart before I understand the behavior |
| Software Engineer | Tag each step with the responsible component, creating new components inline when needed | So structure emerges from behavior instead of requiring an upfront architecture session |
| Software Engineer | Add alternate/error flows anchored to a specific step of the main flow | So exceptions don't force me to rewrite the main scenario |
| Software Engineer | Express decision points as simple if/else branches with conditions drawn from known component attributes | So I don't have to hand-draw diamonds and wire up guards |
| LLM | Suggest merges between scenario fragments into one canonical state chart per component | So the engineer only has to confirm judgment calls rather than perform the merge from scratch |
| Software Engineer | Get sequence and activity diagrams generated by simulating the model rather than hand-drawn | So they can never drift out of sync with actual behavior |

*(The replay-validation story has moved to UC-12, alongside the other
model-consistency checks.)*

## UC-4: Define System Structure

**Primary actor:** Software Engineer · **Covers:** N1

The engineer defines structure as one dynamic, navigable containment view
rather than separate diagram files, with loose connections, optional
lightweight type tagging, and optional multiplicity as context.

| Actor | Need | Reason |
|-------|------|--------|
| Software Engineer | Navigate one dynamic structure view I can drill into in place | So I don't lose diagrams across separate files |
| Software Engineer | Tag a component with an optional "kind" label | So I can mark repeated instances (e.g. buttons) as the same kind of thing without full inheritance |
| Software Engineer | Add an optional multiplicity annotation on a component | So I can note "many of these exist" as context, without a formal cardinality rule |
| Software Engineer | Keep connections between components loose ("these communicate") | So defining structure doesn't become tedious |
| LLM | Draft candidate components and connections from a set of scenario steps | So the engineer starts from a first-pass structure to confirm rather than laying it out from nothing |

*(The structure↔behavior cross-check story has moved to UC-12, since it's a
consistency check spanning both this use case and UC-3.)*

## UC-5: Write System Requirements

**Primary actor:** Software Engineer · **Covers:** N1

The engineer writes requirements using an EARS template with dropdown-backed
fields, a MoSCoW priority, and allocation to a component and a user story —
authored at any point relative to design, viewable per-component.

| Actor | Need | Reason |
|-------|------|--------|
| Software Engineer | Write requirements in an EARS template with dropdown fields for Condition and Subject | So I capture the decision, not the wording |
| Software Engineer | Give each requirement a MoSCoW priority | So scope can be triaged at a glance |
| Software Engineer | Allocate each requirement to a component and link it to the user story it satisfies | So I can trace it in both directions |
| Software Engineer | See a component-tree view showing every requirement allocated to each component | So I can spot components with no requirements driving them |
| Software Engineer | Write a requirement before, during, or after design without the tool forcing an order | So the process matches how real design work actually happens |
| LLM | Draft candidate EARS requirements from a user story and its linked scenario steps | So the engineer edits and prioritizes a starting point instead of writing each requirement unaided |

## UC-6: Maintain Traceability Across All Artifacts

**Primary actors:** Software Engineer, LLM · **Covers:** N2

Every link between artifacts is checked continuously: edits flag downstream
neighbors for review, test status is tracked against the requirement it
covers, and a pure implementation-bug fix is distinguished from a
specification gap so it doesn't drag unnecessary review with it.

| Actor | Need | Reason |
|-------|------|--------|
| Software Engineer | Have every item linked to something I just edited flagged "needs review" | So I don't have to manually remember what a change might affect |
| Software Engineer | Have a pure implementation-bug fix leave the traceability graph untouched | So fixing a bug doesn't drag review ceremony behind it |
| Software Engineer | Track a test's status (passing/failing/stale) against the requirement it covers | So traceability reflects reality rather than a manually-asserted checkbox |
| Software Engineer | Register a test's title, its location in the codebase, and the requirement it covers | So test coverage is traceable without modeling test logic itself |

## UC-7: Consume Project Documentation to Begin or Continue Implementation

**Primary actor:** LLM · **Covers:** N3

The LLM consumes a structured, linked, plain-text representation of the
model — or a scoped bundle for one specific task — to generate implementation
code, following project-level conventions defined once.

| Actor | Need | Reason |
|-------|------|--------|
| LLM | Have each traceability node stored as a small plain-text file with typed links to its neighbors | So I can retrieve exactly the context relevant to a task instead of parsing one large document |
| LLM | Receive a scoped context bundle (a design element, its requirement chain, its interacting components, its linked tests) for a given task | So I generate code against the right amount of context — not too little, not too much |
| LLM | Have project-level conventions (naming, framework, code style, how to interpret `kind` tags) documented once | So I don't need this restated for every task |
| LLM | Write the leaf-level action code for a specific transition, with the control-flow scaffold already fixed by the interpreter | So my generated code is small, scoped, and independently verifiable against a test |

---

## UC-8: Define Project-Level Implementation Conventions

**Primary actor:** Software Engineer · **Covers:** N3

The engineer documents project-wide conventions once (naming, framework and
language choices, code style, how `kind` tags map to reusable code
components) so the LLM doesn't need them restated for every task.

| Actor | Need | Reason |
|-------|------|--------|
| Software Engineer | Write project-level conventions once, in a single document the LLM always has access to | So I don't have to repeat implementation preferences on every task |
| LLM | Read the project's conventions document before generating any implementation code | So my output matches the project's stack and style without being told each time |

## UC-9: Reverse-Engineer Existing Software into the Model

**Primary actors:** LLM, Software Engineer · **Covers:** N4

The LLM mines an existing codebase for structure (static analysis), behavior
(execution traces/logs merged the same way as hand-authored scenarios), and
requirement drafts (existing test titles/assertions), clearly marking
everything as inferred until a human reviews and promotes it. Needs are
never inferred — the engineer supplies them directly.

| Actor | Need | Reason |
|-------|------|--------|
| LLM | Derive candidate components and connections from static analysis of an existing codebase | So structure doesn't have to be redrawn by hand for a system that already exists |
| LLM | Derive candidate state charts by mining real execution traces or logs, using the same merge mechanism as hand-authored scenarios | So behavior recovery works even on messy legacy code, not just clean static analysis |
| LLM | Mine existing test titles and assertions into candidate requirement drafts | So requirements don't have to be reinvented when tests already describe expected behavior |
| LLM | Mark everything it derives with an `inferred-from-code` provenance tag distinct from authored or generated content | So nobody mistakes an inferred guess for a human-confirmed fact |
| Software Engineer | Have a derived state chart replayed against real traces/logs before it's trusted | So an LLM's plausible-looking but wrong reconstruction gets caught before being relied on |
| Software Engineer | Be asked directly for stakeholder needs rather than have the LLM guess at them | So business intent that was never in the code isn't fabricated |

## UC-10: Implement Leaf-Level Action Code

**Primary actors:** LLM, Software Engineer · **Covers:** N5

With the state-machine skeleton fixed and interpreted (not regenerated), the
LLM writes the hand-off logic inside a specific transition, scoped to a
context bundle, for the engineer to review.

| Actor | Need | Reason |
|-------|------|--------|
| LLM | Receive a scoped context bundle for one transition (the requirement it satisfies, the component's relevant state, linked tests) | So implementation work stays small, well-specified, and checkable |
| LLM | Write only the leaf action code for that transition, without touching the surrounding control-flow scaffold | So generated code can't accidentally break the model's control flow |
| Software Engineer | Review LLM-written leaf code against the linked test before accepting it | So generated logic is checked, not accepted on the strength of looking plausible |

## UC-11: Write and Register Tests

**Primary actors:** Software Engineer, LLM · **Covers:** N6

Test code is written normally (by a human or an LLM) in the codebase; the
tool only tracks a test's title, its location, the requirement it covers,
and its current status.

| Actor | Need | Reason |
|-------|------|--------|
| LLM | Draft a test's logic for a given requirement and its linked scenario | So test-writing benefits from the same scoped context as implementation |
| Software Engineer | Register a test's title, file location, and covered requirement without modeling test logic in the tool itself | So test coverage stays traceable while test code stays ordinary code |
| Software Engineer | See a requirement's linked test's current status (passing/failing/stale) | So I know coverage reflects reality, not just an asserted link |

## UC-12: Verify Model Consistency

**Primary actors:** LLM/tool (automated checks), Software Engineer (reviews
flags) · **Covers:** N2

Consistency between artifacts is checked automatically rather than trusted:
replaying scenarios against a merged behavior model, and cross-checking
structure against behavior.

| Actor | Need | Reason |
|-------|------|--------|
| LLM/tool | Replay originally-authored scenarios against a merged or reverse-engineered state chart | So a merge or derivation that broke a motivating case is caught immediately, not discovered later |
| LLM/tool | Flag a behavior transition that fires between two components with no declared structural connection | So structure and behavior can't silently drift apart from each other |
| Software Engineer | Review and resolve consistency flags raised by the tool | So automated checks inform a human decision rather than silently auto-correcting the model |

---

# Part 2: MVP Implementation Notes (First Slice)

The first implementation slice covers **UC-1, UC-2, UC-5, and UC-6** (Needs,
Use Cases + Stories, Requirements, and Traceability), scoped down to the UI
and data model only — no behavior/structure modeling, no reverse
engineering, no test-status tracking yet.

## Tech Stack

- **Shell:** Tauri (Rust) — small binaries, fast startup, and a UI layer
  that's a normal web app (so the same frontend could later be deployed to
  the browser if needed).
- **Frontend:** React + TypeScript.
- **Diagramming (future views, not this slice):** xyflow for structure,
  custom SVG for statecharts, generated Mermaid for sequence diagrams.
- **Core engine (future, not this slice):** likely prototyped in TypeScript
  first for fast iteration on LTS/guard semantics, with a possible later
  port to Rust (native + WASM) once semantics stabilize — not needed for
  Needs/Use Cases/Requirements/Traceability.
- **Storage:** Plain-text files (YAML frontmatter + markdown body),
  one file per artifact, checked into the user's own git repo. No database
  as source of truth; an in-memory or SQLite index may be added later as a
  derived, rebuildable cache for fast querying.

## Data Model (this slice)

Trace links are **forward-only**: a child artifact references its parent(s)
in its own frontmatter (`trace: [...]`). No backward references are stored;
reverse lookups (e.g. "which Requirements trace to this Use Case") are
computed at load/render time.

### Needs

```yaml
---
id: N-001
title: Reduce onboarding time for new operators
status: draft          # draft | approved | deprecated
moscow: must            # must | should | could | wont
source: "Customer interview, Acme Corp, 2026-06"
tags: [onboarding, ux]
created: 2026-07-01
---

Body text: plain prose describing the need.
```

### Use Cases (with embedded User Stories)

```yaml
---
id: UC-001
title: Operator configures a new device profile
status: draft
trace: [N-001]                # one or more parent Need IDs
moscow: must
actors: [Operator]
stories:
  - id: US-001
    as_a: Operator
    i_want: to create a device profile from a template
    so_that: I don't have to re-enter shared settings each time
  - id: US-002
    as_a: Operator
    i_want: to be warned if a profile name already exists
    so_that: I don't accidentally overwrite an existing profile
preconditions:
  - Operator is logged in
  - At least one template exists
created: 2026-07-01
---

## Main flow
1. Operator selects "New profile from template"
2. Operator picks a template
3. Operator edits the profile name
4. System validates the name is unique
5. Operator saves the profile

## Alternate flows
- At step 4, if the name already exists: system shows an inline
  error and returns to step 3.
```

Stories live inside the Use Case file rather than as separate artifacts —
they are not independently traceable in the spine (Requirements trace to
the Use Case, not to individual stories). `stories[].id` exists purely so
prose or requirements can reference a specific story.

### Requirements

```yaml
---
id: R-001
title: Unique profile name validation
status: draft
trace: [UC-001]                   # one or more parent Use Case IDs
format: EARS
ears_pattern: unwanted-behavior   # ubiquitous | event-driven | unwanted-behavior | state-driven | optional | complex
moscow: must
created: 2026-07-01
---

If the Operator enters a profile name that already exists, then the
System shall reject the save and display an inline error identifying
the conflicting profile.
```

### Shared field notes

- `id` is duplicated in frontmatter even though derivable from filename, so
  identity survives a file rename.
- `trace` is always an array, even where one parent is typical, since
  multi-parent cases exist (a Use Case serving multiple Needs, etc.).
- `moscow` is present at all three levels (Need, Use Case, Requirement) —
  not only on Requirements — so priority coherence can be checked across
  the whole spine (see below).

## MoSCoW Pre-fill Rule

When a Use Case or Requirement is created, its `moscow` field is **pre-filled
from its direct parent's current `moscow` value** at creation time, then
becomes independently editable — not a live-synced/inherited value. If a
child has multiple parents, pre-fill from the **highest** priority among
them (must > should > could > won't).

A separate **priority coherence checker** (not yet built in this slice, but
worth designing for) compares `moscow` values across trace edges at any
time — e.g. flagging a "must" Need whose linked Use Cases are all lower
priority — since values can legitimately diverge after creation.

## UI Structure (this slice)

Left sidebar with six sections: **Needs, Use Cases, Requirements, System
Structure, System Behavior, Traceability**. Only the first three plus
Traceability need working views in this slice; System Structure and System
Behavior can be placeholder/"coming soon" screens.

- **Needs view:** list (ID, title, status, MoSCoW, source, tags) + detail
  panel for full body and fields, editable inline.
- **Use Cases view:** list (ID, title, status, MoSCoW, trace chips) + detail
  view showing actors, preconditions, main flow, alternate flows, and
  nested user story cards.
- **Requirements view:** list (ID, title, status, MoSCoW, EARS pattern,
  trace chips) + detail view with the EARS statement styled distinctly as
  a quoted spec statement.
- **Traceability view:** a connected/graph view (not a list) showing
  Needs → Use Cases → Requirements, so orphaned or priority-incoherent
  items are visible at a glance.

All three list views should share consistent badge styles (status, MoSCoW)
and layout patterns.

## Handoff Note for Claude Code

A Claude Design prototype exists for the four views above and is being
handed off alongside this document. **Treat the Claude Design output as a
visual/UX reference only** — layout, spacing, component boundaries, badge
styling, interaction patterns — not as literal markup or component
structure to reuse directly. Build components fresh against the real data
model and TypeScript types described in this document (trace arrays,
MoSCoW fields, EARS pattern types), not against the prototype's placeholder
data shapes.
