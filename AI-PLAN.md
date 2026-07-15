# AI integration plan

Where and how to add LLM features to Throughline. This is a living design doc,
not a commitment to build everything here — it records the shape of the work, the
integration points in the current codebase, and the order that de-risks it.

## Guiding principles

These constrain every feature below; a feature that can't satisfy them gets
rescoped, not shipped.

1. **Validate before apply.** No LLM output touches the model until it passes the
   same validators a human's input does. The codebase already owns the important
   ones — [`analyzeGuard` / `analyzeEffect`](src/model/expr/index.ts),
   [`parseArtifact`](src/storage/serialize.ts), the derived-edge and trace
   computations in [`behavior.ts`](src/model/behavior.ts) /
   [`trace.ts`](src/model/trace.ts). A suggestion that fails validation is either
   auto-repaired (one retry, feeding the error back) or shown as a rejected draft,
   never silently written.
2. **AI proposes, human disposes.** Every write goes through a preview/accept step.
   Anything generated but not explicitly confirmed is marked
   [`inferred: true`](src/types.ts) — the confidence flag that already exists for
   exactly this purpose — so a reviewer can see what to check first.
3. **Reuse the plain-text substrate.** Artifacts are just files with a forgiving
   parser and a deterministic serializer. That means the model can emit whole
   artifacts and the app can round-trip them with a minimal diff. The
   [reverse-engineering guide](docs/REVERSE-ENGINEERING-GUIDE.md) already proves the
   by-hand version of this pipeline; the AI features automate it.
