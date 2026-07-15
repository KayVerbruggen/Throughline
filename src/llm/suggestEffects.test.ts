import { describe, expect, it, vi } from "vitest";

import { buildEffectPrompt, suggestEffects, validateEffectSuggestion } from "./suggestEffects";
import type { CompletionResult, LlmClient } from "./types";
import { emptyProject, type Component, type Project } from "../types";

function component(id: string, title: string, variables: Component["variables"] = []): Component {
  return {
    kind: "component",
    id,
    title,
    parent: "",
    uses: [],
    description: "",
    activities: [],
    variables,
    decisions: [],
  };
}

/** Chamber (chamber): vesselCount:int. Upstream Gate (upstreamGate): no vars. */
function project(): Project {
  const p = emptyProject();
  p.components = [
    component("C-001", "Chamber", [
      { id: "VAR-001", name: "vesselCount", type: { kind: "int", min: 0 } },
    ]),
    component("C-002", "Upstream Gate"),
  ];
  return p;
}

function scriptedClient(replies: CompletionResult[]): LlmClient {
  let i = 0;
  return {
    isConfigured: () => true,
    complete: vi.fn(async () => replies[Math.min(i++, replies.length - 1)]),
  };
}

describe("buildEffectPrompt", () => {
  it("includes the activity label, owner, flow, handles, and variables", () => {
    const { prompt } = buildEffectPrompt(project(), "Open the upstream gate", "Upstream Gate", "Pass a vessel");
    expect(prompt).toContain("Open the upstream gate");
    expect(prompt).toContain('"Upstream Gate" component');
    expect(prompt).toContain('"Pass a vessel" flow');
    expect(prompt).toContain("handle: chamber");
    expect(prompt).toContain("vesselCount: int (min 0)");
  });
});

describe("validateEffectSuggestion", () => {
  it("accepts effects over existing variables", () => {
    const s = validateEffectSuggestion(project(), {
      effects: ["chamber.vesselCount := chamber.vesselCount + 1"],
      newVariables: [],
    });
    expect(s.effects).toEqual(["chamber.vesselCount := chamber.vesselCount + 1"]);
    expect(s.newVariables).toEqual([]);
  });

  it("accepts an empty effects list (the activity changes no state)", () => {
    const s = validateEffectSuggestion(project(), { effects: [], newVariables: [] });
    expect(s.effects).toEqual([]);
  });

  it("type-checks an effect against a proposed new variable and resolves its component", () => {
    const s = validateEffectSuggestion(project(), {
      effects: ["upstreamGate.state := open"],
      newVariables: [
        { component: "upstreamGate", name: "state", type: { kind: "enum", values: ["open", "closed"] }, description: "gate position" },
      ],
      explanation: "Opening the gate sets its state to open.",
    });
    expect(s.effects).toEqual(["upstreamGate.state := open"]);
    expect(s.newVariables).toEqual([
      { componentId: "C-002", name: "state", type: { kind: "enum", values: ["open", "closed"] }, description: "gate position" },
    ]);
    expect(s.explanation).toContain("open");
  });

  it("rejects an effect that assigns state nobody declares (drives a retry)", () => {
    expect(() =>
      validateEffectSuggestion(project(), { effects: ["upstreamGate.state := open"], newVariables: [] }),
    ).toThrow(/Unknown variable/);
  });

  it("rejects a type-mismatched effect", () => {
    expect(() =>
      validateEffectSuggestion(project(), { effects: ["chamber.vesselCount := open"], newVariables: [] }),
    ).toThrow(/Effect "chamber.vesselCount := open"/);
  });

  it("rejects a non-assignment effect", () => {
    expect(() =>
      validateEffectSuggestion(project(), { effects: ["chamber.vesselCount == 0"], newVariables: [] }),
    ).toThrow(/Effect "chamber.vesselCount == 0"/);
  });

  it("rejects a missing effects field", () => {
    expect(() => validateEffectSuggestion(project(), { newVariables: [] })).toThrow(/effects/);
  });

  it("drops a proposed variable that already exists, keeping the existing declaration", () => {
    const s = validateEffectSuggestion(project(), {
      effects: ["chamber.vesselCount := 0"],
      newVariables: [{ component: "chamber", name: "vesselCount", type: { kind: "int" } }],
    });
    expect(s.newVariables).toEqual([]);
  });
});

describe("suggestEffects", () => {
  it("returns a validated suggestion from the model reply", async () => {
    const client = scriptedClient([
      { ok: true, text: '{"effects":["chamber.vesselCount := chamber.vesselCount - 1"],"newVariables":[]}' },
    ]);
    const r = await suggestEffects(client, project(), "Release a vessel", "Chamber");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.effects).toEqual(["chamber.vesselCount := chamber.vesselCount - 1"]);
  });

  it("self-corrects: an effect needing new state fails, then the retry declares it", async () => {
    const client = scriptedClient([
      // First reply forgets to declare the variable it assigns.
      { ok: true, text: '{"effects":["upstreamGate.state := open"],"newVariables":[]}' },
      // Retry adds it.
      {
        ok: true,
        text: '{"effects":["upstreamGate.state := open"],"newVariables":[{"component":"upstreamGate","name":"state","type":{"kind":"enum","values":["open","closed"]}}]}',
      },
    ]);
    const r = await suggestEffects(client, project(), "Open the upstream gate", "Upstream Gate");
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.newVariables).toHaveLength(1);
      expect(r.value.newVariables[0]).toMatchObject({ componentId: "C-002", name: "state" });
    }
  });
});
