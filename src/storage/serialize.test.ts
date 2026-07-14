import { describe, expect, it } from "vitest";

import { parseArtifact, serializeArtifact } from "./serialize";
import type { Requirement, Test } from "../types";

describe("serialize → parse round-trips an artifact (R-001, R-003)", () => {
  it("preserves a test's fields through a file write/read", () => {
    const original: Test = {
      kind: "test",
      id: "T-001",
      title: "Overcurrent trips fast",
      trace: ["R-003", "R-007"],
      file: "src/model/behavior.test.ts",
      result: "fail",
      body: "Injects an overcurrent and measures trip latency.",
      created: "2026-07-14",
    };
    const roundTripped = parseArtifact("test", "T-001.md", serializeArtifact(original));
    expect(roundTripped).toEqual(original);
  });

  it("preserves a requirement's EARS slots and trace", () => {
    const original: Requirement = {
      kind: "requirement",
      id: "R-001",
      title: "Begin delivery",
      status: "approved",
      moscow: "must",
      trace: ["UC-001"],
      format: "EARS",
      ears: "event-driven",
      condition: "a session is authorized",
      subject: "EVSE",
      action: "begin energy delivery",
      object: "",
      constraint: "within 5 seconds",
      created: "2026-07-14",
    };
    const roundTripped = parseArtifact("requirement", "R-001.md", serializeArtifact(original));
    expect(roundTripped).toEqual(original);
  });
});

describe("parseArtifact coerces malformed frontmatter to safe defaults (R-008)", () => {
  it("falls back on an unknown result and missing fields instead of throwing", () => {
    const raw = ["---", "id: T-042", "result: banana", "---", "some description"].join("\n");
    const parsed = parseArtifact("test", "T-042.md", raw);
    expect(parsed.kind).toBe("test");
    expect(parsed.id).toBe("T-042");
    if (parsed.kind === "test") {
      expect(parsed.result).toBe("unknown"); // "banana" is not a valid result
      expect(parsed.trace).toEqual([]); // absent → empty, not undefined
      expect(parsed.file).toBe(""); // absent → ""
    }
  });

  it("recovers the id from the filename when frontmatter has none", () => {
    const parsed = parseArtifact("test", "T-099.md", "no frontmatter here");
    expect(parsed.id).toBe("T-099");
    expect(parsed.title).toBe("T-099"); // title falls back to id
  });

  it("coerces an invalid requirement status to draft", () => {
    const raw = ["---", "id: R-001", "status: nonsense", "---", ""].join("\n");
    const parsed = parseArtifact("requirement", "R-001.md", raw);
    if (parsed.kind === "requirement") expect(parsed.status).toBe("draft");
  });
});
