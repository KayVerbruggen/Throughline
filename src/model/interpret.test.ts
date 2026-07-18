import { describe, expect, it } from "vitest";

import { valuationKey } from "./expr";
import {
  advance,
  autoStep,
  callStack,
  displayNodeId,
  initExec,
  initialValuation,
  isDecisionPoint,
  outgoing,
  variableRows,
  type ExecState,
  type Transition,
} from "./interpret";
import { emptyProject, type Activity, type Component, type Flow, type Project, type Variable } from "../types";

function component(id: string, title: string, activities: Activity[], variables: Variable[] = []): Component {
  return { kind: "component", id, title, parent: "", uses: [], description: "", activities, variables, decisions: [] };
}
function flow(id: string, main: string[], alternates: Flow["alternates"] = []): Flow {
  return { kind: "flow", id, title: id, main, alternates };
}

/** A chamber that counts vessels; an activity that decrements the count. */
function project(): Project {
  const p = emptyProject();
  p.components = [
    component(
      "C-001",
      "Chamber",
      [
        { id: "ACT-001", label: "Enter chamber", effects: ["chamber.vesselCount := chamber.vesselCount + 1"] },
        { id: "ACT-002", label: "Leave chamber", effects: ["chamber.vesselCount := chamber.vesselCount - 1"] },
        { id: "ACT-003", label: "Report clear" },
      ],
      [{ id: "VAR-001", name: "vesselCount", type: { kind: "int" }, initial: "0" }],
    ),
  ];
  return p;
}

function run(p: Project, f: Flow) {
  let s = initExec(p, f);
  const trail: string[] = [s.nodeId];
  while (!s.done) {
    s = autoStep(p, f, s);
    trail.push(s.nodeId);
  }
  return { state: s, trail };
}

const count = (s: { valuation: Map<string, unknown> }) =>
  s.valuation.get(valuationKey("C-001", "vesselCount"));

describe("flow interpreter", () => {
  it("seeds the initial valuation from Variable.initial", () => {
    const p = project();
    expect(initialValuation(p).get(valuationKey("C-001", "vesselCount"))).toBe(0);
  });

  it("applies effects on arrival, stepping the happy path to End", () => {
    const p = project();
    const f = flow("FL-001", ["ACT-001", "ACT-001", "ACT-002"]); // +1, +1, -1 => 1
    const { state, trail } = run(p, f);
    expect(trail).toEqual(["start", "m0", "m1", "m2", "end"]);
    expect(state.done).toBe(true);
    expect(count(state)).toBe(1);
  });

  it("takes a branch whose guard holds, and skips it when it doesn't", () => {
    // Branch after step 0 when vesselCount != 0; here it's 1 after ACT-001.
    const withBranch = () =>
      flow("FL-001", ["ACT-001", "ACT-003"], [
        { id: "AP-1", condition: "not clear", guard: "chamber.vesselCount != 0", after: 0, rejoin: -1, steps: ["ACT-002"] },
      ]);
    const p = project();

    const fired = run(p, withBranch());
    // ACT-001 sets count to 1, so the guard holds: divert into the alternate,
    // which ends the flow (rejoin -1).
    expect(fired.trail).toEqual(["start", "m0", "AP-1#0", "end"]);
    expect(count(fired.state)).toBe(0); // ACT-002 decremented back to 0

    // Now make the guard false by starting count at -1 so ACT-001 -> 0.
    const p2 = project();
    p2.components[0].variables[0].initial = "-1";
    const notFired = run(p2, withBranch());
    expect(notFired.trail).toEqual(["start", "m0", "m1", "end"]); // stayed on main
  });

  it("offers a guard-less branch as a manual choice but never fires it automatically", () => {
    const p = project();
    const f = flow("FL-001", ["ACT-001", "ACT-003"], [
      { id: "AP-1", condition: "manual only", after: 0, rejoin: -1, steps: ["ACT-002"] },
    ]);
    let s = initExec(p, f);
    s = autoStep(p, f, s); // -> m0
    const outs = outgoing(p, f, s);
    // The branch is listed (for manual choice) with an unknown guard value…
    const branch = outs.find((t) => t.kind === "branch");
    expect(branch?.guardValue).toBeUndefined();
    // …but auto-run stays on the main path.
    s = autoStep(p, f, s);
    expect(s.nodeId).toBe("m1");
    // Manual choice can still take the branch.
    const manual = advance(p, f, initExecAt(p, f, "m0"), branch!);
    expect(manual.nodeId).toBe("AP-1#0");
  });

  it("reports an unmet precondition without blocking the step", () => {
    const p = project();
    p.components[0].activities[2].pre = "chamber.vesselCount == 99"; // never true here
    const f = flow("FL-001", ["ACT-003"]);
    let s = initExec(p, f);
    s = autoStep(p, f, s); // arrive at m0 (ACT-003), pre fails
    expect(s.nodeId).toBe("m0");
    expect(s.notes.some((n) => n.includes("Precondition not met"))).toBe(true);
  });

  it("flags a fork as a decision point only when guards leave it undecided", () => {
    const seq = (): Transition => ({ to: "m1", kind: "seq" });
    const branch = (guardValue?: boolean): Transition => ({ to: "AP-1#0", kind: "branch", guardValue });

    // A single continuation is never a choice.
    expect(isDecisionPoint([seq()])).toBe(false);
    // A firing guard forces the branch — no pause needed.
    expect(isDecisionPoint([branch(true), seq()])).toBe(false);
    // Every branch guard is false — the continue is forced.
    expect(isDecisionPoint([branch(false), seq()])).toBe(false);
    // A guard-less / unresolved branch reopens the choice.
    expect(isDecisionPoint([branch(undefined), seq()])).toBe(true);
    // Two guards firing at once is genuinely ambiguous.
    expect(isDecisionPoint([branch(true), branch(true), seq()])).toBe(true);
  });

  it("lists variable rows with current values", () => {
    const p = project();
    const rows = variableRows(p, initialValuation(p));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ componentTitle: "Chamber", name: "vesselCount", value: 0, typeLabel: "int" });
  });
});