4. **Keep the client boundary narrow.** Everything builds on
   [`LlmClient.complete(prompt) → Result`](src/llm/types.ts). Streaming and
   multi-turn are deferred until a feature genuinely needs them (see
   [Interface evolution](#interface-evolution)).
5. **The model is the source of truth, not the model output.** Prototypes and
   generated code are *derived* from the Throughline model and must stay
   consistent with it; when they disagree, the model wins.
6. **Explicit, opt-in, and honest about egress.** Project text (and, for
   reverse-engineering, source code) leaves the machine for Anthropic. Features
   say so, and the heavy ones are opt-in, cancellable jobs.

## What exists today (the foundation)

- [`src/llm/`](src/llm/) — the client layer. `LlmClient` interface, a direct-fetch
  `AnthropicClient`, `createLlmClient()` factory, config (`apiKey` + `model`) kept
  in `localStorage`, deliberately outside the project folder.
- [Settings dialog](src/components/SettingsDialog.tsx) — top-bar gear; enter the
  key + model, "Test connection", unconfigured dot.
- Modelled as the **LLM Layer** component in the self-model
  ([`docs/components/C-013.md`](docs/components/C-013.md)).

**Decision — Path B (bring-your-own API key).** Reusing a Claude Pro/Max
subscription (shelling out to a subscription-authed Claude Code CLI) was
investigated and rejected: Anthropic's terms don't permit third-party apps to
route requests through Pro/Max plan credentials on a user's behalf. The compliant
path is a pay-as-you-go API key; prompts here are small enough that a minimum
credit lasts a long time. A local/free **Ollama** backend remains a possible
future addition behind the same `LlmClient` interface for users who want no
Anthropic account at all.

## Cross-cutting infrastructure (build once, before/with the first feature)

Almost every feature needs these, so they come first as a thin foundation layer:

- **Structured-output helper** — `completeJson<T>(req, validate)` in `src/llm/`.
  Wraps `complete`, extracts JSON (tolerating ```json fences and prose), validates
  with a caller-supplied guard, and retries once feeding the parse/validation
  error back. Keeps the raw client dumb; concentrates the "models are sloppy about
  JSON" handling in one tested place. (A stricter variant using the Anthropic
  tool-use / JSON-schema API can slot in later without changing callers.)
- **Project context builder** — `src/llm/context.ts`. Turns a Project (or a slice)
  into compact prompt text: the schema/id conventions, a component's variables,
  the relevant flows, coverage facts. Reuses `serializeArtifact` and the resolve
  helpers (`guardCandidates`, `variableRefs`) rather than re-describing the model.
- **Prompt builders** — `src/llm/prompts/`. One pure function per feature (project
  slice → prompt string). Pure = unit-testable and reviewable; the model call is
  mocked in tests exactly as [`anthropic.test.ts`](src/llm/anthropic.test.ts) does.
- **Shared validator** — `src/model/validate.ts`. Promote the ~60-line invariant
  script described in [guide §6](docs/REVERSE-ENGINEERING-GUIDE.md) into a real,
  tested module (dangling traces, out-of-range flow indices, unresolved
  parents/handles, orphaned components, guard type-checks). Used by
  reverse-engineering, NL authoring, *and* manual editing — not AI-specific.
- **Proposal + apply UX** — a shared pattern: `useCompletion` hook (loading /
  error / result state, cancellable) and a `ProposalCard` / inline "✨ Suggest"
  affordance (preview → accept/reject). Accept routes through existing store
  actions (`upsertArtifact`, `updateSelected`) with `inferred: true` stamped on.

## Use cases

Ordered roughly by value-per-unit-risk. Each names its plug-in points.

### A. Small suggestions while building (guards, effects, slots) — *do first*

The highest-frequency, lowest-risk feature, and the cleanest showcase of
validate-before-apply because the validators already exist.

- **Guard suggestion.** A branch (`AltPath`) has a human `condition` ("the chamber
  is not empty") and a target component. "Suggest guard" sends the component's
  declared variables (name, type, description) + the condition → model returns an
  expression → run [`analyzeGuard`](src/model/expr/index.ts) → if `ok`, offer to
  insert; if not, feed the message back for one repair attempt, then show the
  error. Plug-in: the guard editor in [`BehaviorView.tsx`](src/components/views/BehaviorView.tsx).
  - **May propose *new* variables, not just reuse existing ones.** If the condition
    can't be expressed with the declared variables, the model can also return new
    `Variable`s (component, name, type, description, initial) to create. Validation
    builds an augmented project (existing + proposed vars), type-checks the guard
    against *that* with `analyzeGuard`, and the preview shows the new variables
    alongside the guard so accepting adds the vars and sets the guard together.
- **Effect suggestion.** *(Shipped.)* Same shape for `Activity.effects`
  (`head.name := value`) validated by [`analyzeEffect`](src/model/expr/index.ts):
  a "✨ Suggest effects" button in the ƒ panel sends the activity's label + owner
  + flow → model returns a *list* of assignments (plus optional new variables) →
  each is type-checked against the augmented project → accepting appends them and
  creates the variables. An empty list is a valid answer (a pure named step).
  Shares the new-variable machinery (`llm/variables.ts`) with guard suggestion.
- **Whole-flow "Formalize".** *(Next.)* One call over an entire flow filling every
  branch guard and activity effect at once, so the model designs a single coherent
  state vocabulary (a shared mode enum, gates, counters) instead of each per-item
  call inventing its own variables. Reuses the shared variable + context layer and
  the same `completeJson` self-correction; every guard/effect still type-checked
  before it's shown. Reviewed before apply, filling only empties by default;
  "Formalize all use cases" then loops flows sequentially, threading accepted
  variables forward so later flows reuse earlier ones.
- **Slot-filling micro-suggestions**, each returning JSON validated before apply:
  EARS requirement slots from a plain sentence (compose via `model/ears.ts`);
  decision Y-statement slots from a paragraph; a glossary definition from a term;
  user stories from a use-case title.
- **Context builder:** `componentContext(component)`. **UI:** inline "✨" next to
  the field. **Effort:** small; build guard as the template, replicate.

### B. Reverse-engineering a new project — *headline feature, sequenced late*

The "headline hard case" per [`docs/README.md`](docs/README.md). The manual
pipeline is already specified in the guide; this automates it. **Deliberately
sequenced after the prototype feature (C):** codebase ingestion and multi-artifact
generation are the hardest, most error-prone part of the whole plan, so it's worth
proving the validate→apply and generation machinery on smaller features first.

1. **Ingest.** New Rust command `read_source_tree` in
   [`storage.rs`](src-tauri/src/storage.rs): walk a chosen folder, honour
   `.gitignore`, cap file count/size, return paths + contents. (Description-only
   mode — paste a paragraph, no file reading — is the v1 on-ramp.)
2. **Generate.** System prompt = the guide + id conventions + schema; ask for the
   artifact set. Emit structured artifacts (JSON per artifact, or the
   YAML-frontmatter files directly). Author top-down so ids/traces resolve.
3. **Validate & repair.** Each proposed artifact through `parseArtifact` +
   `src/model/validate.ts` (§6 invariants) + `structureEdges` / `analyzeGuard`
   sanity. Drop or repair invalid ones.
4. **Write.** `createProject`, then write files via the storage adapter, all
   `inferred: true`, gaps left honest (don't fabricate to fill).
5. **Review.** Land in the app on the inferred project.

- **New code:** `src/llm/reverse/` (orchestration + prompts), the Rust command,
  `src/model/validate.ts`. **Big feature — phase it:** description → starter
  project first; codebase ingestion second; large-repo chunking/summarisation
  third. Runs as a cancellable background job with progress.

### C. Demo-able prototype to confirm behaviour with stakeholders

Close the loop between the model and the people it's for. The model is *already*
an executable spec — guards + effects form a transition function over valuations
(see [`types.ts`](src/types.ts) and the Run-mode simulator: `evaluate`,
`applyAssignment`). The AI's job is to skin that into something a stakeholder can
experience and react to.

- **Must look customer-friendly, in the language of the domain — not an engineer's
  state chart.** The visuals should match the stakeholder's mental model of the
  real system. For the pound-lock example that means an actual **lock scene**: a
  boat that moves between the reaches, **buttons that trigger the flow's
  activities** (open upstream gate, fill chamber, …), and **state variables shown
  visually** rather than as text — a gate that swings open/closed, a water level
  that rises and falls, a signal that changes colour. The underlying transitions
  come from the model; the skin is what the customer recognises.
- **Input:** a use case + its flow + the involved components/variables (with their
  descriptions and value ranges) + a target ("clickable web UI", "CLI transcript",
  "storyboard"). A domain hint (e.g. "canal lock", "EV charger") helps the model
  pick apt visuals.
- **Output:** a single self-contained HTML prototype whose controls map to the
  flow's activities and whose on-screen state reflects the variable valuations.
  **New code:** `src/llm/prototype/`.
- **Consistency:** the prototype must not invent states/variables outside the
  model; the buttons must correspond to real activities and the shown state to real
  variables; ideally its transitions are checked against the simulator's. Keep it
  clearly labelled as an aid, model stays canonical.
- **Effort:** medium; scope v1 to "one use case → one clickable, domain-skinned
  HTML prototype", starting with the pound-lock example as the reference target.

### D. Bigger build-out of the real software — *mostly delegated, by design*

The inverse of B: use the model as a structured spec to drive real code —
components→modules, activities→functions, variables→state, flows/guards/effects→
logic, requirements→acceptance criteria, tests→stubs at their `file` paths.

This is an agentic, multi-file, iterative job that **should not be reimplemented
inside Throughline** (and the Path-A terms lesson applies to embedding a coding
agent too). The division of labour:

- **In-app:** *emit an excellent build brief* — a structured prompt pack from the
  model (component responsibilities, flows as behaviour specs, requirements as
  acceptance criteria, tests to satisfy) that an external coding agent (Claude
  Code, the Agent SDK, an IDE) consumes. Optionally a deterministic **scaffolding**
  generator (folders per component, stub files, test stubs referencing
  `test.file`). **New code:** `src/llm/build/`, an "Export build brief" action.
- **External:** the heavy code generation. This also advances the existing
  [`TODO.md`](TODO.md) "LLM Accessibility" items (drop LLM instructions into
  project folders).

## Additional use cases worth adding

- **E. Model critic / gap review — strong candidate to do early.** A read-only AI
  pass over the whole project flagging what a mechanical check can't: vague
  requirements, needs with no use case, requirements with no test, contradictory
  guards, load-bearing choices with no decision, undefined glossary terms,
  components orphaned from traceability. Complements `validate.ts` (mechanical)
  with judgement. Output = a dismissible findings list with jump-links; reuses the
  coverage computations in [`trace.ts`](src/model/trace.ts). Low risk, high value.
- **F. Natural-language authoring.** One box: "Add a requirement that the lock must
  equalise within 90 s, tied to the filling use case." → drafts the right artifact
  kind with slots + trace → validate → preview → accept. A faster on-ramp than the
  forms; generalises B's per-artifact generation to interactive single creates.
- **G. Ask-the-model (semantic Q&A).** "Which requirements depend on the CPMS being
  online?" → answer with artifact links, over the project context. Read-only.
- **H. Glossary & naming assistant.** Detect undefined domain terms used in bodies
  and propose entries; suggest consistent component titles — important because
  renaming a component silently breaks its guards
  ([guide §5c](docs/REVERSE-ENGINEERING-GUIDE.md)).
- **I. Trace suggestion.** For a new child artifact, propose the parent(s) to trace
  to (respecting the fixed need→use-case→requirement→test levels), and flag when
  nothing fits — a hint that an intermediate artifact is missing.
- **J. Requirement → test scaffolding.** Draft a `test` artifact (title, what it
  checks, stub `file`) from a requirement + its implementing component/flow.
  Bridges toward D.

## Suggested sequencing

1. **Foundation:** `completeJson`, context builder, prompt module, `validate.ts`,
   the proposal/apply UX. *(Enables everything; ship with feature A.)*
2. **A — guard/effect suggestion**, including proposing new variables. The vertical
   slice that proves the pattern.
3. **E — model critic.** Read-only, high value, low risk.
4. **F — NL authoring** and **B-lite** (starter project from a description) — single
   artifact, then whole project, both on the validate+apply layer.
5. **C — prototype generation** (customer-friendly, domain-skinned; pound-lock as
   the reference target).
6. **B — full reverse-engineering** from a codebase (Rust ingestion + orchestration)
   — the hardest piece, deliberately after C.
7. **D — build brief / forward hand-off**, plus the smaller helpers (G–J) as they
   pull their weight.

## Risks & open questions

- **Structured-output reliability** without native JSON mode: mitigated by
  `completeJson` (defensive parse + validate + one repair). Escalate to the
  tool-use/JSON-schema API if the repair rate is too high.
- **Large context** (reverse-engineering a big repo) exceeds the window: needs
  chunking/summarisation and multiple passes — out of scope for v1
  (description-based first).
- **Cost/latency** on the big features: explicit, cancellable background jobs; fast
  model + tight `max_tokens` for the small suggestions.
- <a id="interface-evolution"></a>**Interface evolution.** B and D likely want
  streaming and/or multi-turn. Plan: add an optional `stream?()` to `LlmClient`
  when first needed, keeping `complete` as the simple path — don't widen the
  interface speculatively.
- **Determinism for tests:** prompt builders are pure and unit-tested; model calls
  are mocked. Keep suggestion calls at `temperature: 0`.
- **Privacy/egress:** be explicit that project text and source leave the machine;
  keep heavy features opt-in. A future local (Ollama) backend sidesteps egress
  entirely for the privacy-sensitive.
