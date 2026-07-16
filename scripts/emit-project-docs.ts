// Emit the scaffolded format-documentation files into the bundled example
// projects, from the same single source the app uses (`src/storage/projectDocs.ts`),
// so `docs/` and `examples/pound-lock/` never drift from what a freshly created
// project gets.
//
// Run with: npx vite-node scripts/emit-project-docs.ts
//
// Overwrites the doc files (README.md / AGENTS.md) in each target so a content
// change here re-flows into the examples; it never touches artifact files.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PROJECT_DOC_FILES } from "../src/storage/projectDocs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [join(repoRoot, "docs"), join(repoRoot, "examples", "pound-lock")];

for (const target of targets) {
  for (const doc of PROJECT_DOC_FILES) {
    const folder = doc.subdir ? join(target, doc.subdir) : target;
    mkdirSync(folder, { recursive: true });
    const path = join(folder, doc.filename);
    // Root files (README/AGENTS) are written only if absent, matching the app's
    // `scaffold_docs` — this preserves each example's bespoke root README (e.g.
    // `docs/README.md`, the self-model orientation). The per-folder format
    // READMEs are pure generated docs, so always refresh them from source.
    if (doc.subdir === "" && existsSync(path)) {
      console.log(`kept   ${path}`);
      continue;
    }
    writeFileSync(path, doc.content);
    console.log(`wrote  ${path}`);
  }
}
