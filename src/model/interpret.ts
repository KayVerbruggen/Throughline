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
//
// Subflow calls are *executed*, not stepped over. Arriving at an invoke step
// parks the token on the call node; the next advance pushes a `CallFrame` and
// drops the token at the callee's Start. The callee runs as an ordinary flow —
// its guards and effects read and write the *same* valuation — and when its
// token reaches End the frame pops, returning to the caller's call node with
// `returned` set so the next advance continues past it instead of re-entering.
//
// There is deliberately no variable scoping: variables belong to *components*
// (`C-id.name`), not to flows, so a call has nothing of its own to scope. A
// callee mutating `chamber.vesselCount` is the same state the caller reads, which
// is exactly the point — composing flows composes one system state.
//
// Recursion terminates two ways: `MAX_DEPTH` refuses to enter a call nested too
// deep (the step degrades to the old pass-through, with a note), and `MAX_STEPS`
// still caps total advances.
// ---------------------------------------------------------------------------

import { findActivity } from "./behavior";
import { invokedFlow, stepKind } from "./subflow";
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
/** How deep subflow calls may nest before an invoke degrades to a pass-through.
 *  Bounds mutual/self recursion without capping legitimate composition. */
const MAX_DEPTH = 12;

/** A caller suspended at its invoke step while the callee runs. */
export interface CallFrame {
  /** The flow that made the call. */
  flowId: string;
  /** The invoke node in that flow to resume at when the callee returns. */
  nodeId: string;
}

export interface ExecState {
  valuation: Valuation;
  /** Current diagram node: START_NODE | mainNodeId(i) | altNodeId(key,j) | END_NODE.
   *  Interpreted *within the current flow* (`flowId`), not necessarily the root. */
  nodeId: string;
  /** The flow the token is executing in — the root flow, or a callee. */
  flowId: string;
  /** Suspended callers, outermost first; empty while in the root flow. */
  stack: CallFrame[];
  /** True when the token sits on an invoke node whose callee has already run, so
   *  the next advance continues past the call instead of re-entering it. */
  returned: boolean;
  done: boolean;
  /** Advances taken so far (for the runaway guard). */
  steps: number;
  /** Non-fatal issues from the last advance (precondition unmet, bad effect). */
  notes: string[];
}

/** A transition is a diagram edge, or a move across a call boundary that no
 *  single flow's diagram draws: `call` descends into a callee, `return` pops
 *  back to the caller's invoke node. */
export type TransitionKind = DiagramEdgeKind | "call" | "return";

