# Working preferences

## Commit cadence
Commit after each completed logical unit of work (a finished feature, fix, or refactor) rather than batching multiple unrelated changes into one commit. This applies even if the unit only touches a handful of files — the goal is commits that map to a single coherent change, not size.

You have standing authorization to create these commits without asking each time, following the repo's normal commit message conventions (see git log for style). Still never force-push, amend published commits, or push to remote without asking.

## Commands
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` / `npm run test:watch` — Vitest
- `npm run dev` — Vite dev server (frontend only; use `npm run tauri dev` for the desktop shell)
- `npm run build` — `tsc && vite build`
- No lint script and no CI configured yet — typecheck + test are the only automated gates. Run both before calling a change done.

## Architecture layering
`types.ts` (schema) → `src/model/` (pure logic: `ids`, `trace`, `layout`, `hierarchy`, `behavior`, `expr/`, `decision`) → `src/storage/` (`serialize`, `adapter`, `browserStorage`, `tauriStorage`, mirrored by `src-tauri/src/storage.rs`) → `src/state/store.ts` (zustand) → `src/components/` (UI, one view per artifact kind under `views/`).

Adding a new artifact kind touches all of these layers: `types.ts`, `model/ids.ts` (`PREFIX`), `storage/serialize.ts`, `src-tauri/src/storage.rs` (`KIND_DIRS`), `state/store.ts`, a new `views/*View.tsx`, plus nav wiring in `Sidebar.tsx`/`TopBar.tsx` and rendering in `icons.tsx`/`badges.tsx`/`detail/bodies.tsx`. Treat these as one commit (see the "Expand data model" / "Add UI" split from the last cleanup for the precedent), not several.

## Self-modelling reference
`docs/` is a Throughline project that models Throughline itself (see `docs/README.md`). Before a non-trivial data-model change, check whether it's the kind of friction already logged in `TODO.md`'s "Data-model friction" section or `docs/REVERSE-ENGINEERING-GUIDE.md` — those capture real pain points hit while building this tool.

## Browser-preview verification
The Browser pane's `screenshot` action reliably times out in this environment — don't use it. Verify observable UI changes with the text-based tools instead (`read_page`, `javascript_tool` to inspect DOM/computed styles/localStorage, `read_console_messages`).

## Git noise
`core.autocrlf=true` is set, so every `git add`/`commit` prints `LF will be replaced by CRLF` warnings for every file. This is expected and harmless — not a sign of a problem.
