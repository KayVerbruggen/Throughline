import type { ArtifactKind, Project } from "../types";

const PREFIX: Record<ArtifactKind, string> = {
  need: "N",
  "use-case": "UC",
  requirement: "R",
};

function idsForKind(project: Project, kind: ArtifactKind): string[] {
  switch (kind) {
    case "need":
      return project.needs.map((n) => n.id);
    case "use-case":
      return project.useCases.map((u) => u.id);
    case "requirement":
      return project.requirements.map((r) => r.id);
  }
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
