# `tests/` — Test (`T-…`)

**Verification of requirements.** A test is the leaf of the trace spine: it
traces to the requirement(s) it checks and records its latest result. The tool
never runs the test — an author or CI records the outcome into the file.

**Filename:** `T-<n>.md`, matching the `id`. Body = description of what it checks.

## Frontmatter

| Field      | Required | Type / values              | Meaning |
|------------|----------|----------------------------|---------|
| `id`       | yes      | `T-<n>`                     | Identity; equals the filename stem. |
| `title`    | yes      | string                     | Short name for the test. |
| `trace`    | no       | list of `R-<n>`             | The requirements this test verifies. |
| `file`     | no       | path string                | Where the test lives, e.g. `src/model/trace.test.ts`. |
| `result`   | no       | `pass` \| `fail` \| `unknown` | Latest known outcome. Default `unknown` (not yet run/recorded). |
| `created`  | no       | `"YYYY-MM-DD"`              | Creation date. |
| `inferred` | no       | `true`                      | Low-confidence marker. |

## Template

```markdown
---
id: T-001
title: Halt on stop is immediate
trace:
  - R-001
result: pass
file: src/controller/stop.test.ts
---

Asserts that pressing the emergency stop drives every actuator to halted within
the 500 ms budget.
```
