# Throughline

A structured but lightweight tool for tracing a system design from stakeholder
**Needs → Use Cases → Requirements → Components → Behaviour**, keeping every
link continuously checked so nothing drifts silently out of sync.

## Stack

- **Shell:** [Tauri 2](https://tauri.app) (Rust) — small binary, fast startup.
- **Frontend:** React 18 + TypeScript + Vite.
- **State:** Zustand.
- **Storage:** plain-text files (YAML frontmatter + markdown body), one file per
  artifact, meant to be checked into your own git repo. There is no database of
  record; the model in memory is rebuilt from the files.

## Data model

Nine artifact kinds, each its own folder of `.md` files:

```
<project>/
  stakeholders/   SH-001, …   who the system is for
  needs/          N-001,  …   what they need
  use-cases/      UC-001, …   how the system satisfies those needs (with embedded user stories)
  requirements/   R-001,  …   EARS "shall" statements
  components/     C-001,  …   the system's structure, as a component hierarchy with typed variables
  flows/          FL-001, …   one behaviour per use case, as ordered activities (main path + alternates)
  decisions/      D-001,  …   design rationale, as fixed Y-statements
  glossary/       G-001,  …   the project's domain vocabulary
  tests/          T-001,  …   automated tests, traced to the requirements they verify
```

Trace links are **forward-only**: a child references its parent(s) in its own
frontmatter (`trace: [...]`). Reverse lookups ("which requirements trace to this
use case") are computed at render time, never stored.

Rust does no YAML parsing — it only moves raw file text in and out; the
TypeScript layer (`src/storage/serialize.ts`) owns the schema.

## Views

- **Stakeholders, Needs, Use Cases, Requirements** — the core spine, list + detail.
- **Structure** — the component hierarchy. Connections between components are
  *derived*, not authored: every back-to-back pair of activities across a
  flow becomes a structure connection.
- **Behaviour** — each flow's activity diagram (main path + alternates), with
  an Activity/Sequence toggle. The activity diagram is executable: step a
  token through it, evaluating guards and applying effects. The sequence
  diagram is derived from the same flow, with actor lifelines resolved to the
  stakeholder or component that initiates each activity.
- **Decisions** — design rationale, one fixed Y-statement per decision
  ("In the `<context>`, facing `<concern>`, we decided `<decision>` and not
  `<alternatives>` to achieve `<criterion>`, accepting `<downside>`"), traced
  to the use cases they address and linked back from the components they shaped.
- **Glossary** — the project's domain terms, one file per term.
- **Tests** — the verification layer, each test traced to the requirement it checks.
- **Traceability** — a connected graph across the whole spine, with
  consistency checks (below).

## Running

```bash
npm install

# Web-only UI (seeded EVSE sample project, browser localStorage):
npm run dev            # http://localhost:1420

# Full desktop app (real file storage via the folder picker):
npm run tauri dev
```

When run under Tauri, the app asks you to choose a project folder and stores
artifacts there as `.md` files. When run as a plain web app (`npm run dev`), it
falls back to a seeded sample project kept in `localStorage`, so the UI is fully
demonstrable without the desktop shell.

## Worked examples

- [`examples/pound-lock`](examples/pound-lock) — a small canal-lock control
  system, hand-authored to exercise every artifact kind and the guard/effect
  expression language end to end.
- [`docs/`](docs/README.md) — Throughline modelling **itself**: the tool's own
  requirements, components, and behaviour, produced by reverse-engineering its
  own source. Doubles as a worked example of the reverse-engineering workflow
  and a stress test of the data model (see [`TODO.md`](TODO.md)'s "Data-model
  friction" section for what that surfaced).

## Project layout

| Path | What |
|------|------|
| `src/types.ts` | The data model — all nine artifact kinds. |
| `src/model/` | Pure logic: id allocation, MoSCoW pre-fill, traceability, structure/flow derivation, the guard/effect expression engine (`expr/`), the flow interpreter, activity- and sequence-diagram derivation. |
| `src/storage/` | `StorageAdapter` interface + Tauri (file) and browser (seed) backends, and file (de)serialization. |
| `src/state/store.ts` | Zustand store wiring storage to the UI. |
| `src/components/` | Sidebar, top bar, one view per artifact kind under `views/`, detail drawer. |
| `src-tauri/` | Rust shell and file-storage commands. |

## Consistency checks

- A **requirement** that traces to no use case is flagged **orphan**.
- A **use case** that covers no need is flagged.
- A **must**-priority **need** whose linked use cases are all lower priority is
  flagged as a priority mismatch.
- A **flow**'s activity ids that don't resolve to a component activity, and a
  guard/effect that doesn't type-check against real component variables, are
  flagged where they're edited.

## Regenerating the app icon

The icon set (including `src-tauri/icons/icon.ico`) is generated from a single
source PNG:

```bash
npm run tauri icon path/to/app-icon.png
```
