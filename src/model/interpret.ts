// ---------------------------------------------------------------------------
// Flow interpreter (Stage 2) — execute the activity diagram.
//
// A single token walks the same graph the Behaviour view draws
// (`activityDiagram.ts`), carrying a *valuation* (every component variable's
// current value). Arriving at an activity applies its effects; leaving a step
// with alternates evaluates their guards to choose the outgoing edge. The
// interpreter's `nodeId` is a diagram node id, so the runner UI can highlight
// exactly where the token is. Pure: no I/O, immutable valuations, fully testable.
//
// Semantics (UML activity/token, single token):
//   • effects apply on *arrival* at an activity node;
//   • a branch decision is made when *leaving* a main step, over the valuation
//     that already includes that step's effects (i.e. "branches after step i");
//   • a guard-less alternate never fires automatically (it can't be evaluated) —
//     it's offered as a manual choice only;
//   • `pre` is checked and reported but does not block the step (the runner
//     surfaces it; the consistency pass can treat it as an error).
// ---------------------------------------------------------------------------

import { findActivity } from "./behavior";
import {
  END_NODE,
  START_NODE,
  altNodeId,
  mainNodeId,
  type DiagramEdgeKind,
} from "./activityDiagram";
import {
  analyzeEffect,
  analyzeGuard,
  applyAssignment,
  evaluate,
  valuationKey,
  type Valuation,
  type Value,
} from "./expr";
import type { Activity, Flow, Project, VarType, Variable } from "../types";

export type { Valuation, Value } from "./expr";

/** Guard against a runaway loop (a backward rejoin whose guard never settles). */
const MAX_STEPS = 200;

export interface ExecState {
  valuation: Valuation;
  /** Current diagram node: START_NODE | mainNodeId(i) | altNodeId(key,j) | END_NODE. */
  nodeId: string;
  done: boolean;
  /** Advances taken so far (for the runaway guard). */
  steps: number;
  /** Non-fatal issues from the last advance (precondition unmet, bad effect). */
  notes: string[];
}

export interface Transition {
  to: string;
  kind: DiagramEdgeKind;
  /** Guard (preferred) or prose condition, for a branch. */
  label?: string;
  /** For a guarded branch: did its guard hold under the current valuation?
   *  undefined for a non-branch edge or a branch with no evaluable guard. */
  guardValue?: boolean;
}

// --- initial valuation ------------------------------------------------------

/** A variable's starting value: parsed from `initial`, else a type default. */
function initialValue(v: Variable): Value {
  const t = v.type;
  const raw = v.initial?.trim();
  if (raw) {
    if (t.kind === "bool") return raw === "true";
    if (t.kind === "int") {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : (t.min ?? 0);
    }
    if (t.kind === "enum") return t.values.includes(raw) ? raw : (t.values[0] ?? "");
  }
  if (t.kind === "bool") return false;
  if (t.kind === "int") return t.min ?? 0;
  return t.values[0] ?? "";
}

/** Seed every declared component variable, so any resolvable guard/effect has
 *  a value to read. */
export function initialValuation(project: Project): Valuation {
  const val: Valuation = new Map();
  for (const c of project.components) {
    for (const v of c.variables) val.set(valuationKey(c.id, v.name), initialValue(v));
  }
  return val;
}

/** Fresh execution at Start, optionally overlaying canonical-keyed overrides. */
export function initExec(project: Project, _flow: Flow, overrides?: Valuation): ExecState {
  const valuation = initialValuation(project);
  if (overrides) for (const [k, v] of overrides) valuation.set(k, v);
  return { valuation, nodeId: START_NODE, done: false, steps: 0, notes: [] };
}

// --- node ↔ activity --------------------------------------------------------

const MAIN_RE = /^m(\d+)$/;
const ALT_RE = /^(.+)#(\d+)$/;

/** The activity a node runs, or null for Start / End / a dangling id. */
function activityAt(project: Project, flow: Flow, nodeId: string): Activity | null {
  const m = MAIN_RE.exec(nodeId);
  if (m) {
    const id = flow.main[Number(m[1])];
    return id ? findActivity(project, id) : null;
  }
  const a = ALT_RE.exec(nodeId);
  if (a) {
    const alt = flow.alternates.find((x) => x.id === a[1]);
    const id = alt?.steps[Number(a[2])];
    return id ? findActivity(project, id) : null;
  }
  return null;
}

// --- transitions ------------------------------------------------------------

/** Whether a guard holds now; undefined if it can't be evaluated (no guard,
 *  parse/type error, or an unbound reference). */
function guardHolds(project: Project, guard: string | undefined, val: Valuation): boolean | undefined {
  if (!guard) return undefined;
  const a = analyzeGuard(project, guard);
  if (!a.ok) return undefined;
  try {
    return evaluate(project, a.ast, val) === true;
  } catch {
    return undefined;
  }
}

/**
 * All outgoing transitions from the current node, with guards evaluated against
 * the current valuation. The runner shows these (highlighting which fired); a
 * main step lists its branches first, then the sequential continue last.
 */
