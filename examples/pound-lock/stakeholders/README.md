# `stakeholders/` — Stakeholder (`SH-…`)

**Who the system is for.** A stakeholder is a person or party the design serves
or affects. Needs hang off stakeholders (a Need names its stakeholder), so this
is the root of the trace spine. Stakeholders are *not* prioritised — no
status/MoSCoW — they're just who's in the picture.

**Filename:** `SH-<n>.md` (e.g. `SH-001.md`), matching the `id`.

## Frontmatter

| Field      | Required | Type / values             | Meaning |
|------------|----------|---------------------------|---------|
| `id`       | yes      | `SH-<n>`                   | Identity; must equal the filename stem. |
| `title`    | yes      | string                    | The stakeholder's name/role, e.g. "Lock Operator". |
| `type`     | no       | `primary` \| `secondary`   | Direct target of the design (`primary`) vs indirectly affected (`secondary`). Default `primary`. |
| `created`  | no       | `"YYYY-MM-DD"`             | Creation date (quote it). |
| `inferred` | no       | `true`                     | Mark as low-confidence / not yet human-confirmed. Omit when trusted. |

## Body

Free text: who they are and what they care about.

## Template

```markdown
---
id: "SH-001"
title: "Operator"
type: "primary"
---

Runs the system day to day; cares about a predictable, safe routine.
```
