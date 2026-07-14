// ---------------------------------------------------------------------------
// Flow-editing operations (pure).
//
// Editing a flow can also touch components, because activities live on
// components. Each op takes the current project + flow and returns the updated
// flow plus the list of components whose activity lists changed (to persist).
// Nothing here mutates its inputs.
//
// Activity lifecycle: a step holds an activity id, or "" while unassigned.
// Choosing a component for an empty step *creates* an activity on it; labelling
// then names it. Only these transient empty-label activities are garbage-
// collected — a named activity stays on its component even when removed from a
// flow, since "a component has activities" is independent of any one flow.
// ---------------------------------------------------------------------------

import { nextActivityId, nextAltId } from "./ids";
import type { Activity, Component, Flow, Project } from "../types";

export interface FlowEdit {
  flow: Flow;
  /** Components whose activity list changed and must be persisted. */
  components: Component[];
}

/** "main" for the happy path, or an alternate's id. */
export type StepLoc = string;

function cloneFlow(flow: Flow): Flow {
  return {
    ...flow,
    main: [...flow.main],
    alternates: flow.alternates.map((a) => ({ ...a, steps: [...a.steps] })),
  };
}

function stepsAt(flow: Flow, loc: StepLoc): string[] {
  if (loc === "main") return flow.main;
  const alt = flow.alternates.find((a) => a.id === loc);
  return alt ? alt.steps : [];
}

function componentOwning(project: Project, activityId: string): Component | null {
  if (!activityId) return null;
  return project.components.find((c) => c.activities.some((a) => a.id === activityId)) ?? null;
}

function activityOf(project: Project, activityId: string): Activity | null {
  if (!activityId) return null;
  for (const c of project.components) {
    const a = c.activities.find((x) => x.id === activityId);
    if (a) return a;
  }
  return null;
}

/** Is an activity referenced anywhere across the project's flows? */
function referenced(flows: Flow[], activityId: string): boolean {
  return flows.some(
    (f) => f.main.includes(activityId) || f.alternates.some((a) => a.steps.includes(activityId)),
  );
}

/** Project flow-set with `updated` substituted for its same-id flow. */
function flowsWith(project: Project, updated: Flow): Flow[] {
  return project.flows.map((f) => (f.id === updated.id ? updated : f));
}

// --- main / alternate step operations ---------------------------------------

/** Append an empty (unassigned) step to the main flow or an alternate. */
export function addStep(flow: Flow, loc: StepLoc): FlowEdit {
  const f = cloneFlow(flow);
  stepsAt(f, loc).push("");
  return { flow: f, components: [] };
}

/**
 * Assign (or move) the step at `index` to `componentId`. An empty step gains a
 * freshly-created activity on that component; a filled step's activity is moved
 * there, keeping its id so other flows referencing it stay intact.
 */
export function setStepComponent(
  project: Project,
  flow: Flow,
  loc: StepLoc,
  index: number,
  componentId: string,
): FlowEdit {
  const target = project.components.find((c) => c.id === componentId);
  if (!target) return { flow, components: [] };

  const f = cloneFlow(flow);
  const arr = stepsAt(f, loc);
  const currentId = arr[index] ?? "";

  if (!currentId) {
    const id = nextActivityId(project);
    const newActivity: Activity = { id, label: "" };
    arr[index] = id;
    return {
      flow: f,
      components: [{ ...target, activities: [...target.activities, newActivity] }],
    };
  }

  const owner = componentOwning(project, currentId);
  if (!owner || owner.id === target.id) return { flow, components: [] };

  const activity = owner.activities.find((a) => a.id === currentId)!;
  const changedOwner: Component = {
    ...owner,
    activities: owner.activities.filter((a) => a.id !== currentId),
  };
  const changedTarget: Component = { ...target, activities: [...target.activities, activity] };
  return { flow: f, components: [changedOwner, changedTarget] };
}

/**
 * Set the label of the step at `index`. If the typed label matches a *different*
 * existing activity on the same component, the step is repointed to reuse it;
 * otherwise the current activity is renamed in place.
 */
export function setStepLabel(
  project: Project,
  flow: Flow,
  loc: StepLoc,
  index: number,
  label: string,
): FlowEdit {
  const f = cloneFlow(flow);
  const arr = stepsAt(f, loc);
  const currentId = arr[index] ?? "";
  if (!currentId) return { flow, components: [] };

  const owner = componentOwning(project, currentId);
  if (!owner) return { flow, components: [] };

  const trimmed = label.trim();
  const match = trimmed
    ? owner.activities.find((a) => a.id !== currentId && a.label.trim() === trimmed)
    : undefined;

  if (match) {
    // Reuse the existing activity; drop the old one if it was a transient stub.
    arr[index] = match.id;
    const current = activityOf(project, currentId);
    const stillUsed = referenced(flowsWith(project, f), currentId);
    if (current && current.label.trim() === "" && !stillUsed) {
      return {
        flow: f,
        components: [{ ...owner, activities: owner.activities.filter((a) => a.id !== currentId) }],
      };
    }
    return { flow: f, components: [] };
  }

  return {
    flow: f,
    components: [
      {
        ...owner,
        activities: owner.activities.map((a) => (a.id === currentId ? { ...a, label } : a)),
      },
    ],
  };
}

