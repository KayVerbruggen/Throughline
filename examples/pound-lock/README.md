# Throughline project

This folder is a **Throughline** project: a lightweight, plain-text model of a
system that traces it from the people it serves down to the tests that verify it.
There is no database and no binary format — every artifact is one Markdown file
with a YAML header, so the whole model is readable, diff-able, and git-friendly
without the app. You can edit these files by hand or have an LLM generate them;
the app watches the folder and reloads when files change underneath it.

## The trace spine

The heart of the model is a forward-only chain. Each artifact names its
**parent(s)** in a `trace:` list; the reverse direction ("what traces to me")
is computed, never stored.

```
Stakeholder ──held by── Need ──trace──▶ Use Case ──trace──▶ Requirement ──trace──▶ Test
```

- A **Need** names the **Stakeholder** who holds it.
- A **Use Case** traces to the **Needs** it satisfies.
- A **Requirement** traces to the **Use Cases** it makes precise (EARS "shall").
- A **Test** traces to the **Requirements** it verifies.

Around that spine sit four supporting kinds: **Components** (the parts of the
system) own the **Activities** that **Flows** sequence into behaviour;
**Decisions** record *why* the design is the way it is; the **Glossary** pins
down domain vocabulary.

## Folders and ids

One folder per kind, one file per artifact. **The filename is the artifact's id
plus `.md`** (e.g. `N-006.md`), and that id is repeated inside the file so
identity survives a rename — the in-file id always wins.

| Folder           | Kind         | Id prefix | What it holds                              |
|------------------|--------------|-----------|--------------------------------------------|
| `stakeholders/`  | Stakeholder  | `SH-`     | Who the system is for                      |
| `needs/`         | Need         | `N-`      | What those people need                     |
| `use-cases/`     | Use Case     | `UC-`     | How the system satisfies a need            |
| `requirements/`  | Requirement  | `R-`      | Precise "shall" statements (EARS)          |
| `components/`    | Component    | `C-`      | The parts of the system, as a hierarchy    |
| `flows/`         | Flow         | `FL-`     | One behaviour per use case, as steps       |
| `decisions/`     | Decision     | `D-`      | Architectural choices, as Y-statements     |
| `glossary/`      | Glossary     | `G-`      | Domain terms                               |
| `tests/`         | Test         | `T-`      | Verification of requirements               |

**Each folder has its own `README.md`** documenting that kind's frontmatter
fields, body, and a copy-paste template. Start there when authoring a file.

## File anatomy

Every artifact file is YAML **frontmatter** (between `---` fences) followed by an
optional Markdown **body**:

```markdown
---
id: N-006
title: Structure and behaviour that cannot silently drift
status: approved
moscow: must
stakeholder: SH-001
tags:
  - consistency
created: "2026-07-14"
---

Free-text body — the rationale, description, or (for some kinds) a generated
sentence. Its meaning depends on the kind; see the folder's README.
```

Parsing is deliberately forgiving (files are hand-edited and git-merged): unknown
keys are ignored, missing optional fields fall back to sensible defaults, and a
malformed file degrades rather than breaking the load. Serialization is
deterministic, so re-saving a file from the app produces a minimal, stable diff.

## The one rule that will surprise you

**Structure connections between components are never stored — they are derived
from behaviour.** Two components are shown as connected if and only if their
activities run back-to-back in some flow. So you shape the system diagram by
writing flows, not by drawing edges. The only structural links you *do* author
are a component's `parent` (what it is part of) and its `uses` (what it statically
depends on). See `components/README.md` and `flows/README.md`.

## Generated bodies

Two kinds have bodies that are **composed from their frontmatter slots, not
hand-typed**: a **Requirement**'s EARS sentence and a **Decision**'s Y-statement.
Edit the slots; the sentence follows. If you hand-write the body it will be
overwritten the next time the app saves the file.

## For LLMs

See **`AGENTS.md`** at the project root for a compact generation contract — the
invariants to respect, id allocation, expression syntax, and a worked example —
so you can author correct artifacts without reading the app's source.

---

*`README.md` and `AGENTS.md` files (root and per-folder) are documentation only;
the app's loader ignores them, so they never appear as artifacts.*
