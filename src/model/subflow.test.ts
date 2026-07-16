import { describe, expect, it } from "vitest";

import {
  entryActivities,
  exitActivities,
  flowsInCycle,
  invocationTargets,
  invokedFlow,
  stepKind,
} from "./subflow";
import { emptyProject, type Flow, type Project } from "../types";

function flow(id: string, main: string[], alternates: Flow["alternates"] = []): Flow {
  return { kind: "flow", id, title: id, main, alternates };
}

describe("step classification", () => {
  it("discriminates empty / activity / invoke by id prefix", () => {
    expect(stepKind("")).toBe("empty");
    expect(stepKind("ACT-001")).toBe("activity");
    expect(stepKind("FL-002")).toBe("invoke");
  });

  it("resolves an invoke step to its target flow, or null", () => {
    const p = emptyProject();
    p.flows = [flow("FL-002", ["ACT-001"])];
    expect(invokedFlow(p, "FL-002")?.id).toBe("FL-002");
    expect(invokedFlow(p, "ACT-001")).toBeNull(); // not an invoke
    expect(invokedFlow(p, "FL-404")).toBeNull(); // unknown flow
  });
});

describe("boundary activities", () => {
  function proj(): Project {
    const p = emptyProject();
    p.flows = [
      flow("FL-001", ["ACT-001", "ACT-002"]),
      // FL-002 starts by invoking FL-001, then runs ACT-009 → entry resolves
      // through the invoke to ACT-001; exit is ACT-009.
      flow("FL-002", ["FL-001", "ACT-009"]),
    ];
    return p;
  }

  it("returns the first/last main activity", () => {
    expect(entryActivities(proj(), "FL-001")).toEqual(["ACT-001"]);
    expect(exitActivities(proj(), "FL-001")).toEqual(["ACT-002"]);
  });

  it("resolves through a leading invoke", () => {
    expect(entryActivities(proj(), "FL-002")).toEqual(["ACT-001"]);
    expect(exitActivities(proj(), "FL-002")).toEqual(["ACT-009"]);
  });

  it("skips empty slots to the first/last filled step", () => {
    const p = emptyProject();
    p.flows = [flow("FL-001", ["", "ACT-001", ""])];
    expect(entryActivities(p, "FL-001")).toEqual(["ACT-001"]);
    expect(exitActivities(p, "FL-001")).toEqual(["ACT-001"]);
  });

  it("stops (empty) at a self-invoking cycle instead of recursing forever", () => {
    const p = emptyProject();
    p.flows = [flow("FL-001", ["FL-001"])];
    expect(entryActivities(p, "FL-001")).toEqual([]);
    expect(exitActivities(p, "FL-001")).toEqual([]);
  });
});

describe("invocation graph and cycles", () => {
  it("lists a flow's distinct invoke targets across main and alternates", () => {
    const f = flow("FL-001", ["ACT-001", "FL-002"], [
      { id: "AP-1", condition: "x", after: 0, rejoin: -1, steps: ["FL-003", "FL-002"] },
    ]);
    expect(invocationTargets(f).sort()).toEqual(["FL-002", "FL-003"]);
  });

  it("finds direct self-invocation", () => {
    const p = emptyProject();
    p.flows = [flow("FL-001", ["FL-001"])];
    expect(flowsInCycle(p)).toEqual(new Set(["FL-001"]));
  });

  it("finds a mutual A↔B cycle and excludes acyclic callers", () => {
    const p = emptyProject();
    p.flows = [
      flow("FL-001", ["FL-002"]),
      flow("FL-002", ["FL-001"]),
      flow("FL-003", ["FL-001"]), // calls into the cycle but isn't on it
    ];
    const cyc = flowsInCycle(p);
    expect(cyc.has("FL-001")).toBe(true);
    expect(cyc.has("FL-002")).toBe(true);
    expect(cyc.has("FL-003")).toBe(false);
  });

  it("reports no cycle for a plain acyclic call chain", () => {
    const p = emptyProject();
    p.flows = [flow("FL-001", ["FL-002"]), flow("FL-002", ["ACT-001"])];
    expect(flowsInCycle(p).size).toBe(0);
  });
});
