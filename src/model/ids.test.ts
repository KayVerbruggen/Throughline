import { describe, expect, it } from "vitest";

import { nextId } from "./ids";
import { emptyProject, type Test } from "../types";

function test(id: string): Test {
  return { kind: "test", id, title: id, trace: [], file: "", result: "unknown", body: "" };
}

describe("nextId assigns unique, zero-padded, kind-prefixed ids (R-011)", () => {
  it("uses the kind's prefix and starts at 001 when empty", () => {
    const p = emptyProject();
    expect(nextId(p, "test")).toBe("T-001");
    expect(nextId(p, "need")).toBe("N-001");
    expect(nextId(p, "use-case")).toBe("UC-001");
    expect(nextId(p, "requirement")).toBe("R-001");
  });

  it("returns one past the highest existing number for that kind", () => {
    const p = emptyProject();
    p.tests = [test("T-001"), test("T-004"), test("T-002")];
    expect(nextId(p, "test")).toBe("T-005");
  });

  it("zero-pads to three digits", () => {
    const p = emptyProject();
    p.tests = [test("T-009")];
    expect(nextId(p, "test")).toBe("T-010");
  });

  it("counts only ids of the requested kind", () => {
    const p = emptyProject();
    p.tests = [test("T-050")];
    // Needs are empty, so the next need id is unaffected by T-050.
    expect(nextId(p, "need")).toBe("N-001");
  });
});