export interface Transition {
  to: string;
  kind: TransitionKind;
  /** The flow `to` names, when the transition crosses a call boundary
   *  (`call`/`return`). Undefined for an ordinary within-flow edge. */
  toFlowId?: string;
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

/** Fresh execution at Start of `flow`, optionally overlaying canonical-keyed
 *  overrides. `flow` is the *root* — calls descend from here. */
export function initExec(project: Project, flow: Flow, overrides?: Valuation): ExecState {
  const valuation = initialValuation(project);
  if (overrides) for (const [k, v] of overrides) valuation.set(k, v);
  return {
    valuation,
    nodeId: START_NODE,
    flowId: flow.id,
    stack: [],
    returned: false,
    done: false,
    steps: 0,
    notes: [],
  };
}

// --- current flow -----------------------------------------------------------

/**
 * The flow the token is executing in. Every public entry point takes the *root*
 * flow (what the view is showing); once the token has descended into a call the
 * state's `flowId` names the real one. Falls back to the root if the callee has
 * since been deleted mid-run.
 */
export function currentFlow(project: Project, root: Flow, state: ExecState): Flow {
  if (state.flowId === root.id) return root;
  return project.flows.find((f) => f.id === state.flowId) ?? root;
}

/** The flow ids on the stack, outermost first, ending with the current one —
 *  the runner's "you are here" breadcrumb. */
export function callStack(state: ExecState): string[] {
  return [...state.stack.map((f) => f.flowId), state.flowId];
}

/** The node to highlight in the *root* flow's diagram. Inside a call that's the
 *  outermost invoke node (the token is somewhere beneath it); otherwise the
 *  token's own node. */
export function displayNodeId(state: ExecState): string {
  return state.stack.length > 0 ? state.stack[0].nodeId : state.nodeId;
}

// --- node ↔ step / activity -------------------------------------------------

const MAIN_RE = /^m(\d+)$/;
const ALT_RE = /^(.+)#(\d+)$/;

/** The raw step id a node occupies (an activity id, a flow id for an invoke, or
 *  "" for an empty slot); null for Start / End / a dangling id. */
function stepIdAt(flow: Flow, nodeId: string): string | null {
  const m = MAIN_RE.exec(nodeId);
  if (m) return flow.main[Number(m[1])] ?? null;
  const a = ALT_RE.exec(nodeId);
  if (a) {
    const alt = flow.alternates.find((x) => x.id === a[1]);
    return alt?.steps[Number(a[2])] ?? null;
  }
  return null;
}

/** The activity a node runs, or null for Start / End / an invoke / a dangling id. */
function activityAt(project: Project, flow: Flow, nodeId: string): Activity | null {
  const id = stepIdAt(flow, nodeId);
  if (!id || stepKind(id) !== "activity") return null;
  return findActivity(project, id);
}

/** The flow an un-returned invoke node is about to call, or null when the node
 *  isn't a pending call (not an invoke, already returned, or a dangling target). */
function pendingCall(project: Project, flow: Flow, state: ExecState): Flow | null {
  if (state.returned) return null;
  const id = stepIdAt(flow, state.nodeId);
  if (!id || stepKind(id) !== "invoke") return null;
  return invokedFlow(project, id);
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
export function outgoing(project: Project, root: Flow, state: ExecState): Transition[] {
  const { nodeId } = state;
  if (state.done) return [];

  const flow = currentFlow(project, root, state);

  // End of a callee: pop back to the caller's invoke node. (At the root's End
  // there is nowhere to go — the run is over.)
  if (nodeId === END_NODE) {
    const frame = state.stack[state.stack.length - 1];
    if (!frame) return [];
    return [{ to: frame.nodeId, kind: "return", toFlowId: frame.flowId }];
  }

  // A pending subflow call takes precedence over the step's ordinary
  // continuation: descend into the callee's Start. Refused past MAX_DEPTH, and
  // for a dangling target, in which case the step falls through to the old
  // opaque pass-through below.
  const callee = pendingCall(project, flow, state);
  if (callee && state.stack.length < MAX_DEPTH) {
    return [{ to: START_NODE, kind: "call", toFlowId: callee.id, label: callee.title || callee.id }];
  }

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

/**
 * Move the token along `t`, applying the destination activity's effects (and
 * reporting an unmet precondition or a broken effect). A `call` pushes the
 * current node as a frame; a `return` pops one and lands `returned` so the
 * caller's next advance continues past the call. Immutable.
 */
export function advance(project: Project, root: Flow, state: ExecState, t: Transition): ExecState {
  const notes: string[] = [];
  let valuation = state.valuation;

  const flow = currentFlow(project, root, state);

  // --- call boundary --------------------------------------------------------
  let stack = state.stack;
  let flowId = state.flowId;
  let returned = false;

  if (t.kind === "call") {
    stack = [...stack, { flowId: state.flowId, nodeId: state.nodeId }];
    flowId = t.toFlowId ?? state.flowId;
  } else if (t.kind === "return") {
    stack = stack.slice(0, -1);
    flowId = t.toFlowId ?? state.flowId;
    returned = true;
  } else if (pendingCall(project, flow, state) && state.stack.length >= MAX_DEPTH) {
    // `outgoing` refused to enter — record why rather than silently skipping.
    notes.push(`Did not enter subflow at depth ${state.stack.length}: call depth limit reached.`);
  }

  // Effects apply in the flow the destination node belongs to, which is the
  // callee on a call and the caller on a return.
  const destFlow = currentFlow(project, root, { ...state, flowId });
  const act = activityAt(project, destFlow, t.to);
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
  // Reaching End inside a callee isn't the end of the run — the next advance
  // returns to the caller. Only the root flow's End finishes.
  let done = t.to === END_NODE && stack.length === 0;
  if (steps >= MAX_STEPS) {
    done = true;
    notes.push("Stopped: step limit reached (possible loop).");
  }
  return { valuation, nodeId: t.to, flowId, stack, returned, done, steps, notes };
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
