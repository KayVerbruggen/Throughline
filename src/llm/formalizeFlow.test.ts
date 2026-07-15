import { describe, expect, it, vi } from "vitest";

import {
  applyFormalization,
  buildFormalizePrompt,
  formalizeFlow,
  pendingFormalization,
  validateFormalization,
} from "./formalizeFlow";
import type { CompletionResult, LlmClient } from "./types";
import { emptyProject, type Activity, type Component, type Flow, type Project } from "../types";

function component(id: string, title: string, activities: Activity[] = [], variables: Component["variables"] = []): Component {
  return { kind: "component", id, title, parent: "", uses: [], description: "", activities, variables, decisions: [] };
}

/**
 * Chamber (chamber) owns "Release a vessel" (ACT-001, no effects) and "Reset"
 * (ACT-002, already has effects). Gate (gate) owns "Open the gate" (ACT-003).
 * Flow FL-001 runs all three with one branch AP-1 ("the chamber still holds a
 * vessel", no guard).
 */
function fixture(): { project: Project; flow: Flow } {
  const flow: Flow = {
    kind: "flow",
    id: "FL-001",
    title: "Pass a vessel",
    main: ["ACT-001", "ACT-003"],
    alternates: [{ id: "AP-1", condition: "the chamber still holds a vessel", after: 0, rejoin: -1, steps: ["ACT-002"] }],
  };
  const p = emptyProject();
  p.components = [
    component(
      "C-001",
      "Chamber",
      [
        { id: "ACT-001", label: "Release a vessel" },
        { id: "ACT-002", label: "Reset", effects: ["chamber.vesselCount := 0"] },
      ],
      [{ id: "VAR-001", name: "vesselCount", type: { kind: "int", min: 0 } }],
    ),
    component("C-002", "Gate", [{ id: "ACT-003", label: "Open the gate" }]),
  ];
  p.flows = [flow];
  return { project: p, flow };
}

function scriptedClient(replies: CompletionResult[]): LlmClient {
  let i = 0;
  return { isConfigured: () => true, complete: vi.fn(async () => replies[Math.min(i++, replies.length - 1)]) };
}

describe("pendingFormalization", () => {
  it("lists branches without a guard and named activities without effects, skipping already-formal ones", () => {
    const { project, flow } = fixture();
    const t = pendingFormalization(project, flow);
    expect(t.guards).toEqual([{ altId: "AP-1", condition: "the chamber still holds a vessel" }]);
    // ACT-001 and ACT-003 need effects; ACT-002 already has them and is skipped.
    expect(t.effects.map((e) => e.activityId)).toEqual(["ACT-001", "ACT-003"]);
    expect(t.effects[0]).toMatchObject({ label: "Release a vessel", ownerTitle: "Chamber" });
  });
});

describe("buildFormalizePrompt", () => {
  it("includes the flow, the target ids, and the component context", () => {
    const { project, flow } = fixture();
    const { prompt } = buildFormalizePrompt(project, flow, pendingFormalization(project, flow));
    expect(prompt).toContain('Flow "Pass a vessel" (FL-001)');
    expect(prompt).toContain("[ACT-001]");
    expect(prompt).toContain("[AP-1]");
    expect(prompt).toContain("already has effects: chamber.vesselCount := 0");
    expect(prompt).toContain("handle: chamber");
  });
});

