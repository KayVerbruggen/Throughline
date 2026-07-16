import { describe, expect, it } from "vitest";

import { setStepComponent, setStepInvoke } from "./flowEdit";
import { stepKind } from "./subflow";
import { emptyProject, type Activity, type Component, type Flow, type Project } from "../types";

function component(id: string, activities: Activity[]): Component {
  return { kind: "component", id, title: id, parent: "", uses: [], description: "", activities, variables: [], decisions: [] };
}
function flow(id: string, main: string[], alternates: Flow["alternates"] = []): Flow {
  return { kind: "flow", id, title: id, main, alternates };
}

function project(): Project {
  const p = emptyProject();
  p.components = [
    component("C-001", [{ id: "ACT-001", label: "a" }]),
    component("C-002", [{ id: "ACT-002", label: "b" }]),
  ];
  p.flows = [flow("FL-001", ["ACT-001"]), flow("FL-002", ["ACT-002"])];
  return p;
}

describe("setStepInvoke", () => {
  it("sets a step to hold the invoked flow id", () => {
    const p = project();
    const { flow: f } = setStepInvoke(p, p.flows[0], "main", 0, "FL-002");
    expect(f.main[0]).toBe("FL-002");
    expect(stepKind(f.main[0])).toBe("invoke");
  });

  it("garbage-collects a transient empty-label activity it replaces", () => {
    const p = project();
    // Give C-001 a transient (blank-label) activity used only by FL-001's slot.
    p.components[0].activities.push({ id: "ACT-009", label: "" });
    p.flows[0] = flow("FL-001", ["ACT-009"]);
    const { flow: f, components } = setStepInvoke(p, p.flows[0], "main", 0, "FL-002");
    expect(f.main[0]).toBe("FL-002");
    const c1 = components.find((c) => c.id === "C-001");
    expect(c1?.activities.some((a) => a.id === "ACT-009")).toBe(false);
  });

  it("keeps a named activity it replaces (named activities outlive a flow)", () => {
    const p = project();
    const { components } = setStepInvoke(p, p.flows[0], "main", 0, "FL-002");
    // ACT-001 is named ("a"), so nothing is cleaned up.
    expect(components).toEqual([]);
    expect(p.components[0].activities.some((a) => a.id === "ACT-001")).toBe(true);
  });
});

describe("setStepComponent on an invoke step", () => {
  it("converts a call back into a fresh activity on the chosen component", () => {
    const p = project();
    const invoked = flow("FL-001", ["FL-002"]);
    p.flows[0] = invoked;
    const { flow: f, components } = setStepComponent(p, invoked, "main", 0, "C-002");
    expect(stepKind(f.main[0])).toBe("activity");
    const c2 = components.find((c) => c.id === "C-002");
    expect(c2?.activities.some((a) => a.id === f.main[0] && a.label === "")).toBe(true);
  });
});
