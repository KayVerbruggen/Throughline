import { describe, expect, it, vi } from "vitest";

import { formalizeAllFlows } from "./formalizeAll";
import type { CompletionResult, LlmClient } from "./types";
import { emptyProject, type Activity, type Component, type Flow, type Project, type UseCase } from "../types";

function component(id: string, title: string, activities: Activity[] = [], variables: Component["variables"] = []): Component {
  return { kind: "component", id, title, parent: "", uses: [], description: "", activities, variables, decisions: [] };
}

function flow(id: string, title: string, main: string[]): Flow {
  return { kind: "flow", id, title, main, alternates: [] };
}

function useCase(id: string, title: string, flowId: string): UseCase {
  // Only the fields formalizeAllFlows reads (id, title, flow) matter here.
  return { kind: "use-case", id, title, flow: flowId } as UseCase;
}

function scriptedClient(replies: CompletionResult[]): LlmClient {
  let i = 0;
  const complete = vi.fn(async () => replies[Math.min(i++, replies.length - 1)]);
  return { isConfigured: () => true, complete };
}

/**
 * Two use cases, one shared Gate component. FL-A opens the gate (ACT-A1), FL-B
 * closes it (ACT-B1) — neither has effects yet, and the Gate has no variables.
 */
function twoFlowProject(): Project {
  const p = emptyProject();
  p.components = [
    component("C-001", "Gate", [
      { id: "ACT-A1", label: "Open the gate" },
      { id: "ACT-B1", label: "Close the gate" },
    ]),
  ];
  p.flows = [flow("FL-A", "Open flow", ["ACT-A1"]), flow("FL-B", "Close flow", ["ACT-B1"])];
  p.useCases = [useCase("UC-A", "Let a vessel in", "FL-A"), useCase("UC-B", "Let a vessel out", "FL-B")];
  return p;
}

describe("formalizeAllFlows", () => {
  it("threads variables forward: the second flow reuses the mode the first introduced", async () => {
    const client = scriptedClient([
      // FL-A introduces gate.state and opens it.
      {
        ok: true,
        text: JSON.stringify({
          newVariables: [{ component: "gate", name: "state", type: { kind: "enum", values: ["open", "closed"] } }],
          guards: [],
          effects: [{ activityId: "ACT-A1", effects: ["gate.state := open"] }],
        }),
      },
      // FL-B references gate.state WITHOUT redeclaring it. This only type-checks
      // if FL-A's variable was threaded into the working project.
      {
        ok: true,
        text: JSON.stringify({
          newVariables: [],
          guards: [],
          effects: [{ activityId: "ACT-B1", effects: ["gate.state := closed"] }],
        }),
      },
    ]);

    const r = await formalizeAllFlows(client, twoFlowProject());
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.flows).toHaveLength(2);
    expect(r.value.flows.every((f) => f.plan && !f.error)).toBe(true);
    // FL-B reused the existing variable — no duplicate proposed.
    expect(r.value.flows[1].plan!.newVariables).toEqual([]);
    expect(r.value.flows[1].plan!.effects[0].effects).toEqual(["gate.state := closed"]);

    // The accumulated Gate carries the single new variable AND both effects.
    const gate = r.value.touched.find((a) => a.id === "C-001") as Component;
    expect(gate.variables.filter((v) => v.name === "state")).toHaveLength(1);
    expect(gate.activities.find((a) => a.id === "ACT-A1")!.effects).toEqual(["gate.state := open"]);
    expect(gate.activities.find((a) => a.id === "ACT-B1")!.effects).toEqual(["gate.state := closed"]);
    // Only the Gate component is touched — both flows carry effects (component-
    // owned), not guards, so the flow artifacts themselves are unchanged.
    expect(new Set(r.value.touched.map((a) => a.id))).toEqual(new Set(["C-001"]));
  });

  it("is best-effort: one flow's failure is recorded and the others still succeed", async () => {
    const p = twoFlowProject();
    const client = scriptedClient([
      // FL-A: malformed both times → error after the one retry.
      { ok: true, text: "not json" },
      { ok: true, text: "still not json" },
      // FL-B: valid, independent of FL-A (declares its own variable).
      {
        ok: true,
        text: JSON.stringify({
          newVariables: [{ component: "gate", name: "shut", type: { kind: "bool" } }],
          guards: [],
          effects: [{ activityId: "ACT-B1", effects: ["gate.shut := true"] }],
        }),
      },
    ]);

    const r = await formalizeAllFlows(client, p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.flows[0]).toMatchObject({ flowId: "FL-A" });
    expect(r.value.flows[0].error).toBeTruthy();
    expect(r.value.flows[0].plan).toBeUndefined();
    expect(r.value.flows[1]).toMatchObject({ flowId: "FL-B" });
    expect(r.value.flows[1].plan!.effects[0].effects).toEqual(["gate.shut := true"]);
    // Only FL-B's changes are threaded/touched (its effect, on the Gate component).
    expect(new Set(r.value.touched.map((a) => a.id))).toEqual(new Set(["C-001"]));
  });

  it("skips use cases with no flow and flows with nothing pending", async () => {
    const p = twoFlowProject();
    // FL-B already fully formal: give ACT-B1 an effect up front.
    const gate = p.components[0];
    gate.activities[1] = { ...gate.activities[1], effects: ["gate.x := true"] };
    gate.variables = [{ id: "VAR-001", name: "x", type: { kind: "bool" } }];
    // A third use case pointing at a non-existent flow.
    p.useCases.push(useCase("UC-C", "Orphan", "FL-MISSING"));

    const client = scriptedClient([
      {
        ok: true,
        text: JSON.stringify({
          newVariables: [],
          guards: [],
          effects: [{ activityId: "ACT-A1", effects: ["gate.x := false"] }],
        }),
      },
    ]);

    const r = await formalizeAllFlows(client, p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Only FL-A was attempted; FL-B (already formal) and UC-C (no flow) skipped.
    expect(r.value.flows.map((f) => f.flowId)).toEqual(["FL-A"]);
    expect(r.value.skipped).toBe(2);
    expect(client.complete).toHaveBeenCalledTimes(1);
  });
});
