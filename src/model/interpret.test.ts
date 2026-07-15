import { describe, expect, it } from "vitest";

import { valuationKey } from "./expr";
import {
  advance,
  autoStep,
  initExec,
  initialValuation,
  isDecisionPoint,
  outgoing,
  variableRows,
  type Transition,
} from "./interpret";
import { emptyProject, type Activity, type Component, type Flow, type Project, type Variable } from "../types";

function component(id: string, title: string, activities: Activity[], variables: Variable[] = []): Component {
  return { kind: "component", id, title, parent: "", description: "", activities, variables, decisions: [] };
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
