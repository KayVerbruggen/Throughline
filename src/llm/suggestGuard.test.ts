import { describe, expect, it, vi } from "vitest";

import { buildGuardPrompt, suggestGuard, validateGuardSuggestion } from "./suggestGuard";
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

/** Chamber (chamber): vesselCount:int, open:bool. Upstream Gate (upstreamGate): no vars. */
function project(): Project {
  const p = emptyProject();
  p.components = [
    component("C-001", "Chamber", [
      { id: "VAR-001", name: "vesselCount", type: { kind: "int", min: 0 } },
      { id: "VAR-002", name: "open", type: { kind: "bool" } },
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

describe("buildGuardPrompt", () => {
  it("includes the condition, the component handles, and their variables", () => {
    const { prompt } = buildGuardPrompt(project(), "the chamber is not empty");
    expect(prompt).toContain("the chamber is not empty");
    expect(prompt).toContain("handle: chamber");
    expect(prompt).toContain("vesselCount: int (min 0)");
    expect(prompt).toContain("handle: upstreamGate");
  });
});

describe("validateGuardSuggestion", () => {
  it("accepts a guard over existing variables", () => {
    const s = validateGuardSuggestion(project(), { guard: "chamber.vesselCount != 0", newVariables: [] });
    expect(s.guard).toBe("chamber.vesselCount != 0");
    expect(s.newVariables).toEqual([]);
  });

  it("type-checks the guard against a proposed new variable and resolves its component", () => {
    const s = validateGuardSuggestion(project(), {
      guard: "upstreamGate.state == open",
      newVariables: [
        { component: "upstreamGate", name: "state", type: { kind: "enum", values: ["open", "closed"] }, description: "gate position" },
      ],
      explanation: "The branch runs while the upstream gate is open.",
    });
    expect(s.guard).toBe("upstreamGate.state == open");
    expect(s.newVariables).toEqual([
      { componentId: "C-002", name: "state", type: { kind: "enum", values: ["open", "closed"] }, description: "gate position" },
    ]);
    expect(s.explanation).toContain("upstream gate");
  });

  it("rejects a guard that references state nobody declares (drives a retry)", () => {
    expect(() =>
      validateGuardSuggestion(project(), { guard: "upstreamGate.state == open", newVariables: [] }),
    ).toThrow(/Unknown variable/);
  });

  it("rejects a non-boolean guard", () => {
    expect(() =>
      validateGuardSuggestion(project(), { guard: "chamber.vesselCount", newVariables: [] }),
    ).toThrow(/bool/);
  });

  it("rejects an unknown component handle on a new variable", () => {
    expect(() =>
      validateGuardSuggestion(project(), {
        guard: "reactor.hot == true",
        newVariables: [{ component: "reactor", name: "hot", type: { kind: "bool" } }],
      }),
    ).toThrow(/Unknown component handle/);
  });

  it("rejects a malformed variable name", () => {
    expect(() =>
      validateGuardSuggestion(project(), {
        guard: "chamber.x == 1",
        newVariables: [{ component: "chamber", name: "2bad", type: { kind: "int" } }],
      }),
    ).toThrow(/Invalid variable name/);
  });

  it("drops a proposed variable that already exists, keeping the existing declaration", () => {
    const s = validateGuardSuggestion(project(), {
      guard: "chamber.open == true",
      // Model redundantly 'creates' open, which already exists on Chamber.
      newVariables: [{ component: "chamber", name: "open", type: { kind: "bool" } }],
    });
    expect(s.newVariables).toEqual([]);
  });

  it("rejects a missing guard field", () => {
    expect(() => validateGuardSuggestion(project(), { newVariables: [] })).toThrow(/guard/);
  });
});

describe("suggestGuard", () => {
  it("returns a validated suggestion from the model reply", async () => {
    const client = scriptedClient([
      { ok: true, text: '{"guard":"chamber.vesselCount != 0","newVariables":[]}' },
    ]);
    const r = await suggestGuard(client, project(), "the chamber still holds a vessel");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.guard).toBe("chamber.vesselCount != 0");
  });

  it("self-corrects: a guard needing new state fails, then the retry declares it", async () => {
    const client = scriptedClient([
      // First reply forgets to declare the variable it uses.
      { ok: true, text: '{"guard":"upstreamGate.state == open","newVariables":[]}' },
      // Retry adds it.
      {
        ok: true,
        text: '{"guard":"upstreamGate.state == open","newVariables":[{"component":"upstreamGate","name":"state","type":{"kind":"enum","values":["open","closed"]}}]}',
      },
    ]);
    const r = await suggestGuard(client, project(), "the upstream gate is open");
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.newVariables).toHaveLength(1);
      expect(r.value.newVariables[0]).toMatchObject({ componentId: "C-002", name: "state" });
    }
  });
});
