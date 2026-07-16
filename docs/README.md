# Throughline, modelled in Throughline

This folder is a Throughline project whose subject is **Throughline itself**. It
was produced by reading the tool's own source and reverse-engineering it into
Throughline's artifact kinds, so the tool is somewhat self-contained: the thing
and its model live in the same repository.

It exists for two reasons:

1. **A worked example of reverse-engineering.** The headline hard case for
   Throughline is taking an existing codebase and recovering a first-cut model
   from it. This folder is that exercise carried out on a codebase we understand
   completely, so it doubles as a reference for what "good output" looks like.
2. **A test of the data model.** Modelling a real system surfaces where the
   schema fights you. The friction hit while building this is written up in two
   places: the tool-facing gaps in [`../TODO.md`](../TODO.md) ("Data-model
   friction (found while self-modelling)"), and the author-facing workarounds in
   [`REVERSE-ENGINEERING-GUIDE.md`](REVERSE-ENGINEERING-GUIDE.md).

## Layout

Standard Throughline layout — one folder per artifact kind, one file per
artifact, filename is the id:

```
docs/
  stakeholders/  SH-001 … SH-004   who the tool is for
  needs/         N-001  … N-009    what they need
  use-cases/     UC-001 … UC-010   how the tool satisfies those needs
  requirements/  R-001  … R-014    EARS "shall" statements
  components/    C-001  … C-012    the actual code, as a component hierarchy
  flows/         FL-001 … FL-010   one behaviour per use case, as ordered activities
  decisions/     D-001  … D-004    the architectural choices, as Y-statements
  glossary/      G-001  … G-006    the tool's domain vocabulary
  tests/         T-001  … T-009    the automated suite verifying the requirements
```

The app only reads those per-kind subfolders, so this README and the guide
sitting alongside them (plain `.md` files at the `docs/` root, not inside a kind
folder) are ignored by the loader — safe to keep here.

## How the model maps to the code

- **C-001 Throughline Desktop App** is the root; every other component is nested
  under it via a stored `parent`.
- The component tree mirrors the source tree: `Storage Layer` ≈ `src-tauri` +
  `src/storage`, `Model Core` ≈ `src/model` (with `Expression Engine` ≈
  `src/model/expr`, `Structure Deriver` ≈ `behavior.ts`/`layout.ts`/
  `hierarchy.ts`, and `Behaviour Engine` ≈ `interpret.ts`/`activityDiagram.ts`/
  `sequenceDiagram.ts`/`actors.ts`), `View Layer` ≈ `src/components` (whose views
  include the `Traceability View`).
- The **connections** drawn between components in the Structure view are **not**
  stored here. They are derived from the flows: ten flows — one per use case —
  chain activities across components, and every back-to-back pair becomes a
  connection.
- One flow reuses another as a **subflow**: `Formalise an alternate-path guard`
  (FL-003) ends by *calling* `Edit and save an artifact` (FL-002) rather than
  restating its steps — a step that holds a flow id (`FL-002`) instead of an
  activity id. The connection derivation reaches *through* the call, so the last
  component of the caller connects to the first of the callee (`Application
  Store` → `Detail Panel`); the callee's own internals stay derived from its own
  flow. This is how larger behaviours compose without duplicating steps.
- Alternate-path guards type-check against real component variables
  (`applicationStore.dirty == false`, `expressionEngine.valid == false`), so the
  behaviour-formalisation feature is exercised on the tool itself. Those flows
  are also **executable**: the Behaviour Engine derives an activity diagram from
  each flow and steps a token through it (applying effects, evaluating guards),
  and derives a sequence diagram whose actor lifelines (`Systems Engineer`,
  `LLM Agent`, `Design Reviewer`) resolve to the stakeholders of the same name.
- The four **design decisions** (`decisions/`) record the choices that most
  surprise a reader — structure-from-behaviour, plain-text storage, forward-only
  traces, title-handle guard references. Each traces to the use case it serves,
  and the component it shaped links back to it (e.g. `Structure Deriver` → D-001).
  These are the same "rules that will surprise you" the guide calls out; now they
  have a home in the model instead of only in prose.
- The **glossary** (`glossary/`) defines the tool's own vocabulary — artifact,
  structure connection, flow, EARS, trace, handle — with cross-links to the
  decisions that explain them.
- The **tests** (`tests/`) are the verification layer: each `T-…` is a *real*
  Vitest file in the repo (`file:` points at it) that traces to the requirement it
  checks and carries its latest `result`. They exercise the tool's own pure core —
  trace lookups (T-001 → R-002), flow-derived structure (T-002 → R-004), id
  allocation (T-003 → R-011), file tolerance (T-004 → R-008), guard
  type-checking (T-005 → R-006), and the Behaviour Engine — activity-diagram
  derivation (T-006), flow interpretation (T-007) and guard evaluation
  (T-008 → R-013), plus sequence-diagram derivation (T-009 → R-014). Run them
  with `npm run test`.

## One honest gap

N-008 ("a small, comprehensible codebase to maintain", held by the Tool
Maintainer) has no use case tracing to it — a maintainer's need isn't served by a
user-facing use case. It's left in deliberately: spotting exactly this kind of
gap is what UC-009 (review traceability) is for.
