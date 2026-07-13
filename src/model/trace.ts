// ---------------------------------------------------------------------------
// Traceability: reverse lookups, consistency warnings, and hover chains.
//
// Trace edges are stored forward-only (child -> parent). Everything here is
// derived at call time; nothing is persisted.
//
//   Need  <-- (trace) --  Use Case  <-- (trace) --  Requirement
// ---------------------------------------------------------------------------

import type { Need, Project, Requirement, UseCase } from "../types";

// --- Forward lookups (follow the stored `trace` arrays) ---------------------

export function needsOfUseCase(project: Project, uc: UseCase): Need[] {
  return project.needs.filter((n) => uc.trace.includes(n.id));
}

export function useCasesOfRequirement(project: Project, req: Requirement): UseCase[] {
  return project.useCases.filter((u) => req.trace.includes(u.id));
}

// --- Reverse lookups (computed) ---------------------------------------------

export function useCasesForNeed(project: Project, needId: string): UseCase[] {
  return project.useCases.filter((u) => u.trace.includes(needId));
}

export function requirementsForUseCase(project: Project, ucId: string): Requirement[] {
  return project.requirements.filter((r) => r.trace.includes(ucId));
}

// --- Consistency warnings ---------------------------------------------------

/**
 * A must-priority need whose linked use cases are ALL lower priority.
 * (If nothing links to it yet, that's an orphan-coverage concern, not a
 * priority-coherence one, so this stays false.)
 */
export function needPriorityMismatch(project: Project, need: Need): boolean {
  if (need.moscow !== "must") return false;
  const linked = useCasesForNeed(project, need.id);
  return linked.length > 0 && linked.every((u) => u.moscow !== "must");
}

/** A need that no use case covers at all. */
export function needIsUncovered(project: Project, need: Need): boolean {
  return useCasesForNeed(project, need.id).length === 0;
}

/** A requirement that traces to no use case. */
export function requirementIsOrphan(req: Requirement): boolean {
  return req.trace.length === 0;
}

/** A use case that covers no need. */
export function useCaseIsUncovered(uc: UseCase): boolean {
  return uc.trace.length === 0;
}

export interface Warning {
  message: string;
}

export function needWarning(project: Project, need: Need): Warning | null {
  if (needPriorityMismatch(project, need)) {
    return { message: "Must-priority need with no must-priority use case" };
  }
  if (needIsUncovered(project, need)) {
    return { message: "Not covered by any use case" };
  }
  return null;
}

export function useCaseWarning(uc: UseCase): Warning | null {
  return useCaseIsUncovered(uc) ? { message: "Covers no stakeholder need" } : null;
}

export function requirementWarning(req: Requirement): Warning | null {
  return requirementIsOrphan(req)
    ? { message: "Orphaned — traces to no use case" }
    : null;
}

// --- Hover chain (for the Traceability view) --------------------------------

/**
 * All artifact IDs connected to `id` across the Need -> Use Case -> Requirement
 * spine, following edges in both directions. Used to light up a trace chain
 * when a card is hovered.
 */
export function chainOf(project: Project, id: string): Set<string> {
  const set = new Set<string>([id]);

  const need = project.needs.find((n) => n.id === id);
  const uc = project.useCases.find((u) => u.id === id);
  const req = project.requirements.find((r) => r.id === id);

  if (need) {
    for (const u of useCasesForNeed(project, need.id)) {
      set.add(u.id);
      for (const r of requirementsForUseCase(project, u.id)) set.add(r.id);
    }
  } else if (uc) {
    for (const n of needsOfUseCase(project, uc)) set.add(n.id);
    for (const r of requirementsForUseCase(project, uc.id)) set.add(r.id);
  } else if (req) {
    for (const u of useCasesOfRequirement(project, req)) {
      set.add(u.id);
      for (const n of needsOfUseCase(project, u)) set.add(n.id);
    }
  }

  return set;
}
