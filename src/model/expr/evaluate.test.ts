import { describe, expect, it } from "vitest";

import { parse, parseAssignment } from "./parse";
import { applyAssignment, evaluate, valuationKey, type Valuation } from "./evaluate";
import { emptyProject, type Component, type Project, type Variable } from "../../types";

function component(id: string, title: string, variables: Variable[]): Component {
  return { kind: "component", id, title, parent: "", description: "", activities: [], variables, decisions: [] };
}

/** A "Chamber" component with an int count and an enum gate. */
function project(): Project {
  const p = emptyProject();
  p.components = [
    component("C-001", "Chamber", [
      { id: "VAR-001", name: "vesselCount", type: { kind: "int" } },
      { id: "VAR-002", name: "gate", type: { kind: "enum", values: ["open", "closed"] } },
    ]),
  ];
  return p;
}

function val(entries: Record<string, number | string | boolean>): Valuation {
  const m: Valuation = new Map();
  // Keys here are already canonical `C-001.name`.
  for (const [k, v] of Object.entries(entries)) m.set(k, v);
  return m;
}

const ev = (src: string, v: Valuation) => evaluate(project(), parse(src), v);

describe("expression evaluation", () => {
  it("reads int and enum references from the valuation", () => {
    const v = val({ [valuationKey("C-001", "vesselCount")]: 2, [valuationKey("C-001", "gate")]: "open" });
    expect(ev("chamber.vesselCount", v)).toBe(2);
    expect(ev("chamber.gate", v)).toBe("open");
  });

  it("evaluates comparisons and boolean logic", () => {
    const v = val({ [valuationKey("C-001", "vesselCount")]: 0, [valuationKey("C-001", "gate")]: "closed" });
    expect(ev("chamber.vesselCount == 0", v)).toBe(true);
    expect(ev("chamber.vesselCount != 0", v)).toBe(false);
    expect(ev("chamber.gate == closed", v)).toBe(true);
    expect(ev("chamber.gate == open", v)).toBe(false);
    expect(ev("chamber.vesselCount == 0 && chamber.gate == closed", v)).toBe(true);
    expect(ev("!(chamber.vesselCount > 0)", v)).toBe(true);
  });

  it("evaluates integer arithmetic with truncating division", () => {
    const v = val({ [valuationKey("C-001", "vesselCount")]: 7 });
    expect(ev("chamber.vesselCount - 1", v)).toBe(6);
    expect(ev("chamber.vesselCount / 2", v)).toBe(3); // trunc(3.5)
    expect(ev("chamber.vesselCount / 0", v)).toBe(0); // no NaN
  });

  it("applies an assignment immutably, leaving the source valuation untouched", () => {
    const v = val({ [valuationKey("C-001", "vesselCount")]: 2, [valuationKey("C-001", "gate")]: "closed" });
    const next = applyAssignment(project(), parseAssignment("chamber.vesselCount := chamber.vesselCount - 1"), v);
    expect(next.get(valuationKey("C-001", "vesselCount"))).toBe(1);
    expect(v.get(valuationKey("C-001", "vesselCount"))).toBe(2); // original unchanged
  });

  it("assigns a bare enum member", () => {
    const v = val({ [valuationKey("C-001", "gate")]: "closed" });
    const next = applyAssignment(project(), parseAssignment("chamber.gate := open"), v);
    expect(next.get(valuationKey("C-001", "gate"))).toBe("open");
  });

  it("throws on a reference with no value in the valuation", () => {
    expect(() => ev("chamber.vesselCount == 0", val({}))).toThrow();
  });
});
