import { describe, expect, it, vi } from "vitest";

import { buildCritiquePrompt, critiqueProject, validateCritique } from "./critique";
import { describeProject } from "./projectContext";
import type { CompletionResult, LlmClient } from "./types";
import { emptyProject, type Need, type Project, type Requirement } from "../types";

function need(id: string, title: string, moscow = "must"): Need {
  return { kind: "need", id, title, status: "approved", moscow, stakeholder: "", source: "", tags: [], body: "" } as Need;
}

function requirement(id: string, subject: string, action: string, trace: string[] = []): Requirement {
  return {
    kind: "requirement",
    id,
    title: "",
    status: "approved",
    trace,
    format: "EARS",
    ears: "ubiquitous",
    condition: "",
    subject,
    action,
    object: "",
    constraint: "",
  } as Requirement;
}

function project(): Project {
  const p = emptyProject();
  p.needs = [need("N-001", "Unattended charge completion")];
  p.requirements = [requirement("R-001", "EVSE", "stop within 5 seconds")];
  return p;
}

function scriptedClient(replies: CompletionResult[]): LlmClient {
  let i = 0;
  return { isConfigured: () => true, complete: vi.fn(async () => replies[Math.min(i++, replies.length - 1)]) };
}

describe("describeProject", () => {
  it("lists artifacts with ids, text, and coverage flags", () => {
    const text = describeProject(project());
    expect(text).toContain("N-001");
    expect(text).toContain("NO use case covers it");
    expect(text).toContain("R-001:");
    expect(text).toContain("The EVSE shall stop within 5 seconds.");
    expect(text).toContain("NO test");
  });
});

describe("buildCritiquePrompt", () => {
  it("embeds the project description", () => {
    const { prompt } = buildCritiquePrompt(project());
    expect(prompt).toContain("Unattended charge completion");
  });
});

describe("validateCritique", () => {
  it("keeps only references that resolve to real artifacts", () => {
    const findings = validateCritique(project(), {
      findings: [
        { severity: "high", category: "untestable", title: "Vague action", detail: "…", refs: ["R-001", "R-999"] },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].refs).toEqual(["R-001"]);
  });

  it("falls back to sane defaults for a bad severity and missing category", () => {
    const [f] = validateCritique(project(), {
      findings: [{ title: "Something", detail: "d", severity: "critical", refs: [] }],
    });
    expect(f.severity).toBe("medium");
    expect(f.category).toBe("general");
  });

  it("rejects a finding with no title (drives a retry)", () => {
    expect(() => validateCritique(project(), { findings: [{ detail: "no title" }] })).toThrow(/title/);
  });

  it("rejects a non-array findings field", () => {
    expect(() => validateCritique(project(), { findings: "nope" })).toThrow(/findings/);
  });

  it("accepts an empty findings list", () => {
    expect(validateCritique(project(), { findings: [] })).toEqual([]);
  });
});

describe("critiqueProject", () => {
  it("returns findings sorted by severity (high first)", async () => {
    const client = scriptedClient([
      {
        ok: true,
        text: JSON.stringify({
          findings: [
            { severity: "low", category: "style", title: "Low one", detail: "", refs: [] },
            { severity: "high", category: "gap", title: "High one", detail: "", refs: ["N-001"] },
          ],
        }),
      },
    ]);
    const r = await critiqueProject(client, project());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.map((f) => f.severity)).toEqual(["high", "low"]);
      expect(r.value[0].refs).toEqual(["N-001"]);
    }
  });
});
