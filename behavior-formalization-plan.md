# Behavior Formalization Plan

Plan for TODO "Flows" bullet 3: *move behavior from free-text activities toward
a formal, executable model that can generate state charts.* The end goal is that
a flow like FL-001 ("Pass a vessel downstream") can be **run** — its guards
evaluated against typed state — and that a **state chart** can be derived from it.

This is a staged plan. Each stage ships independently and the parsing/evaluation
core is pure (no I/O, fully unit-testable). Direction was set by four decisions:

| Decision | Choice |
|----------|--------|
| Where state lives | **On components**, referenced as `C.var` (e.g. `chamber.vesselCount`) |
| How fast to formalize | **Stage it** — typed guards first, activity effects later |
| What defines a "state" for charts | **Derive from flow control-points** first; explicit modes later |
| Primary "executable" payoff | **In-app simulator + consistency checks** (export/verification deferred) |
| Effects vs. transitions (2026-07-14) | **Decoupled, permanently** — an `Activity` is already a named transition (component + label, shared across every flow that uses it) the moment it's placed on a flow. `effects` are an optional refinement on top, never a prerequisite for the chart. |

### Why the decoupling (2026-07-14 revision)

Writing `upstreamGate.state := open` is a bigger conceptual jump than writing
`chamber.vesselCount != 0` — guards read like the natural-language condition
they formalize, assignments require first internalizing "state lives in
component variables." The fix isn't a new schema concept: `Activity` (an id,
a label, one owning component, reused across flows — see `types.ts`) is
already exactly the "operation on a component, standing for a transition"
the naming-only step needs. Nothing new has to be added to name a transition;
you get one for free every time you place an activity on a flow. What changes
is the *plan's* framing of `effects`: they stop being a Stage-1 completion
target ("every activity has effects") and become an always-optional layer
that some activities carry and others never do. Stage 3's control-point chart
is updated to confirm this in practice — it only ever needed Stage 0 guards,
never Stage 1 effects, so the "get to a chart" path was already effect-free;
this revision just stops implying otherwise.

## Motivating example (pound-lock)

Today FL-001's branch reads, as free text:

```yaml
alternates:
  - id: "AP-1"
    condition: "the chamber is not clear of other vessels"
    after: 1
    rejoin: -1
```

Nothing types-checks it, nothing can evaluate it, and it can't drive a chart.
The target is a guard expression over declared component state:

```yaml
alternates:
  - id: "AP-1"
    condition: "the chamber is not clear of other vessels"   # kept as the human label
    guard: "chamber.vesselCount != 0"                          # NEW — the formal guard
    after: 1
    rejoin: -1
```

where `chamber` is the `Chamber` component and `vesselCount` is a variable it
declares. The prose `condition` stays as the display label; `guard` is the
machine-readable form. A guard is optional, so every existing flow keeps working.

---

## Stage 0 — Expression language + component variables (foundation) ✅ shipped

**Goal:** author and validate `chamber.vesselCount != 0` on a branch.

**Status (2026-07-14): implemented.** Component `variables` + optional
`AltPath.guard` are in the schema and round-trip through serialization; a pure
expression core lives in `src/model/expr/` (`tokenize → parse → typecheck`, with
`resolve` for reference lookup and `analyzeGuard` as the single UI entry point);
the component detail panel has a variables editor and the Behavior view branch
header has a live-validated guard field with **token-aware autocomplete**
(suggests `handle.var` references, `true`/`false`, and enum members for the
identifier under the caret; mouse + keyboard select). Verified in-app across
valid guards, unknown variables, enum-membership, type mismatches, and syntax
errors.

One deviation from the sketch below: references resolve by the component's
camelCase **handle** (`chamber`, `evseController`), not its id — a `C-001` id
contains a hyphen, which the grammar reads as the minus operator. The handle is
shown in the variables editor. `evaluate` was deferred to Stage 2 (nothing runs
guards yet), keeping Stage 0 focused on authoring + validation. A dedicated unit
-test runner is not yet wired; the core is pure and structured for it.

### Model changes (`types.ts`)
- Add a `Variable` type and put a list on `Component`:
  ```ts
  type VarType =
    | { kind: "bool" }
    | { kind: "int"; min?: number; max?: number }
    | { kind: "enum"; values: string[] };   // e.g. gate: open | closed

  interface Variable {
    id: string;        // e.g. "VAR-001", project-unique so guards can be relocated
    name: string;      // e.g. "vesselCount" — identifier, unique within its component
    type: VarType;
    initial?: string;  // initial value for simulation (Stage 2)
  }
  // Component gains: variables: Variable[]
  ```