export function outgoing(project: Project, flow: Flow, state: ExecState): Transition[] {
  const { nodeId } = state;
  if (state.done || nodeId === END_NODE) return [];

  const inRange = (n: number) => n >= 0 && n < flow.main.length;
  const mainOrEnd = (n: number) => (inRange(n) ? mainNodeId(n) : END_NODE);

  if (nodeId === START_NODE) {
    return [{ to: flow.main.length > 0 ? mainNodeId(0) : END_NODE, kind: "seq" }];
  }

  const m = MAIN_RE.exec(nodeId);
  if (m) {
    const i = Number(m[1]);
    const trans: Transition[] = [];
    for (const alt of flow.alternates) {
      if (alt.after !== i) continue;
      const target = alt.steps.length > 0 ? altNodeId(alt.id, 0) : mainOrEnd(alt.rejoin);
      trans.push({
        to: target,
        kind: "branch",
        label: alt.guard || alt.condition || undefined,
        guardValue: guardHolds(project, alt.guard, state.valuation),
      });
    }
    trans.push({ to: i + 1 < flow.main.length ? mainNodeId(i + 1) : END_NODE, kind: "seq" });
    return trans;
  }

  const a = ALT_RE.exec(nodeId);
  if (a) {
    const alt = flow.alternates.find((x) => x.id === a[1]);
    if (!alt) return [{ to: END_NODE, kind: "seq" }];
    const j = Number(a[2]);
    if (j + 1 < alt.steps.length) return [{ to: altNodeId(alt.id, j + 1), kind: "seq" }];
    return [{ to: mainOrEnd(alt.rejoin), kind: "rejoin" }];
  }

  return [];
}

/**
 * The transition an automatic run would take: the first branch whose guard
 * holds, otherwise the sequential/rejoin continuation. Null only at End.
 */
export function autoTransition(transitions: Transition[]): Transition | null {
  const fired = transitions.find((t) => t.kind === "branch" && t.guardValue === true);
  if (fired) return fired;
  return transitions.find((t) => t.kind !== "branch") ?? transitions[transitions.length - 1] ?? null;
}

/**
 * Whether the guards at this fork leave the next step genuinely undecided — a
 * point where auto-play should pause and let the user pick, rather than have
 * `autoTransition` silently choose. A single outgoing edge is never a choice.
 * With a firing guard the branch is forced (unless two guards fire at once);
 * with no branch firing the sequential continue is forced *unless* a branch's
 * guard can't be evaluated (guard-less or unresolved), which reopens the choice.
 */
export function isDecisionPoint(transitions: Transition[]): boolean {
  const branches = transitions.filter((t) => t.kind === "branch");
  if (transitions.length <= 1 || branches.length === 0) return false;
  const firing = branches.filter((t) => t.guardValue === true);
  if (firing.length > 0) return firing.length > 1;
  return branches.some((t) => t.guardValue === undefined);
}

// --- advancing --------------------------------------------------------------

/** Move the token along `t`, applying the destination activity's effects (and
 *  reporting an unmet precondition or a broken effect). Immutable. */
export function advance(project: Project, flow: Flow, state: ExecState, t: Transition): ExecState {
  const notes: string[] = [];
  let valuation = state.valuation;

  const act = activityAt(project, flow, t.to);
  if (act) {
    if (act.pre) {
      const holds = guardHolds(project, act.pre, valuation);
      if (holds === false) notes.push(`Precondition not met at "${act.label}": ${act.pre}`);
    }
    for (const eff of act.effects ?? []) {
      const parsed = analyzeEffect(project, eff);
      if (parsed.ok) valuation = applyAssignment(project, parsed.assign, valuation);
      else notes.push(`Skipped invalid effect: ${eff}`);
    }
  }

  const steps = state.steps + 1;
  let done = t.to === END_NODE;
  if (steps >= MAX_STEPS) {
    done = true;
    notes.push("Stopped: step limit reached (possible loop).");
  }
  return { valuation, nodeId: t.to, done, steps, notes };
}

/** One automatic step: pick the auto transition and advance. No-op at End. */
export function autoStep(project: Project, flow: Flow, state: ExecState): ExecState {
  if (state.done) return state;
  const t = autoTransition(outgoing(project, flow, state));
  if (!t) return { ...state, done: true };
  return advance(project, flow, state, t);
}

// --- display helpers --------------------------------------------------------

export interface VariableRow {
  componentId: string;
  componentTitle: string;
  name: string;
  key: string;
  value: Value;
  type: VarType;
  typeLabel: string;
  /** Prose gloss from the variable, for the runner's table. */
  description?: string;
}

/** Every variable and its current value, grouped for the runner's state panel. */
export function variableRows(project: Project, val: Valuation): VariableRow[] {
  const rows: VariableRow[] = [];
  for (const c of project.components) {
    for (const v of c.variables) {
      const key = valuationKey(c.id, v.name);
      rows.push({
        componentId: c.id,
        componentTitle: c.title,
        name: v.name,
        key,
        value: val.get(key) ?? initialValue(v),
        type: v.type,
        typeLabel: v.type.kind === "enum" ? `enum(${v.type.values.join(" | ")})` : v.type.kind,
        description: v.description,
      });
    }
  }
  return rows;
}
