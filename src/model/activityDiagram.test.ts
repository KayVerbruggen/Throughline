import { describe, expect, it } from "vitest";

import { deriveActivityDiagram } from "./activityDiagram";
import { emptyProject, type Activity, type Component, type Flow, type Project } from "../types";

function component(id: string, activities: Activity[]): Component {
  return { kind: "component", id, title: id, parent: "", uses: [], description: "", activities, variables: [], decisions: [] };
}
function flow(id: string, main: string[], alternates: Flow["alternates"] = []): Flow {
  return { kind: "flow", id, title: id, main, alternates };
}

/** Two components, a 3-step happy path C-001 → C-002 → C-001. */
function project(): Project {
  const p = emptyProject();
  p.components = [
    component("C-001", [
      { id: "ACT-001", label: "a" },
      { id: "ACT-003", label: "c" },
    ]),
    component("C-002", [{ id: "ACT-002", label: "b" }]),
  ];
  p.flows = [flow("FL-001", ["ACT-001", "ACT-002", "ACT-003"])];
  return p;
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const edge = (c: ReturnType<typeof deriveActivityDiagram>, from: string, to: string) =>
  c.edges.find((e) => e.from === from && e.to === to);

describe("subflow invoke nodes", () => {
  it("renders an invoke step as a single 'invoke' node labelled with the called use case", () => {
    const p = project();
    p.useCases = [
      {
        kind: "use-case",
        id: "UC-9",
        title: "Fill the chamber",
        status: "draft",
        moscow: "must",
        trace: [],
        actors: [],
        stories: [],
        preconditions: [],
        flow: "FL-002",
      },
    ];
    p.flows.push(flow("FL-002", ["ACT-002"]));
    // Caller: activity, then a call into FL-002, then activity.
    const caller = flow("FL-003", ["ACT-001", "FL-002", "ACT-003"]);
    p.flows.push(caller);

    const chart = deriveActivityDiagram(p, caller);
    const node = chart.byId.get("m1");
    expect(node?.kind).toBe("invoke");
    expect(node?.label).toBe("Fill the chamber");
    expect(node?.invokeFlowId).toBe("FL-002");
    expect(node?.activityId).toBeUndefined();
    // Still framed and sequenced like any other step.
    expect(edge(chart, "m0", "m1")?.kind).toBe("seq");
    expect(edge(chart, "m1", "m2")?.kind).toBe("seq");
  });
});

describe("activity-diagram derivation", () => {
  it("frames the main path with Start and End nodes", () => {
    const chart = deriveActivityDiagram(project(), project().flows[0]);
    expect(chart.empty).toBe(false);
    expect(ids(chart.nodes)).toEqual(["start", "m0", "m1", "m2", "end"]);
    // Sequential spine, in order.
    expect(edge(chart, "start", "m0")?.kind).toBe("seq");
    expect(edge(chart, "m0", "m1")?.kind).toBe("seq");
    expect(edge(chart, "m1", "m2")?.kind).toBe("seq");
    expect(edge(chart, "m2", "end")?.kind).toBe("seq");
  });

  it("carries the guard as the branch-edge label, and marks it formal", () => {
    const p = project();
    p.flows = [
      flow("FL-001", ["ACT-001", "ACT-002", "ACT-003"], [
        {
          id: "AP-1",
          condition: "the chamber is not clear",
          guard: "c001.count != 0",
          after: 0,
          rejoin: 2,
          steps: ["ACT-002"],
        },
      ]),
    ];
    p.components[0].variables = [{ id: "VAR-001", name: "count", type: { kind: "int" } }];

    const chart = deriveActivityDiagram(p, p.flows[0]);
    // Branch edge from the after-step into the alternate's first step.
    const branch = edge(chart, "m0", "AP-1#0");
    expect(branch?.kind).toBe("branch");
    expect(branch?.label).toBe("c001.count != 0");
    expect(branch?.formal).toBe(true);
    // The alternate step exists as its own node and rejoins the main flow.
    expect(chart.byId.has("AP-1#0")).toBe(true);
    expect(edge(chart, "AP-1#0", "m2")?.kind).toBe("rejoin");
  });

  it("falls back to the prose condition when no guard is present (formal=false)", () => {
    const p = project();
    p.flows = [
      flow("FL-001", ["ACT-001", "ACT-002"], [
        { id: "AP-1", condition: "the card is not recognised", after: 0, rejoin: -1, steps: [] },
      ]),
    ];
    const chart = deriveActivityDiagram(p, p.flows[0]);
    // A step-less, guard-less branch is a single labelled edge to End.
    const branch = edge(chart, "m0", "end");
    expect(branch?.kind).toBe("branch");
    expect(branch?.label).toBe("the card is not recognised");
    expect(branch?.formal).toBe(false);
  });

  it("marks a rejoin to an earlier step as a back edge", () => {
    const p = project();
    p.flows = [
      flow("FL-001", ["ACT-001", "ACT-002", "ACT-003"], [
        { id: "AP-1", condition: "retry", after: 2, rejoin: 0, steps: [] },
      ]),
    ];
    const chart = deriveActivityDiagram(p, p.flows[0]);
    expect(edge(chart, "m2", "m0")?.back).toBe(true);
  });

  it("skips alternates whose branch point is out of range", () => {
    const p = project();
    p.flows = [
      flow("FL-001", ["ACT-001"], [
        { id: "AP-1", condition: "orphan", after: 5, rejoin: -1, steps: ["ACT-002"] },
      ]),
    ];
    const chart = deriveActivityDiagram(p, p.flows[0]);
    expect(chart.byId.has("AP-1#0")).toBe(false);
    expect(ids(chart.nodes)).toEqual(["start", "m0", "end"]);
  });

  it("reports an empty flow", () => {
    const p = project();
    p.flows = [flow("FL-001", [])];
    const chart = deriveActivityDiagram(p, p.flows[0]);
    expect(chart.empty).toBe(true);
    expect(chart.nodes).toEqual([]);
  });

  it("packs non-overlapping alternates into the same lane", () => {
    const p = project();
    p.components[1].activities.push({ id: "ACT-004", label: "d" });
    p.flows = [
      flow("FL-001", ["ACT-001", "ACT-002", "ACT-003"], [
        { id: "AP-1", condition: "one", after: 0, rejoin: 1, steps: ["ACT-002"] },
        { id: "AP-2", condition: "two", after: 2, rejoin: -1, steps: ["ACT-004"] },
      ]),
    ];
    const chart = deriveActivityDiagram(p, p.flows[0]);
    // Both alternates are vertically disjoint, so both take lane 1.
    expect(chart.byId.get("AP-1#0")?.lane).toBe(1);
    expect(chart.byId.get("AP-2#0")?.lane).toBe(1);
  });
});
