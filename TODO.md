# Throughline TODOs

## Flows
- [x] Dropdown for Activities in Flow doesn't work
- [x] Show alternative flows more inline
- [ ] Think about the formality of behavior — the ultimate goal is an executable model and generating state charts, and we're far from that today
  - e.g. add variables to components to express conditions such as `chamber.noVessels != 0` as the alternate path of UC-001
- [x] **Subflows — a flow that calls into another flow** (modelling bigger systems)
  - A step may hold a flow id (`FL-xxx`) instead of an activity id, meaning
    "invoke that use case's behaviour here". Prefix-disambiguated, so no schema
    change; storage round-trips it. Authored via a "Call a use case" option in
    the step's picker; renders as a dashed "Calls → …" chip (Build) / node
    (Diagram), navigable to the callee; a banner warns on invocation cycles.
  - Structure connections derive *through* the call (caller's last component →
    callee's entry component), so composing flows composes the system graph.
    See `model/subflow.ts`; examples in `docs/` (FL-003→FL-002) and pound-lock
    (FL-001→FL-006).
  - [x] **A call is executable in Run mode.** The interpreter keeps a *call
    stack*: reaching an invoke step parks the token on the call node, the next
    advance pushes a frame and drops it at the callee's Start, the callee runs as
    an ordinary flow, and its End pops back to the call node so the caller
    continues past it. Guards and effects act on the **same valuation** in both
    directions — a callee's guard reads state the caller wrote, and its effects
    are visible to the caller's later branches.
    - No variable scoping was needed after all: variables belong to *components*
      (`C-id.name`), not flows, so a call has nothing of its own to scope. That
      shared state is the point — composing flows composes one system state.
    - Recursion is bounded by a call-depth cap (a call nested too deep degrades
      to the old pass-through and notes why), alongside the existing step cap.
    - Run mode highlights the caller's call node while the token is inside the
      callee, and an "Inside subflow" breadcrumb names the flows it is in.
    - Exercised in `examples/pound-lock/`: FL-001 calls FL-006, whose guard
      (`interlockController.chamberLevel == upper`) tests state FL-001 set.

## Components
- [~] Think about how to reduce duplication
  - e.g. signal lower reach, upper reach, both, permitted reach — the "both" or "permitted" options shouldn't need to exist since they're just the previous ones combined depending on conditions
  - Diagnosis: this was **two** problems wearing one coat.
    - **Combination** ("show red on both" = "red upper" + "red lower"). A step
      holds one activity, so a compound action needs its own activity restating
      the parts — combinatorial.
    - **Parameterisation** ("green to the *permitted* reach" = green-upper or
      green-lower depending on state). Effects are unconditional assignments to a
      fixed target, so a state-dependent action had nowhere to go.
  - [x] **Most of it was a modelling mistake, not a tool gap.** Signal Lights
    (C-007) declared one variable per physical sign (`upper: red|green`,
    `lower: red|green`) — four representable states for a domain that permits
    three, where the fourth is the exact safety violation the lights exist to
    prevent. That fake independence is what forced the activity explosion. One
    variable over the states that can occur (`permits: neither|upper|lower`)
    collapses seven activities to four; "show red at the upper reach" stops
    existing because red-at-a-reach is a *consequence*, not an action, and the
    two byte-identical "show red" activities become the same single assignment.
    Written up as pound-lock **D-007**, and as a rule in the scaffolded
    `components/README.md` so every new project's generation contract carries it.
  - [ ] **What's left is genuinely a tool gap: compound actions.** The collapse
    only works when the variables are mutually exclusive. `Halt all actuators`
    (ACT-006) sets `upstreamGate.state := closed` *and*
    `downstreamGate.state := closed` — two components, genuinely independent, and
    naming that compound action still means restating its parts.
    - Favoured fix: **activity composition** — an activity lists other activities
      (`does: [ACT-011, ACT-014]`) instead of its own effects, which derive by
      flattening. Same composition-over-restatement move as subflows, small
      interpreter change (flatten on apply), needs a cycle guard. Interesting
      wrinkle: the parts live on the gates but the *action* is the controller's,
      which is exactly the "controller commands gates" edge structure derivation
      would want.
    - Rejected: **multi-activity steps** (a step slot holding a list) — collides
      with the step being the unit of component adjacency, and drags in fork/join
      concurrency.
    - Rejected: **conditional effects** (`when <guard>: x := y`) — hides a branch
      inside a node, so the activity diagram stops showing the behaviour. Branches
      belong in flow alternates where they are drawn.
    - Deferred until a second real case appears; ACT-006 is currently the only one.
  - Note on parameterisation: once state is one variable, a state-dependent action
    wants to be one assignment from another variable
    (`signalLights.permits := interlockController.chamberLevel`) — and effects
    **already** allow that (an effect's RHS is a full expression; an enum takes the
    same enum). It doesn't apply in the pound-lock because `chamberLevel`'s `mid`
    isn't the same fact as `neither`, so FL-006 keeps a guarded branch. The type
    mismatch asking that question is the system working.
- [x] Don't like the current system structure graph layout — the columns imply a left-to-right order that doesn't actually exist
  - Also show hierarchy with the main system at the top and other components underneath
  - Implies needing two types of arcs to make the distinction
  - Consider rendering as a tree, and also as blocks nested inside each other (helps for UI development)
  - For things like UI development, it should be possible to create components directly inside the structure view, since that feels more natural
  - Done: components now carry a stored `parent` (hierarchy). Structure view has a Tree/Nested layout switch and a Hierarchy/Connections/Both toggle; hierarchy draws as solid arrowed links (tree) or nested blocks, connections as dashed arcs. Add sub-components in place via the "+" on any block.

## Side Bar
- [x] Improve side bar usability — e.g. in the component sidebar, clicking a tagged Use Case has no back button in the side panel, so I have to fully close it
- [x] There is no UI for adding traces — it just says "traces to" but I can't add new traces there

## LLM Accessibility
- [x] When a project is created, add instructions for LLMs (plus generic advice) into all the subfolders explaining how things work
  - Done: creating a project now scaffolds format docs — a root `README.md`
    (orientation + folder map + the "structure is derived, never stored" rule),
    a root `AGENTS.md` (a compact generation contract for LLMs), and a
    per-kind `README.md` in each folder documenting that kind's frontmatter
    fields, body, and a copy-paste template. Single source of truth is
    `src/storage/projectDocs.ts`; written by the Rust `scaffold_docs` command
    (write-if-absent, never clobbers) from `tauriStorage.createProject`. The
    loader skips `README.md`/`AGENTS.md` (`is_doc_file` in `storage.rs`) so they
    aren't parsed as artifacts. Reflected into `docs/` and `examples/pound-lock/`
    via `scripts/emit-project-docs.ts`.
- [ ] Add instructions for LLMs reverse engineering existing codebases
  - Perhaps use SugarVita as a large example of what happens (would cost a bunch of tokens)
  - Started: `docs/` is now a Throughline project modelling Throughline itself (a self-contained reverse-engineering example), with a companion `docs/REVERSE-ENGINEERING-GUIDE.md` for future LLMs. The friction hit while writing it is captured below.
- [ ] Come up with test cases for code generation and any LLM instructions that should be given — either by default or in a new view for the user
- [ ] In-app LLM features (suggest guards/effects, draft a prototype, reverse-engineer a codebase)
  - Started: `src/llm/` now holds the client foundation — a narrow provider-agnostic `LlmClient` (`complete(prompt)` → Result), a direct-fetch Anthropic implementation, and a `createLlmClient()` factory mirroring the storage split. API key + model live in `localStorage` (app-scoped, deliberately kept out of the project folder / git repo).
  - Settings surface done: a top-bar gear opens a dialog for the key + model, with a "Test connection" button and a dot on the gear while unconfigured.
  - Foundation `completeJson` done: JSON extraction + caller-validated + one self-correcting retry (semantic checks live in the validator, so they drive the retry too).
  - Guard suggestion done: a "✨ Suggest from condition" button on each alternate branch turns its plain-language condition into a formal guard, validated by `analyzeGuard` before it's offered; it may propose new component variables (bool/int/enum), and accepting creates them and sets the guard together. See [AI-PLAN.md](AI-PLAN.md) for the fuller roadmap and sequencing.
  - Effect suggestion done: a "✨ Suggest effects" button in the ƒ panel turns an activity's label into a list of assignments, each validated by `analyzeEffect`; an empty list is valid (a pure named step). Shares the variable-proposal layer (`llm/variables.ts`) with guards. Same validate-before-apply, may propose new variables (typically a mode enum).
  - Whole-flow **Formalize** done: a "✨ Formalize flow" button in the Behaviour view sends an entire flow to the model in one call and fills every unformalized branch guard *and* activity effect from a single coherent shared state vocabulary (avoids the per-item calls each inventing their own variables). Every guard/effect is type-checked before it's shown, a review panel presents the plan (new variables + guards + effects), and Accept applies it atomically (`applyFormalization`); already-formal items are left alone and orphan proposed variables pruned.
  - Whole-project **Formalize all** done: a "✨ Formalize all use cases" button (Behaviour view, build mode, shown when 2+ flows have gaps) runs one sequential pass over every use case's flow, threading an evolving project so later flows reuse the state earlier ones introduced. Best-effort per flow, skips already-formal flows, batch review shows each flow's proposal/error, and one Accept-all persists the accumulated changes (all-or-nothing — threaded plans interdepend).
  - Model critic (E) done: a "✨ Review model" button in the Traceability view runs a read-only whole-project AI pass (`critiqueProject` over `describeProject`) and lists judgement-level findings a mechanical check can't — vague/untestable requirements, conflicts, load-bearing choices with no decision, undefined terms — each with a severity chip and jump-links to the artifacts it cites. Dismissible per finding or all at once; complements the mechanical `trace.ts` warnings.
  - NL authoring (F) done: a global "✨ Draft" box in the top bar turns a sentence into one structured artifact — the model picks the kind and fills its slots, references are resolved by id/title (unmatched ones surfaced, not invented), the draft is previewed (EARS sentence / Y-statement / title), and Create builds it via `createFromDraft` and navigates to it. Covers the spine + decision + glossary + stakeholder.
  - Next: prototype drafting (C) and reverse-engineering (B); smaller helpers (G–J) as they pull their weight.

## Examples
- [ ] Think of more varied examples as proof of concepts
  - Perhaps something like web development, but unclear if it makes sense — how do you compete with something like Claude Design? Think more about how to approach this

## Data-model friction (found while self-modelling in `docs/`)
Things that fought the current data model when modelling Throughline in itself.
Each is a candidate change to the tool, roughly ordered by how much it hurt.

- [ ] **No way to express a static dependency between components.** Connections
  are only ever derived from flow adjacency, so "module A imports/uses module B"
  is inexpressible unless A's and B's activities happen to sit next to each other
  in some flow. For a *codebase* — which has a real static dependency graph
  independent of any runtime behaviour — this is the biggest gap. Reverse-
  engineering wants to record import/call edges directly, then let flows *add*
  behavioural edges on top. Consider an optional authored "uses" edge (kept
  visually distinct from derived ones), or deriving edges from a second source.
- [ ] **Components have exactly one `parent`.** A shared module that belongs to
  two subsystems (e.g. a serializer used by both storage and model) has to be
  filed under one and mentioned in prose for the other. Strict-tree composition
  can't represent shared ownership or "lives in X, used by Y".
- [ ] **No typed trace from a requirement/need to a component.** Traces are
  forward-only and level-locked (need → use case → requirement). A component's
  only link to the spine is inferred through the flows it appears in, so a
  component in no flow is invisible to traceability. Wanting "R-004 is about the
  Structure Deriver (C-006)" had nowhere to go. Consider allowing requirements to
  reference components (an allocation/satisfy link), which is standard in MBSE.
- [~] **EARS is awkward for internal/architectural invariants.** "Reverse lookups
  are computed, never stored" or "connections are derived, never stored" are
  design properties, not "the <subject> shall <observable behaviour>". They get
  forced into `ubiquitous` + a `constraint` slot and read stiffly. Maybe a
  lighter "invariant/constraint" requirement format alongside EARS.
  - Partly done: architectural *properties* now have a home as **Design
    Decisions** (see below), so they no longer have to masquerade as EARS
    requirements. A dedicated invariant/constraint *requirement* format is still
    open for the cases that really are testable system properties.
- [x] **Guard references break silently on component rename.** A guard uses the
  camelCase handle of the component *title* (`applicationStore.dirty`), so
  renaming the component changes the handle and orphans every guard that used it,
  with no rename-refactor and no error until re-validation. Consider referencing
  by stable id under the hood (with the handle as display), or a rename that
  rewrites dependent guards.
  - Done: renaming a component now rewrites every reference that used its old
    title-handle — alternate-path guards, activity preconditions and effects —
    across the whole project, and re-saves just the touched files
    (`renameComponentHandle` in `model/expr/resolve.ts`, wired into
    `updateSelected`). This keeps the readable handle syntax (decision D-004) and
    removes its accepted downside. Referencing by stable id is no longer needed.
- [x] ~~**Technical/internal use cases don't fit the user-story template.**~~
  *Withdrawn — this was a modelling mistake on my part, not a tool gap.* The
  claim was that "Load a project from disk" has no natural human "As a …". But
  there is always a human who benefits — for the tool's own operational
  behaviours it's the **Systems Engineer** using it (and it could just as well be
  the **developer/maintainer**). The self-model already proves this: UC-006 /
  UC-007 / UC-008 each carry a real "As a Systems Engineer …" story. The fix is
  modelling discipline (name the beneficiary), not story-less use cases, so no
  data-model change is warranted.
