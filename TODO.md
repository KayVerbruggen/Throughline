# Throughline TODOs

## Flows
- [x] Dropdown for Activities in Flow doesn't work
- [x] Show alternative flows more inline
- [ ] Think about the formality of behavior — the ultimate goal is an executable model and generating state charts, and we're far from that today
  - e.g. add variables to components to express conditions such as `chamber.noVessels != 0` as the alternate path of UC-001

## Components
- [ ] Think about how to reduce duplication
  - e.g. signal lower reach, upper reach, both, permitted reach — the "both" or "permitted" options shouldn't need to exist since they're just the previous ones combined depending on conditions
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
- [ ] When a project is created, add instructions for LLMs (plus generic advice) into all the subfolders explaining how things work
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
  - Next: the model critic (E) and NL authoring (F); then prototype drafting and reverse-engineering (B/C).

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
