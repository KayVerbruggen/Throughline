import { describe, expect, it } from "vitest";

import { PROJECT_DOC_FILES } from "./projectDocs";
import type { ArtifactKind } from "../types";

// The on-disk folder name for each artifact kind — mirrors Rust's KIND_DIRS.
const KIND_DIRS: Record<ArtifactKind, string> = {
  stakeholder: "stakeholders",
  need: "needs",
  "use-case": "use-cases",
  requirement: "requirements",
  component: "components",
  flow: "flows",
  decision: "decisions",
  glossary: "glossary",
  test: "tests",
};

describe("PROJECT_DOC_FILES scaffolding", () => {
  it("documents every artifact kind's folder", () => {
    const folders = new Set(PROJECT_DOC_FILES.map((d) => d.subdir));
    for (const dir of Object.values(KIND_DIRS)) {
      // A new artifact kind must ship a folder README — see CLAUDE.md's
      // "adding a new artifact kind touches all layers".
      expect(folders, `missing README for ${dir}/`).toContain(dir);
    }
  });

  it("ships a root README and AGENTS guide", () => {
    const root = PROJECT_DOC_FILES.filter((d) => d.subdir === "").map((d) => d.filename);
    expect(root).toContain("README.md");
    expect(root).toContain("AGENTS.md");
  });

  it("only writes reserved doc filenames the loader skips", () => {
    // The loader (Rust `is_doc_file`) skips exactly these names; anything else
    // here would be parsed as a bogus artifact.
    for (const doc of PROJECT_DOC_FILES) {
      expect(["README.md", "AGENTS.md"]).toContain(doc.filename);
      expect(doc.content.length).toBeGreaterThan(0);
    }
  });

  it("targets only the project root or a known kind folder", () => {
    const known = new Set<string>(["", ...Object.values(KIND_DIRS)]);
    for (const doc of PROJECT_DOC_FILES) {
      expect(known, `unknown subdir ${doc.subdir}`).toContain(doc.subdir);
    }
  });
});
