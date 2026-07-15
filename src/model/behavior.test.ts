import { describe, expect, it } from "vitest";

import { activityAdjacencies, staticEdges, structureEdges } from "./behavior";
import { emptyProject, type Activity, type Component, type Flow, type Project } from "../types";

function component(id: string, activities: Activity[], uses: string[] = []): Component {
  return { kind: "component", id, title: id, parent: "", uses, description: "", activities, variables: [], decisions: [] };
}
function flow(id: string, main: string[], alternates: Flow["alternates"] = []): Flow {
  return { kind: "flow", id, title: id, main, alternates };
}

/** Three components; a flow chaining C-001 → C-002 → C-002 → C-003. */
function project(): Project {
  const p = emptyProject();
  p.components = [
    component("C-001", [{ id: "ACT-001", label: "a" }]),
    component("C-002", [
      { id: "ACT-002", label: "b" },
      { id: "ACT-003", label: "c" },
    ]),
    component("C-003", [{ id: "ACT-004", label: "d" }]),
  ];
  p.flows = [flow("FL-001", ["ACT-001", "ACT-002", "ACT-003", "ACT-004"])];
  return p;
}

const key = (e: { a: string; b: string }) => `${e.a}|${e.b}`;

describe("structure connections are derived from flow adjacency (R-004)", () => {
  it("connects components whose activities run back-to-back", () => {
    const edges = structureEdges(project());
    // ACT-002→ACT-003 is within C-002, so no self-edge; the rest connect.
    expect(edges.map(key).sort()).toEqual(["C-001|C-002", "C-002|C-003"]);
  });

  it("orders each pair canonically (a < b) regardless of flow direction", () => {
    const p = emptyProject();
    p.components = [
      component("C-002", [{ id: "ACT-001", label: "a" }]),
      component("C-001", [{ id: "ACT-002", label: "b" }]),
    ];
    // Flow goes C-002 → C-001, but the edge is stored C-001|C-002.
    p.flows = [flow("FL-001", ["ACT-001", "ACT-002"])];
    const [edge] = structureEdges(p);
    expect(edge.a).toBe("C-001");
    expect(edge.b).toBe("C-002");
  });

  it("records which flows produced each edge, deduped", () => {
    const p = project();
    p.flows.push(flow("FL-002", ["ACT-001", "ACT-002"])); // also produces C-001|C-002
    const edge = structureEdges(p).find((e) => key(e) === "C-001|C-002");
    expect(edge?.flows.sort()).toEqual(["FL-001", "FL-002"]);
  });

  it("includes alternate-path entry, internal, and rejoin adjacencies", () => {
    const pairs = activityAdjacencies(
      flow("FL-001", ["ACT-001", "ACT-002", "ACT-003"], [
        { id: "AP-1", condition: "x", after: 0, rejoin: 2, steps: ["ACT-009"] },
      ]),
    );
    // main: 001→002, 002→003; alt: entry 001→009, rejoin 009→003.
    expect(pairs).toContainEqual(["ACT-001", "ACT-009"]);
    expect(pairs).toContainEqual(["ACT-009", "ACT-003"]);
  });
});

describe("static dependency edges are authored and directed", () => {
  const usesKey = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

  it("emits one directed edge per Component.uses entry", () => {
    const p = emptyProject();
    p.components = [
      component("C-001", [], ["C-002", "C-003"]),
      component("C-002", []),
      component("C-003", []),
    ];
    expect(staticEdges(p).map(usesKey).sort()).toEqual(["C-001->C-002", "C-001->C-003"]);
  });

  it("keeps direction (from → to is not symmetric)", () => {
    const p = emptyProject();
    p.components = [component("C-001", [], ["C-002"]), component("C-002", [])];
    const [edge] = staticEdges(p);
    expect(edge).toEqual({ from: "C-001", to: "C-002" });
  });

  it("drops self-references and dangling ids, and dedupes", () => {
    const p = emptyProject();
    p.components = [
      component("C-001", [], ["C-001", "C-404", "C-002", "C-002"]),
      component("C-002", []),
    ];
    expect(staticEdges(p).map(usesKey)).toEqual(["C-001->C-002"]);
  });
});
