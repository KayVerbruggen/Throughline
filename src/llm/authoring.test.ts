import { describe, expect, it, vi } from "vitest";

import { authorArtifact, buildAuthoringPrompt, validateAuthoring } from "./authoring";
import type { CompletionResult, LlmClient } from "./types";
import { emptyProject, type Need, type Project, type UseCase } from "../types";

function project(): Project {
  const p = emptyProject();
  p.stakeholders = [{ kind: "stakeholder", id: "SH-001", title: "Fleet Operator", type: "primary", body: "" }];
  p.needs = [{ kind: "need", id: "N-001", title: "Unattended charge completion", status: "approved", moscow: "must", stakeholder: "SH-001", source: "", tags: [], body: "" } as Need];
  p.useCases = [{ kind: "use-case", id: "UC-001", title: "Start a charging session", status: "approved", moscow: "must", trace: ["N-001"], actors: [], stories: [], preconditions: [], flow: "FL-001" } as UseCase];
  return p;
}

function scriptedClient(replies: CompletionResult[]): LlmClient {
  let i = 0;
  return { isConfigured: () => true, complete: vi.fn(async () => replies[Math.min(i++, replies.length - 1)]) };
}

describe("buildAuthoringPrompt", () => {
  it("embeds the request and the existing artifacts", () => {
    const { prompt } = buildAuthoringPrompt(project(), "add a requirement about equalising within 90s");
    expect(prompt).toContain("equalising within 90s");
    expect(prompt).toContain("UC-001");
  });
});

describe("validateAuthoring", () => {
  it("drafts a requirement, composes the EARS preview, and resolves the traced use case by name", () => {
    const d = validateAuthoring(project(), {
      kind: "requirement",
      fields: {
        ears: "event-driven",
        condition: "a vehicle is connected and authorized",
        subject: "EVSE",
        action: "begin energy delivery",
        object: "",
        constraint: "within 5 seconds",
        moscow: "must",
        trace: ["Start a charging session"],
      },
    });
    if (d.kind !== "requirement") throw new Error("wrong kind");
    expect(d.trace).toEqual(["UC-001"]);
    expect(d.preview).toBe("WHEN a vehicle is connected and authorized, the EVSE shall begin energy delivery within 5 seconds.");
    expect(d.unresolved).toEqual([]);
  });

  it("records trace references it can't resolve instead of inventing links", () => {
    const d = validateAuthoring(project(), {
      kind: "requirement",
      fields: { ears: "ubiquitous", subject: "system", action: "log events", trace: ["UC-999", "No such case"] },
    });
    if (d.kind !== "requirement") throw new Error("wrong kind");
    expect(d.trace).toEqual([]);
    expect(d.unresolved).toEqual(["UC-999", "No such case"]);
  });

  it("resolves a need's stakeholder by name", () => {
    const d = validateAuthoring(project(), {
      kind: "need",
      fields: { title: "Off-peak charging", moscow: "could", stakeholder: "Fleet Operator" },
    });
    if (d.kind !== "need") throw new Error("wrong kind");
    expect(d.stakeholder).toBe("SH-001");
  });

  it("composes a decision's Y-statement preview", () => {
    const d = validateAuthoring(project(), {
      kind: "decision",
      fields: {
        title: "Store state on components",
        context: "the behaviour model",
        concern: "where variables live",
        decision: "put state on components",
        criterion: "one clear owner per variable",
        trace: ["UC-001"],
      },
    });
    if (d.kind !== "decision") throw new Error("wrong kind");
    expect(d.preview).toContain("In the the behaviour model, facing where variables live, we decided put state on components");
    expect(d.trace).toEqual(["UC-001"]);
  });

  it("rejects an unsupported kind (drives a retry)", () => {
    expect(() => validateAuthoring(project(), { kind: "component", fields: { title: "X" } })).toThrow(/kind/);
  });

  it("rejects a requirement with no action, and a glossary term with no definition", () => {
    expect(() => validateAuthoring(project(), { kind: "requirement", fields: { subject: "x" } })).toThrow(/action/);
    expect(() => validateAuthoring(project(), { kind: "glossary", fields: { title: "Sluice" } })).toThrow(/definition/);
  });
});

describe("authorArtifact", () => {
  it("returns a validated draft from the model reply", async () => {
    const client = scriptedClient([
      {
        ok: true,
        text: JSON.stringify({
          kind: "glossary",
          fields: { title: "Pound lock", aliases: ["chamber lock"], definition: "A lock with two gates and a chamber." },
        }),
      },
    ]);
    const r = await authorArtifact(client, project(), "define pound lock");
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === "glossary") {
      expect(r.value.title).toBe("Pound lock");
      expect(r.value.aliases).toEqual(["chamber lock"]);
    }
  });
});
