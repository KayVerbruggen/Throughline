# Throughline

A structured but lightweight tool for tracing a system design from stakeholder
**Needs → Use Cases → Requirements**, keeping every link continuously checked so
nothing drifts silently out of sync.

This repository is the **first implementation slice**: the four views that cover
`UC-1`, `UC-2`, `UC-5`, and `UC-6` from the project notes — Needs, Use Cases
(with embedded user stories), Requirements (EARS), and a connected Traceability
view. System Structure and System Behavior are placeholders for later slices.

## Stack

- **Shell:** [Tauri 2](https://tauri.app) (Rust) — small binary, fast startup.
- **Frontend:** React 18 + TypeScript + Vite.
- **State:** Zustand.
- **Storage:** plain-text files (YAML frontmatter + markdown body), one file per
  artifact, meant to be checked into your own git repo. There is no database of
  record; the model in memory is rebuilt from the files.

## Data model

Trace links are **forward-only**: a child references its parent(s) in its own
frontmatter (`trace: [...]`). Reverse lookups ("which requirements trace to this
use case") are computed at render time, never stored. On disk:

```
<project>/
  needs/          N-001.md, N-002.md, …
  use-cases/      UC-001.md, …
  requirements/   R-001.md, …
```

Rust does no YAML parsing — it only moves raw file text in and out; the
TypeScript layer (`src/storage/serialize.ts`) owns the schema.

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

## Project layout

| Path | What |
|------|------|
| `src/types.ts` | The data model (Need / UseCase / Requirement). |
| `src/model/` | Pure logic: id allocation, MoSCoW pre-fill, traceability warnings, frontmatter split, search. |
| `src/storage/` | `StorageAdapter` interface + Tauri (file) and browser (seed) backends, and file (de)serialization. |
| `src/state/store.ts` | Zustand store wiring storage to the UI. |
| `src/components/` | Sidebar, top bar, list views, traceability graph, detail drawer. |
| `src-tauri/` | Rust shell and file-storage commands. |

## Consistency checks (this slice)

- A **requirement** that traces to no use case is flagged **orphan**.
- A **use case** that covers no need is flagged.
- A **must**-priority **need** whose linked use cases are all lower priority is
  flagged as a priority mismatch.

## Regenerating the app icon

The icon set (including `src-tauri/icons/icon.ico`) is generated from a single
source PNG:

```bash
npm run tauri icon path/to/app-icon.png
```

## Not in this slice

Behavior/structure modeling, reverse-engineering existing code, LLM drafting,
test-status tracking, and the priority-coherence checker across the whole spine
— all deferred to later slices per the project notes.
