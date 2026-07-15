// ---------------------------------------------------------------------------
// System Behaviour & Structure derivations.
//
// The one hard rule: structure connections are NEVER stored. They are derived
// from flow adjacency here — two components are connected iff one's activity
// runs immediately before the other's within some flow. Everything the
// Structure view draws comes out of this file, so behaviour and structure can
// never silently drift apart.
// ---------------------------------------------------------------------------

import type { Activity, Component, Flow, Project, UseCase } from "../types";

// --- activity / component lookups -------------------------------------------

export function findActivity(project: Project, activityId: string): Activity | null {
  if (!activityId) return null;
  for (const c of project.components) {
    const a = c.activities.find((x) => x.id === activityId);
    if (a) return a;
  }
  return null;
}

/** The component that owns an activity, or null if the id is unknown. */
export function componentOfActivity(project: Project, activityId: string): Component | null {
  if (!activityId) return null;
  return project.components.find((c) => c.activities.some((a) => a.id === activityId)) ?? null;
}

export function activityLabel(project: Project, activityId: string): string {
  return findActivity(project, activityId)?.label ?? "";
}

// --- flow ⇄ use case links --------------------------------------------------

export function flowOfUseCase(project: Project, uc: UseCase): Flow | null {
  if (!uc.flow) return null;
  return project.flows.find((f) => f.id === uc.flow) ?? null;
}

/** The use case a flow implements (reverse of UseCase.flow), or null. */
export function useCaseOfFlow(project: Project, flow: Flow): UseCase | null {
  return project.useCases.find((u) => u.flow === flow.id) ?? null;
}

// --- flow traversal ---------------------------------------------------------

/**
 * Every ordered pair of activity ids that run back-to-back within a flow —
 * across the main path and each alternate's entry, internal steps, and rejoin.
 * This is the raw material for structure edges.
 */
export function activityAdjacencies(flow: Flow): [string, string][] {
  const pairs: [string, string][] = [];
  const push = (a: string, b: string) => {
    if (a && b) pairs.push([a, b]);
  };

  for (let i = 0; i < flow.main.length - 1; i++) push(flow.main[i], flow.main[i + 1]);

  for (const alt of flow.alternates) {
    if (alt.steps.length === 0) continue;
    // entry: the diverging main step into the first alternate step
    if (alt.after >= 0 && alt.after < flow.main.length) push(flow.main[alt.after], alt.steps[0]);
    // internal alternate steps
    for (let i = 0; i < alt.steps.length - 1; i++) push(alt.steps[i], alt.steps[i + 1]);
    // rejoin back into the main flow (unless the alternate terminates)
    if (alt.rejoin >= 0 && alt.rejoin < flow.main.length) {
      push(alt.steps[alt.steps.length - 1], flow.main[alt.rejoin]);
    }
  }

  return pairs;
}

// --- derived structure graph ------------------------------------------------

export interface StructureEdge {
  /** Component ids, ordered lexically so the pair is canonical/undirected. */
  a: string;
  b: string;
  /** Ids of flows whose adjacency produced this edge (for provenance/tooltip). */
  flows: string[];
}

/**
 * Undirected connections between components, derived from every flow. A pair
 * appears once; self-links (a component's own activities in sequence) are
 * dropped since a component always "communicates" with itself.
 */
export function structureEdges(project: Project): StructureEdge[] {
  const byKey = new Map<string, StructureEdge>();

  for (const flow of project.flows) {
    for (const [fromAct, toAct] of activityAdjacencies(flow)) {
      const from = componentOfActivity(project, fromAct);
      const to = componentOfActivity(project, toAct);
      if (!from || !to || from.id === to.id) continue;
      const [a, b] = from.id < to.id ? [from.id, to.id] : [to.id, from.id];
      const key = `${a}|${b}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.flows.includes(flow.id)) existing.flows.push(flow.id);
      } else {
        byKey.set(key, { a, b, flows: [flow.id] });
      }
    }
  }

  return [...byKey.values()];
}

// --- authored static dependencies -------------------------------------------

/** A directed static dependency: component `from` uses/depends on `to`. */
export interface StaticEdge {
  from: string;
  to: string;
}

/**
 * The authored static-dependency edges (Component.uses), unlike the flow-derived
 * connections above. Directed and kept as authored — the ONE thing about
 * structure that behaviour can't reveal. Self-references and dangling ids are
 * dropped, and a duplicate `from → to` collapses to a single edge.
 */
export function staticEdges(project: Project): StaticEdge[] {
  const ids = new Set(project.components.map((c) => c.id));
  const seen = new Set<string>();
  const out: StaticEdge[] = [];
  for (const c of project.components) {
    for (const dep of c.uses) {
      if (dep === c.id || !ids.has(dep)) continue;
      const key = `${c.id}|${dep}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: c.id, to: dep });
    }
  }
  return out;
}

// --- component ⇄ spine (for the component detail panel) ---------------------

/** Use cases whose flow includes an activity owned by this component. */
export function useCasesForComponent(project: Project, component: Component): UseCase[] {
  const actIds = new Set(component.activities.map((a) => a.id));
  const result: UseCase[] = [];
  for (const uc of project.useCases) {
    const flow = flowOfUseCase(project, uc);
    if (!flow) continue;
    const used =
      flow.main.some((id) => actIds.has(id)) ||
      flow.alternates.some((alt) => alt.steps.some((id) => actIds.has(id)));
    if (used) result.push(uc);
  }
  return result;
}

/** Requirements reaching this component through the use cases it acts in. */
export function requirementsForComponent(project: Project, component: Component) {
  const ucIds = new Set(useCasesForComponent(project, component).map((u) => u.id));
  return project.requirements.filter((r) => r.trace.some((id) => ucIds.has(id)));
}
