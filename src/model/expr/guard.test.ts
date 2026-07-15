import { describe, expect, it } from "vitest";

import { analyzeGuard, componentHandle } from "./index";
import { emptyProject, type Component, type Project } from "../../types";

/** A single component "Chamber" (handle `chamber`) owning an int and a bool. */
function project(): Project {
  const chamber: Component = {
    kind: "component",
    id: "C-001",
    title: "Chamber",
    parent: "",
    uses: [],
    description: "",
    activities: [],
    variables: [
      { id: "VAR-001", name: "vesselCount", type: { kind: "int" } },
      { id: "VAR-002", name: "open", type: { kind: "bool" } },
    ],
    decisions: [],
  };
  const p = emptyProject();
  p.components = [chamber];
  return p;
}

describe("analyzeGuard type-checks against declared component variables (R-006)", () => {
  it("uses the component's camelCase title handle for references", () => {
    expect(componentHandle("Chamber")).toBe("chamber");
  });

  it("accepts a well-typed guard", () => {
    const r = analyzeGuard(project(), "chamber.vesselCount == 0");
    expect(r.ok).toBe(true);
  });

  it("accepts a boolean reference on its own", () => {
    expect(analyzeGuard(project(), "chamber.open").ok).toBe(true);
  });
});

describe("analyzeGuard reports a message instead of throwing (R-007)", () => {
  it("rejects a reference to an undeclared variable", () => {
    const r = analyzeGuard(project(), "chamber.missing == 0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });

  it("rejects a reference to an unknown component handle", () => {
    const r = analyzeGuard(project(), "reactor.vesselCount == 0");
    expect(r.ok).toBe(false);
  });

  it("rejects a type mismatch (bool compared to int)", () => {
    const r = analyzeGuard(project(), "chamber.open == 5");
    expect(r.ok).toBe(false);
  });

  it("rejects a syntactically broken expression", () => {
    const r = analyzeGuard(project(), "chamber.vesselCount ==");
    expect(r.ok).toBe(false);
  });
});