/** Helper: an ExecState parked at a given node with the seeded valuation. */
function initExecAt(p: Project, f: Flow, nodeId: string) {
  return { ...initExec(p, f), nodeId };
}

// ---------------------------------------------------------------------------
// Executable subflow calls
// ---------------------------------------------------------------------------

/** Run to completion, recording every node as `flowId:nodeId` so a trail shows
 *  which flow the token was in, plus every note raised along the way. */
function runDeep(p: Project, f: Flow) {
  let s: ExecState = initExec(p, f);
  const trail: string[] = [`${s.flowId}:${s.nodeId}`];
  const notes: string[] = [];
  const states: ExecState[] = [s];
  while (!s.done) {
    s = autoStep(p, f, s);
    trail.push(`${s.flowId}:${s.nodeId}`);
    notes.push(...s.notes);
    states.push(s);
  }
  return { state: s, trail, notes, states };
}

describe("subflow calls in the interpreter", () => {
  it("descends into a callee and its effects land in the shared valuation", () => {
    const p = project();
    p.flows = [flow("FL-002", ["ACT-001"])]; // callee: +1
    const root = flow("FL-001", ["ACT-001", "FL-002"]); // +1, then call

    const { state, trail } = runDeep(p, root);
    expect(trail).toEqual([
      "FL-001:start",
      "FL-001:m0", // +1
      "FL-001:m1", // parked on the call node
      "FL-002:start", // descended
      "FL-002:m0", // +1 — the *callee's* effect, same valuation
      "FL-002:end",
      "FL-001:m1", // returned to the call node
      "FL-001:end",
    ]);
    expect(state.done).toBe(true);
    expect(state.stack).toEqual([]);
    expect(count(state)).toBe(2); // caller's +1 and callee's +1 both applied
  });

  it("evaluates a guard inside the callee against state the caller wrote", () => {
    const p = project();
    // The callee branches when the chamber isn't empty; only the *caller's*
    // ACT-001 can make that true before the callee is entered.
    p.flows = [
      flow("FL-002", ["ACT-003"], [
        { id: "AP-1", condition: "not clear", guard: "chamber.vesselCount != 0", after: 0, rejoin: -1, steps: ["ACT-002"] },
      ]),
    ];
    const root = flow("FL-001", ["ACT-001", "FL-002"]);

    const { state, trail } = runDeep(p, root);
    expect(trail).toContain("FL-002:AP-1#0"); // the branch fired inside the callee
    expect(count(state)).toBe(0); // +1 from the caller, -1 from the callee's branch

    // With the caller's increment removed the guard is false and the callee
    // stays on its main path.
    const p2 = project();
    p2.flows = p.flows;
    const noBranch = runDeep(p2, flow("FL-001", ["ACT-003", "FL-002"]));
    expect(noBranch.trail).not.toContain("FL-002:AP-1#0");
    expect(count(noBranch.state)).toBe(0);
  });

  it("resumes past the call so the caller's later branches see the callee's writes", () => {
    const p = project();
    p.flows = [flow("FL-002", ["ACT-001"])]; // callee: +1
    // The caller branches *after* the call, on state only the callee sets.
    const root = flow("FL-001", ["FL-002", "ACT-003"], [
      { id: "AP-1", condition: "not clear", guard: "chamber.vesselCount != 0", after: 0, rejoin: -1, steps: ["ACT-002"] },
    ]);

    const { state, trail } = runDeep(p, root);
    expect(trail).toEqual([
      "FL-001:start",
      "FL-001:m0",
      "FL-002:start",
      "FL-002:m0", // callee sets count to 1
      "FL-002:end",
      "FL-001:m0", // back on the call node, call already made
      "FL-001:AP-1#0", // the guard now holds, so the branch fires
      "FL-001:end",
    ]);
    expect(count(state)).toBe(0);
  });

  it("nests calls, unwinding the stack in order", () => {
    const p = project();
    p.flows = [flow("FL-002", ["FL-003"]), flow("FL-003", ["ACT-001"])];
    const root = flow("FL-001", ["FL-002"]);

    const { state, trail, states } = runDeep(p, root);
    expect(trail).toEqual([
      "FL-001:start",
      "FL-001:m0",
      "FL-002:start",
      "FL-002:m0",
      "FL-003:start",
      "FL-003:m0", // +1, two calls deep
      "FL-003:end",
      "FL-002:m0", // returned into FL-002
      "FL-002:end",
      "FL-001:m0", // returned into FL-001
      "FL-001:end",
    ]);
    expect(count(state)).toBe(1);

    // At the deepest point the stack names both suspended callers, and the root
    // diagram still highlights the outermost call node.
    const deepest = states.find((s) => s.flowId === "FL-003" && s.nodeId === "m0")!;
    expect(callStack(deepest)).toEqual(["FL-001", "FL-002", "FL-003"]);
    expect(displayNodeId(deepest)).toBe("m0"); // FL-001's call node
  });

  it("terminates a recursive call at the depth limit instead of hanging", () => {
    const p = project();
    const root = flow("FL-001", ["ACT-001", "FL-001"]); // calls itself
    p.flows = [root];

    const { state, notes } = runDeep(p, root);
    expect(state.done).toBe(true);
    expect(state.stack).toEqual([]); // fully unwound
    expect(notes.some((n) => n.includes("call depth limit"))).toBe(true);
    // Stopped by the depth cap, not the blunt step cap.
    expect(notes.some((n) => n.includes("step limit"))).toBe(false);
  });

  it("leaves an invoke with no resolvable target as an opaque pass-through", () => {
    const p = project();
    p.flows = []; // FL-404 doesn't exist
    const { state, trail } = runDeep(p, flow("FL-001", ["ACT-001", "FL-404"]));
    expect(trail).toEqual(["FL-001:start", "FL-001:m0", "FL-001:m1", "FL-001:end"]);
    expect(count(state)).toBe(1);
  });

  it("offers the call as the only transition, then the ordinary ones after it", () => {
    const p = project();
    p.flows = [flow("FL-002", ["ACT-001"])];
    const root = flow("FL-001", ["FL-002", "ACT-003"]);

    let s = initExec(p, root);
    s = autoStep(p, root, s); // -> m0, the call node
    const atCall = outgoing(p, root, s);
    expect(atCall).toHaveLength(1);
    expect(atCall[0]).toMatchObject({ kind: "call", to: "start", toFlowId: "FL-002" });
    // A lone call is never a fork the user must resolve.
    expect(isDecisionPoint(atCall)).toBe(false);

    // Once returned, the same node offers its normal continuation instead.
    const returned = { ...s, returned: true };
    expect(outgoing(p, root, returned)).toEqual([{ to: "m1", kind: "seq" }]);
  });
});