describe("validateFormalization", () => {
  it("accepts a coherent plan, resolving conditions/labels and keeping used new variables", () => {
    const { project, flow } = fixture();
    const plan = validateFormalization(project, flow, {
      newVariables: [{ component: "gate", name: "state", type: { kind: "enum", values: ["open", "closed"] } }],
      guards: [{ altId: "AP-1", guard: "chamber.vesselCount != 0" }],
      effects: [
        { activityId: "ACT-001", effects: ["chamber.vesselCount := chamber.vesselCount - 1"] },
        { activityId: "ACT-003", effects: ["gate.state := open"] },
      ],
      explanation: "Chamber counts vessels; the gate has an open/closed mode.",
    });
    expect(plan.guards).toEqual([
      { altId: "AP-1", condition: "the chamber still holds a vessel", guard: "chamber.vesselCount != 0" },
    ]);
    expect(plan.effects.map((e) => e.label)).toEqual(["Release a vessel", "Open the gate"]);
    expect(plan.newVariables).toHaveLength(1);
    expect(plan.newVariables[0]).toMatchObject({ componentId: "C-002", name: "state" });
  });

  it("prunes a proposed variable no guard or effect references", () => {
    const { project, flow } = fixture();
    const plan = validateFormalization(project, flow, {
      newVariables: [{ component: "gate", name: "unused", type: { kind: "bool" } }],
      guards: [{ altId: "AP-1", guard: "chamber.vesselCount != 0" }],
      effects: [],
    });
    expect(plan.newVariables).toEqual([]);
  });

  it("drops a guard for a branch that already has one, without clobbering it", () => {
    const { project, flow } = fixture();
    flow.alternates[0].guard = "chamber.vesselCount > 0";
    const plan = validateFormalization(project, flow, {
      newVariables: [],
      guards: [{ altId: "AP-1", guard: "chamber.vesselCount != 0" }],
      effects: [],
    });
    expect(plan.guards).toEqual([]);
  });

  it("rejects an unknown branch id (drives a retry)", () => {
    const { project, flow } = fixture();
    expect(() =>
      validateFormalization(project, flow, { newVariables: [], guards: [{ altId: "AP-9", guard: "true" }], effects: [] }),
    ).toThrow(/Unknown branch id "AP-9"/);
  });

  it("rejects an effect on an activity outside the flow", () => {
    const { project, flow } = fixture();
    expect(() =>
      validateFormalization(project, flow, {
        newVariables: [],
        guards: [],
        effects: [{ activityId: "ACT-099", effects: ["chamber.vesselCount := 0"] }],
      }),
    ).toThrow(/Unknown activity id "ACT-099"/);
  });

  it("rejects a guard that references undeclared state and locates it", () => {
    const { project, flow } = fixture();
    expect(() =>
      validateFormalization(project, flow, {
        newVariables: [],
        guards: [{ altId: "AP-1", guard: "gate.state == open" }],
        effects: [],
      }),
    ).toThrow(/Branch "AP-1" guard/);
  });
});

describe("applyFormalization", () => {
  it("mints variables, sets guards, and sets effects atomically", () => {
    const { project, flow } = fixture();
    const plan = validateFormalization(project, flow, {
      newVariables: [{ component: "gate", name: "state", type: { kind: "enum", values: ["open", "closed"] } }],
      guards: [{ altId: "AP-1", guard: "chamber.vesselCount != 0" }],
      effects: [{ activityId: "ACT-003", effects: ["gate.state := open"] }],
    });
    const { project: next, touched } = applyFormalization(project, flow.id, plan);

    const gate = next.components.find((c) => c.id === "C-002")!;
    // The new variable was created...
    expect(gate.variables.map((v) => v.name)).toContain("state");
    // ...on the SAME component that also got the effect — both survive.
    expect(gate.activities.find((a) => a.id === "ACT-003")!.effects).toEqual(["gate.state := open"]);
    expect(next.flows[0].alternates[0].guard).toBe("chamber.vesselCount != 0");
    // Touched: the flow + the gate component (guard flow, var+effect gate). Chamber untouched.
    expect(new Set(touched.map((a) => a.id))).toEqual(new Set(["FL-001", "C-002"]));
  });
});

describe("formalizeFlow", () => {
  it("returns a validated plan from the model reply", async () => {
    const { project, flow } = fixture();
    const client = scriptedClient([
      {
        ok: true,
        text: JSON.stringify({
          newVariables: [{ component: "gate", name: "state", type: { kind: "enum", values: ["open", "closed"] } }],
          guards: [{ altId: "AP-1", guard: "chamber.vesselCount != 0" }],
          effects: [{ activityId: "ACT-003", effects: ["gate.state := open"] }],
        }),
      },
    ]);
    const r = await formalizeFlow(client, project, flow);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.guards).toHaveLength(1);
      expect(r.value.effects).toHaveLength(1);
      expect(r.value.newVariables).toHaveLength(1);
    }
  });
});