- Add an optional `guard: string` to `AltPath` (raw source text of the expression).
  Free-text `condition` is retained as the label.

### Expression core (`model/expr/`, all pure)
- `tokenizer.ts` → `parser.ts` (Pratt/precedence-climbing) → `ast.ts` →
  `typecheck.ts` → `evaluate.ts`.
- Grammar (deliberately tiny):
  - references: `handle.var`, where `handle` is the component's camelCase title
    (`chamber`, `evseController`) — the `C.var` surface the user reads in the UI.
  - literals: integers, `true`/`false`, bare enum members (`open`), strings.
  - operators: `== != < <= > >= && || !`, `+ - * /`, parentheses.
  - top-level guard must type-check to `bool`.
- `typecheck` resolves every reference against declared component variables and
  reports precise errors ("`chamber.vesselCount` is int, compared to enum
  `open`"). This is what makes the field trustworthy.

### UI
- Component detail panel: a small variables editor (name, type, enum members,
  initial).
- Behavior view branch header (already inline after this session's work): an
  optional guard input under the prose condition, with a live validity check
  (red border + message on parse/type error) and token-aware autocomplete of
  `handle.var` references, booleans, and enum members.

### Consistency (fits the existing warning surface)
- Warn when a guard fails to parse or type-check.
- Warn when a guard references a component **not** on the flow (the state it
  reads is never touched by any activity in this flow).

**Exit criteria:** FL-001's AP-1 carries `guard: "chamber.vesselCount != 0"`,
validated live; typecheck/build green; expression core has unit tests.

---

## Stage 1 — Effects on activities (make flows executable) ✅ shipped

**Goal:** an activity *changes* state, so stepping a flow updates a valuation.

**Status (2026-07-14): implemented.** `Activity` now carries optional `pre`
(a precondition guard) and `effects` (a list of assignments); both round-trip
through serialization and are absent when empty, so existing files load
unchanged. The Stage 0 parser gained an assignment form (`head.name := expr`):
tokenizer `:=`, `parseAssignment`, `typecheckAssignment`, and `analyzeEffect`
as the single UI entry point (companion to `analyzeGuard`). Assignability is
comparability — an enum variable takes the same enum or one of its bare members.
The Behavior view step row has a **ƒ** disclosure that opens an editor for the
step's activity `pre` + `effects`, each live-validated with the same token-aware
autocomplete as guards; the ƒ button highlights when an activity already carries
behaviour, and the panel notes the activity is shared wherever it is used.
Verified in-app: seeded pre/effects render, syntax + type errors surface live
(`Cannot assign int to … (enum(…))`), edits persist with `pre` preserved, and
add/remove effect work. The pound-lock example models gate/sluice/signal state
(`state: open|closed`, signal `upper`/`lower`) plus `chamberLevel`, with effects
and preconditions on FL-001's activities — the transition function is in place
for the Stage 2 simulator to assert `!(upstreamGate.state == open &&
downstreamGate.state == open)`.

- Extend `Activity` with:
  - `effects?: string[]` — assignments, e.g. `upstreamGate := open`,
    `chamber.vesselCount := chamber.vesselCount - 1`.
  - `pre?: string` — optional precondition guard (must hold to run the step).
- Reuse the Stage 0 parser: an assignment is `lvalue := expr`; `lvalue` must be a
  declared variable, `expr` must type-match it.
- UI: activities remain labels by default; effects/pre are progressive-disclosure
  fields on the step (and/or on the activity in the component panel, since
  activities are component-owned and reused across flows).
- Model the pound-lock invariant naturally: "Open upstream gate" ⇒
  `upstreamGate := open`; "Open downstream gate" ⇒ `downstreamGate := open`, so a
  simulator can later assert `!(upstreamGate == open && downstreamGate == open)`.

One deviation, matching Stage 0: state lives under a component *handle* and a
named variable, so effects read `upstreamGate.state := open` rather than a bare
`upstreamGate := open`. `evaluate`/actually stepping a flow is Stage 2; Stage 1
stops at authoring + type-checking the transition function.

**Exit criteria (revised 2026-07-14):** *not* "every FL-001 activity has
effects" — that framed effects as a completion target, which is exactly the
friction this revision removes. The real exit criterion: an activity **can**
carry effects, they validate live when present, and the model works
correctly with zero, partial, or full effect coverage. FL-001's gate/sluice
activities carry effects because they matter for the pound-lock invariant;
other activities on other flows are free to stay label-only transitions
indefinitely. Every activity is already a transition (component + label,
shared across flows) the moment it's on a flow — effects only sharpen what a
transition *does*, they don't constitute it.

---

## Stage 2 — Simulator + consistency checks (the "executable" payoff)

**Goal:** run a flow and catch defects — the chosen primary payoff.

- `model/simulate.ts` (pure): initial valuation from component `Variable.initial`
  (optionally overlaid by the use case's preconditions once those are formalized).
  Walk `main`, applying `effects` where present — an activity with **no**
  `effects` is simply the identity transition (valuation unchanged), not an
  error or a gap to fill in; at each alternate's `after` step, evaluate its
  `guard` to decide whether the branch is taken; follow `rejoin`.
  Coverage is naturally partial: invariant checks are only as strong as the
  effects actually authored, and that's fine — a flow with a handful of
  load-bearing effects (the gates, in FL-001) and many effect-free steps still
  simulates and still catches the invariants those few effects encode.
- Checks surfaced in the existing consistency-warning UI:
  - **Unreachable branch** — guard can never be true given reachable states.
  - **Vacuous / contradictory guard** — always true / always false, or two sibling
    branches whose guards can both fire (nondeterminism) or leave a gap.
  - **Precondition violation** — a step's `pre` can be false when it's reached.
  - **Safety invariants** — project-level assertions (e.g. never both gates open)
    checked across all reachable valuations of a flow.
- Start with concrete simulation over small/bounded domains (enums, bounded ints);
  fall back to enumerating reachable valuations. Full symbolic solving is out of
  scope here (that's the deferred verification track).

**Exit criteria:** breaking a guard or an effect in FL-001 produces a specific,
located warning in the UI.

---

## Stage 3 — State chart generation

**Goal:** derive and show a state machine; the roadmap's headline deliverable.

**Status (2026-07-14): first cut shipped.** A pure `model/statechart.ts`
(`deriveStateChart`) turns a flow into a directed `Start → activities → End`
graph: the happy path is a central spine, each in-range alternate is a branch
whose entry edge carries its Stage-0 `guard` (falling back to the prose
`condition`, marked non-formal) and whose last step `rejoin`s the main flow (or
runs to `End`); rejoins to an earlier step are detected as back edges. Layout is
deterministic — rank by step order, greedy lane-packing so vertically disjoint
alternates share a column. A new **State Chart** sidebar view renders it (edges
in SVG with arrow markers, activity nodes as component-coloured cards over the
top), sharing the Behaviour view's selected-use-case pref and letting a node
click open its owning component. It reads **only guards, never effects** — the
concrete proof of the decoupling: FL-001 (and the EVSE seed) chart fully with
zero activity effects authored. Unit-tested (`statechart.test.ts`) and verified
in-app. Explicit-mode collapsing and export stay deferred as below.

- **First cut — derive from flow control-points:** each activity/step is a node;
  edges follow `main` order and alternate `after`/`rejoin`; edge labels are the
  guards from Stage 0 where present, else just the activity's label. This is
  auto-derivable from what exists *today* plus guards — **it needs zero Stage 1
  effects.** An activity with no `effects` still renders as a normal edge (the
  chart shows *that* a transition happens and *when* it's guarded, not
  necessarily *what state it changes*); effects only make a node's downstream
  guards evaluable in Stage 2's simulator, they aren't required to draw the
  chart. This is the concrete answer to "can I get an executable-looking model
  without writing assignments first": yes, via guards alone. Render in a new
  "State chart" view (reuse `model/layout.ts`).
- **Later — explicit modes:** let a component declare a distinguished `enum`
  variable as its *mode* (e.g. lock: `Idle → Filling → UpperLevel → Emptying →
  LowerLevel`); collapse the control-point graph onto mode transitions to get a
  true data statechart. Deferred until the derived-from-flow view proves the value.
- Export (Mermaid `stateDiagram-v2` / SCXML / XState) is **deferred** per the
  decision to prioritize in-app simulation; the derived model is designed to make
  export a later, mechanical addition.

---

## Sequencing & risk

- Stages 0→1→2 are strictly additive to the schema; every new field is optional,
  so existing example projects and the seed keep loading unchanged.
- The expression core is the linchpin and the highest-leverage thing to get right;
  it is pure and should land with thorough unit tests before any UI wiring.
- Biggest open modeling question for later: how preconditions on use cases relate
  to the initial simulation valuation (formalize `UC.preconditions` as guards vs.
  keep them prose and seed the initial state only from `Variable.initial`).
- Resolved (2026-07-14): whether naming a transition requires specifying its
  effect. It doesn't, permanently — see the decoupling note after the decision
  table. No schema change follows from this; it changes Stage 1's exit
  criterion and Stage 2/3's handling of effect-free activities, not `types.ts`.
