import type { ArtifactKind, Project } from "../types";

const PREFIX: Record<ArtifactKind, string> = {
  stakeholder: "SH",
  need: "N",
  "use-case": "UC",
  requirement: "R",
  component: "C",
  flow: "FL",
  decision: "D",
  glossary: "G",
  test: "T",
};

function idsForKind(project: Project, kind: ArtifactKind): string[] {
  switch (kind) {
    case "stakeholder":
      return project.stakeholders.map((s) => s.id);
    case "need":
      return project.needs.map((n) => n.id);
    case "use-case":
      return project.useCases.map((u) => u.id);
    case "requirement":
      return project.requirements.map((r) => r.id);
    case "component":
      return project.components.map((c) => c.id);
    case "flow":
      return project.flows.map((f) => f.id);
    case "decision":
      return project.decisions.map((d) => d.id);
    case "glossary":
      return project.glossary.map((t) => t.id);
    case "test":
      return project.tests.map((t) => t.id);
  }
}

/** Every activity id in use across all components. */
function allActivityIds(project: Project): string[] {
  return project.components.flatMap((c) => c.activities.map((a) => a.id));
}

/** Next unused project-wide activity id, e.g. "ACT-004". */
export function nextActivityId(project: Project): string {
  const n = maxNumber(allActivityIds(project), "ACT") + 1;
  return `ACT-${String(n).padStart(3, "0")}`;
}

/** Next alternate-path id within a flow, e.g. "AP-3". */
export function nextAltId(existing: string[]): string {
  const n = maxNumber(existing, "AP") + 1;
  return `AP-${n}`;
}

/** Every variable id in use across all components. */
function allVariableIds(project: Project): string[] {
  return project.components.flatMap((c) => c.variables.map((v) => v.id));
}

/** Next unused project-wide variable id, e.g. "VAR-004". */
export function nextVariableId(project: Project): string {
  const n = maxNumber(allVariableIds(project), "VAR") + 1;
  return `VAR-${String(n).padStart(3, "0")}`;
}

/** Highest numeric suffix currently used for a kind (0 if none). */
function maxNumber(ids: string[], prefix: string): number {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of ids) {
    const m = id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/** Next unused ID for a kind, e.g. "N-006", zero-padded to 3 digits. */
export function nextId(project: Project, kind: ArtifactKind): string {
  const prefix = PREFIX[kind];
  const n = maxNumber(idsForKind(project, kind), prefix) + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/** Next unused user-story ID within a use case, e.g. "US-003". */
export function nextStoryId(existing: string[]): string {
  const n = maxNumber(existing, "US") + 1;
  return `US-${String(n).padStart(3, "0")}`;
}