/**
 * Update an activity's formal behaviour (`pre` / `effects`). Activities are
 * component-owned and shared across flows, so this edits the owning component;
 * the flow itself is unchanged. Empty values are dropped so the fields stay
 * absent rather than serialising as blanks.
 */
export function setActivityDetails(
  project: Project,
  flow: Flow,
  activityId: string,
  patch: Partial<Pick<Activity, "pre" | "effects">>,
): FlowEdit {
  const owner = componentOwning(project, activityId);
  if (!owner) return { flow, components: [] };
  const activities = owner.activities.map((a) => {
    if (a.id !== activityId) return a;
    const next: Activity = { ...a };
    if ("pre" in patch) {
      const pre = patch.pre?.trim();
      if (pre) next.pre = pre;
      else delete next.pre;
    }
    if ("effects" in patch) {
      const effects = (patch.effects ?? []).map((e) => e.trim()).filter(Boolean);
      if (effects.length) next.effects = effects;
      else delete next.effects;
    }
    return next;
  });
  return { flow, components: [{ ...owner, activities }] };
}

/**
 * Remove the step at `index`. When removing a main step, alternate anchors are
 * shifted so they keep pointing at the right steps. A transient empty-label
 * activity that becomes unreferenced is cleaned up; named activities are kept.
 */
export function deleteStep(project: Project, flow: Flow, loc: StepLoc, index: number): FlowEdit {
  const f = cloneFlow(flow);
  const arr = stepsAt(f, loc);
  const removedId = arr[index] ?? "";
  arr.splice(index, 1);

  if (loc === "main") {
    for (const alt of f.alternates) {
      if (alt.after > index) alt.after -= 1;
      else if (alt.after === index) alt.after = Math.max(0, index - 1);
      if (alt.rejoin > index) alt.rejoin -= 1;
      else if (alt.rejoin === index) alt.rejoin = -1; // its rejoin target is gone
    }
  }

  const activity = activityOf(project, removedId);
  const stillUsed = referenced(flowsWith(project, f), removedId);
  if (activity && activity.label.trim() === "" && !stillUsed) {
    const owner = componentOwning(project, removedId);
    if (owner) {
      return {
        flow: f,
        components: [{ ...owner, activities: owner.activities.filter((a) => a.id !== removedId) }],
      };
    }
  }
  return { flow: f, components: [] };
}

/** Reorder a step within its list (drag/keyboard up-down). */
export function moveStep(flow: Flow, loc: StepLoc, from: number, to: number): FlowEdit {
  const f = cloneFlow(flow);
  const arr = stepsAt(f, loc);
  if (to < 0 || to >= arr.length || from === to) return { flow, components: [] };
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  if (loc === "main") {
    // Anchors are positional; keep them valid but don't try to track the move.
    for (const alt of f.alternates) {
      alt.after = Math.min(alt.after, f.main.length - 1);
      if (alt.rejoin >= f.main.length) alt.rejoin = -1;
    }
  }
  return { flow: f, components: [] };
}

// --- alternate path operations ----------------------------------------------

export function addAlternate(flow: Flow): FlowEdit {
  const f = cloneFlow(flow);
  const after = Math.max(0, f.main.length - 1);
  f.alternates.push({
    id: nextAltId(f.alternates.map((a) => a.id)),
    condition: "",
    after,
    rejoin: -1,
    steps: [],
  });
  return { flow: f, components: [] };
}

export function updateAlternate(
  flow: Flow,
  altId: string,
  patch: Partial<Pick<Flow["alternates"][number], "condition" | "guard" | "after" | "rejoin">>,
): FlowEdit {
  const f = cloneFlow(flow);
  f.alternates = f.alternates.map((a) => (a.id === altId ? { ...a, ...patch } : a));
  return { flow: f, components: [] };
}

export function deleteAlternate(project: Project, flow: Flow, altId: string): FlowEdit {
  const f = cloneFlow(flow);
  const alt = f.alternates.find((a) => a.id === altId);
  f.alternates = f.alternates.filter((a) => a.id !== altId);

  const components: Component[] = [];
  if (alt) {
    for (const stepId of alt.steps) {
      const activity = activityOf(project, stepId);
      const stillUsed = referenced(flowsWith(project, f), stepId);
      if (activity && activity.label.trim() === "" && !stillUsed) {
        const owner = componentOwning(project, stepId);
        if (owner) {
          const existing = components.find((c) => c.id === owner.id) ?? owner;
          components.push({
            ...existing,
            activities: existing.activities.filter((a) => a.id !== stepId),
          });
        }
      }
    }
  }
  return { flow: f, components };
}
