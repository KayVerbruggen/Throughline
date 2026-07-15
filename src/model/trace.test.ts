import { describe, expect, it } from "vitest";

import {
  chainOf,
  needWarning,
  requirementWarning,
  requirementsForUseCase,
  testWarning,
  testsForRequirement,
  traceEdges,
  useCasesForNeed,
} from "./trace";
import { emptyProject, type Need, type Project, type Requirement, type Test, type UseCase } from "../types";

function need(id: string, extra: Partial<Need> = {}): Need {
  return { kind: "need", id, title: id, status: "approved", moscow: "must", stakeholder: "", tags: [], body: "", ...extra };
}
function useCase(id: string, trace: string[]): UseCase {
  return { kind: "use-case", id, title: id, status: "approved", moscow: "must", trace, actors: [], stories: [], preconditions: [], flow: "" };
}
function requirement(id: string, trace: string[]): Requirement {
  return {
    kind: "requirement", id, title: id, status: "approved", moscow: "must", trace,
    format: "EARS", ears: "ubiquitous", condition: "", subject: "system", action: "act", object: "", constraint: "",
  };
}
function test(id: string, trace: string[]): Test {
  return { kind: "test", id, title: id, trace, file: "", result: "pass", body: "" };
}

/** N-001 → UC-001 → R-001 → T-001, a full one-per-level spine. */
function spine(): Project {
  const p = emptyProject();
  p.needs = [need("N-001")];
  p.useCases = [useCase("UC-001", ["N-001"])];
  p.requirements = [requirement("R-001", ["UC-001"])];
  p.tests = [test("T-001", ["R-001"])];
  return p;
}

describe("reverse lookups are computed from forward trace (R-002)", () => {
  it("follows child→parent links in reverse", () => {
    const p = spine();
    expect(useCasesForNeed(p, "N-001").map((u) => u.id)).toEqual(["UC-001"]);
    expect(requirementsForUseCase(p, "UC-001").map((r) => r.id)).toEqual(["R-001"]);
    expect(testsForRequirement(p, "R-001").map((t) => t.id)).toEqual(["T-001"]);
  });

  it("returns nothing for an id no one traces to", () => {
    const p = spine();
    expect(testsForRequirement(p, "R-999")).toEqual([]);
    expect(useCasesForNeed(p, "N-999")).toEqual([]);
  });
});

describe("chainOf walks the whole spine in both directions", () => {
  it("from a need reaches its tests", () => {
    const chain = chainOf(spine(), "N-001");
    expect([...chain].sort()).toEqual(["N-001", "R-001", "T-001", "UC-001"]);
  });

  it("from a test reaches its needs", () => {
    const chain = chainOf(spine(), "T-001");
    expect([...chain].sort()).toEqual(["N-001", "R-001", "T-001", "UC-001"]);
  });

  it("does not cross into an unrelated chain", () => {
    const p = spine();
    p.needs.push(need("N-002"));
    p.tests.push(test("T-002", ["R-002"]));
    p.requirements.push(requirement("R-002", ["UC-002"]));
    p.useCases.push(useCase("UC-002", ["N-002"]));
    const chain = chainOf(p, "N-001");
    expect(chain.has("N-002")).toBe(false);
    expect(chain.has("T-002")).toBe(false);
  });
});

describe("traceEdges collapses hidden columns into indirect links", () => {
  const key = (p: { from: string; to: string }) => `${p.from}->${p.to}`;
  const ALL = new Set(["need", "use-case", "requirement", "test"]);

  it("returns only direct edges when every column is visible", () => {
    const es = traceEdges(spine(), ALL);
    expect(es.every((e) => !e.indirect)).toBe(true);
    expect(es.map(key).sort()).toEqual(["N-001->UC-001", "R-001->T-001", "UC-001->R-001"]);
  });

  it("bridges a single hidden column with a dotted (indirect) edge", () => {
    // Hide use cases: N-001 → R-001 becomes indirect, R-001 → T-001 stays direct.
    const es = traceEdges(spine(), new Set(["need", "requirement", "test"]));
    const byKey = Object.fromEntries(es.map((e) => [key(e), e.indirect]));
    expect(byKey).toEqual({ "N-001->R-001": true, "R-001->T-001": false });
  });

  it("bridges multiple consecutive hidden columns", () => {
    // Hide both use cases and requirements: N-001 → T-001 across two hidden spans.
    const es = traceEdges(spine(), new Set(["need", "test"]));
    expect(es).toEqual([{ from: "N-001", to: "T-001", indirect: true }]);
  });

  it("emits one indirect edge when two hidden paths reach the same node", () => {
    const p = emptyProject();
    p.needs = [need("N-001")];
    p.useCases = [useCase("UC-001", ["N-001"]), useCase("UC-002", ["N-001"])];
    p.requirements = [requirement("R-001", ["UC-001", "UC-002"])];
    const es = traceEdges(p, new Set(["need", "requirement"]));
    expect(es).toEqual([{ from: "N-001", to: "R-001", indirect: true }]);
  });
});

describe("consistency warnings", () => {
  it("flags a need no use case covers", () => {
    const p = emptyProject();
    p.needs = [need("N-001")];
    expect(needWarning(p, p.needs[0])?.message).toMatch(/not covered/i);
  });

  it("flags a requirement that traces to no use case", () => {
    expect(requirementWarning(requirement("R-001", []))?.message).toMatch(/orphan/i);
    expect(requirementWarning(requirement("R-001", ["UC-001"]))).toBeNull();
  });

  it("flags a test that verifies no requirement", () => {
    expect(testWarning(test("T-001", []))?.message).toMatch(/no requirement/i);
    expect(testWarning(test("T-001", ["R-001"]))).toBeNull();
  });
});
