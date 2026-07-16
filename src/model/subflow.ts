// ---------------------------------------------------------------------------
// Subflows — a flow step that calls into another use case's flow.
//
// A flow's step arrays (`main`, each alternate's `steps`) hold ids. Most are
// activity ids (`ACT-xxx`); a step may instead hold a *flow* id (`FL-xxx`),
// which means "invoke that flow here" — the behaviour of another use case,
// reused inline. Ids are prefix-disambiguated, so this needs no new schema:
// storage round-trips the id either way, and consumers branch on `stepKind`.
//
// This module is the one place that knows an id in a step slot might be an
// invoke. It answers three things, all pure:
//   • what a step *is* (`stepKind`) and which flow it calls (`invokedFlow`);
//   • the activity ids at a callee's boundary (`entryActivities`/`exitActivities`),
//     resolved *through* nested invokes, so structure connections can flow
//     across the call (see behaviour adjacency) — with a visited set so a
//     subflow cycle can't recurse forever;
//   • which flows sit on an invocation cycle (`flowsInCycle`), so the UI can
//     warn and the derivations can stay well-formed rather than loop.
// ---------------------------------------------------------------------------

import type { Flow, Project } from "../types";

/** What occupies a step slot: nothing yet, an activity, or a call to a flow. */
export type StepKind = "empty" | "activity" | "invoke";

/**
 * Classify a step id by its prefix. "" is an unassigned slot; an `FL-` id is a
 * subflow invoke; anything else is an activity reference. (Ids are minted with
 * fixed prefixes in `model/ids.ts`, so the prefix is a reliable discriminator.)
 */
export function stepKind(id: string): StepKind {
  if (!id) return "empty";
  return id.startsWith("FL-") ? "invoke" : "activity";
}

/** The flow a subflow step invokes, or null if the step isn't an invoke (or the
 *  target flow no longer exists). The step id *is* the flow id. */
export function invokedFlow(project: Project, stepId: string): Flow | null {
  if (stepKind(stepId) !== "invoke") return null;
  return project.flows.find((f) => f.id === stepId) ?? null;
}

// --- boundary activities ----------------------------------------------------
// The entry/exit of a flow are the activities an incoming/outgoing edge should
// actually attach to. When the boundary step is itself an invoke, we resolve
// through it to the nested callee's boundary — a `visiting` set breaks cycles.

function firstFilled(steps: string[]): string | null {
  for (const s of steps) if (s) return s;
  return null;
}

function lastFilled(steps: string[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]) return steps[i];
  return null;
}

/**
 * The activity id(s) an edge *into* this flow should land on — its first main
 * step, resolved through leading invokes. Empty when the flow has no main steps
 * or the chain dead-ends in a cycle/unknown flow. Returns a (0-or-1)-element
 * array so callers can treat entry and exit uniformly.
 */
export function entryActivities(
  project: Project,
  flowId: string,
  visiting: ReadonlySet<string> = new Set(),
): string[] {
  if (visiting.has(flowId)) return [];
  const flow = project.flows.find((f) => f.id === flowId);
  if (!flow) return [];
  const step = firstFilled(flow.main);
  if (!step) return [];
  if (stepKind(step) === "activity") return [step];
  return entryActivities(project, step, new Set(visiting).add(flowId));
}

/** The activity id(s) an edge *out of* this flow should originate from — its
 *  last main step, resolved through trailing invokes. See `entryActivities`. */
export function exitActivities(
  project: Project,
  flowId: string,
  visiting: ReadonlySet<string> = new Set(),
): string[] {
  if (visiting.has(flowId)) return [];
  const flow = project.flows.find((f) => f.id === flowId);
  if (!flow) return [];
  const step = lastFilled(flow.main);
  if (!step) return [];
  if (stepKind(step) === "activity") return [step];
  return exitActivities(project, step, new Set(visiting).add(flowId));
}

// --- adjacency helpers (used by behaviour edge derivation) ------------------

/**
 * The activity ids an edge *leaving* this step should originate from: the step
 * itself if it's an activity, the callee's exit activities if it's an invoke,
 * nothing if it's empty.
 */
export function stepHeads(project: Project, stepId: string): string[] {
  const k = stepKind(stepId);
  if (k === "empty") return [];
  if (k === "activity") return [stepId];
  return exitActivities(project, stepId);
}

/** The activity ids an edge *entering* this step should arrive at (mirror of
 *  `stepHeads`: an invoke resolves to the callee's entry activities). */
export function stepTails(project: Project, stepId: string): string[] {
  const k = stepKind(stepId);
  if (k === "empty") return [];
  if (k === "activity") return [stepId];
  return entryActivities(project, stepId);
}

// --- invocation graph / cycles ----------------------------------------------

/** The distinct flow ids a flow invokes, across its main path and every
 *  alternate. A flow that calls the same subflow twice lists it once. */
export function invocationTargets(flow: Flow): string[] {
  const out = new Set<string>();
  const scan = (steps: string[]) => {
    for (const s of steps) if (stepKind(s) === "invoke") out.add(s);
  };
  scan(flow.main);
  for (const alt of flow.alternates) scan(alt.steps);
  return [...out];
}

/**
 * The flow ids that lie on some invocation cycle — a flow that (directly or
 * transitively) invokes itself, including a flow that invokes itself directly.
 * The Behaviour view warns on these, and the derivations use the `visiting`
 * guards above so a cycle degrades to a dropped edge rather than a hang.
 */
export function flowsInCycle(project: Project): Set<string> {
  const ids = new Set(project.flows.map((f) => f.id));
  const targets = new Map<string, string[]>();
  for (const f of project.flows) {
    targets.set(
      f.id,
      invocationTargets(f).filter((t) => ids.has(t)),
    );
  }

  const onCycle = new Set<string>();
  for (const start of ids) {
    const seen = new Set<string>();
    let found = false;
    const dfs = (n: string) => {
      for (const m of targets.get(n) ?? []) {
        if (found) return;
        if (m === start) {
          found = true;
          return;
        }
        if (!seen.has(m)) {
          seen.add(m);
          dfs(m);
        }
      }
    };
    dfs(start);
    if (found) onCycle.add(start);
  }
  return onCycle;
}