- [x] **Nowhere to put design rationale / decisions.** The core rules ("structure
  is derived from behaviour", the seed-key/versioning story) are architectural
  decisions with no home in the model — they ended up crammed into component
  descriptions. An ADR-like or "decision/constraint" artifact kind would help,
  especially for reverse-engineering where recovering *why* is the whole point.
  - Done: added a **Design Decisions** artifact kind (`D-…`, `decisions/`
    folder, "Design Decisions" view). Each is authored in a fixed Y-statement
    template — *In the &lt;context&gt;, facing &lt;concern&gt;, we decided
    &lt;decision&gt; and not &lt;alternatives&gt; to achieve &lt;criterion&gt;,
    accepting &lt;downside&gt;* — composed from slots like EARS, never hand-typed.
    Decisions trace to the use cases they address; components carry a
    `decisions` list ("Shaped by decisions"), and a decision shows the
    components that cite it ("Shapes"). Recovering *why* now has a home.
- [x] **No project-level description or glossary artifact.** There's a `vocab.ts`
  glossary in code but no artifact kind for domain terms or a project overview,
  so an LLM opening a project has no in-model orientation. (Worked around here
  with `docs/README.md`, which the loader ignores.)
  - Done (glossary): added a **Glossary** artifact kind (`G-…`, `glossary/`
    folder, "Glossary" view) — a term, optional aliases, and a markdown
    definition, so domain vocabulary lives in the model. A project-level
    description/overview artifact is still open.
- [x] **No marker for "this artifact was inferred / low-confidence".** Reverse-
  engineering produces confident structure but speculative needs/stakeholders.
  `status: draft` is the only lever and it's overloaded. A distinct "inferred"
  or confidence flag would let a reviewer see what to check first.
  - Done: every artifact kind now carries an optional `inferred` flag, separate
    from `status` (so something can be `approved` yet still flagged for review).
    Toggle it from the detail panel ("Mark as inferred"); it shows as an
    `inferred` badge in the header and in list views. Only written to the file
    when true. (Example left on N-004 in the sample project — the wider docs
    self-model is intentionally *not* blanket-tagged.)
