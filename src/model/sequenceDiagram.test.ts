import { describe, expect, it } from "vitest";

import { deriveSequenceDiagram } from "./sequenceDiagram";
import { resolveActor } from "./actors";
import {
  emptyProject,
  type Activity,
  type Component,
  type Flow,
  type Stakeholder,
  type UseCase,
  type Project,
} from "../types";

function component(id: string, title: string, activities: Activity[]): Component {
  return { kind: "component", id, title, parent: "", uses: [], description: "", activities, variables: [], decisions: [] };
}
function stakeholder(id: string, title: string): Stakeholder {
  return { kind: "stakeholder", id, title, type: "primary", body: "" };
}
function useCase(id: string, flow: string, actors: string[]): UseCase {
  return {
    kind: "use-case", id, title: id, status: "draft", moscow: "should",
    trace: [], actors, stories: [], preconditions: [], flow,
  };
}
function flow(id: string, main: string[], alternates: Flow["alternates"] = []): Flow {
  return { kind: "flow", id, title: id, main, alternates };
}

/** Engineer (actor) drives an app + storage layer. */
function project(): Project {
  const p = emptyProject();
  p.stakeholders = [stakeholder("SH-001", "System Engineer")];
  p.components = [
    component("C-001", "Desktop App", [{ id: "ACT-001", label: "Open a project folder" }]),
    component("C-002", "Storage Layer", [
      { id: "ACT-002", label: "Read all artifact files" },
      { id: "ACT-003", label: "Parse a file" },
    ]),
  ];
  p.flows = [flow("FL-001", ["ACT-001", "ACT-002", "ACT-003"])];
  p.useCases = [useCase("UC-001", "FL-001", ["SH-001"])];
  return p;
}

const msg = (d: ReturnType<typeof deriveSequenceDiagram>, label: string) =>
  d.messages.find((m) => m.label === label);

describe("actor resolution", () => {
  it("resolves an entry to a stakeholder by id or title, else a named actor", () => {
    const p = project();
    expect(resolveActor(p, "SH-001").stakeholder?.id).toBe("SH-001");
    expect(resolveActor(p, "system engineer").stakeholder?.id).toBe("SH-001"); // by title, case-insensitive
    const plain = resolveActor(p, "Auditor");
    expect(plain.stakeholder).toBeUndefined();
    expect(plain).toMatchObject({ id: "actor:Auditor", label: "Auditor" });
  });
});

describe("sequence-diagram derivation", () => {
  it("makes the primary actor the first lifeline and components follow in flow order", () => {
    const d = deriveSequenceDiagram(project(), project().flows[0]);
    expect(d.participants.map((p) => p.id)).toEqual(["SH-001", "C-001", "C-002"]);
    expect(d.participants[0]).toMatchObject({ kind: "actor", label: "System Engineer" });
  });

  it("has the actor initiate the first message, then components hand off", () => {
    const d = deriveSequenceDiagram(project(), project().flows[0]);
    // Engineer -> Desktop App: open folder
    expect(msg(d, "Open a project folder")).toMatchObject({ fromId: "SH-001", toId: "C-001", self: false });
    // Desktop App -> Storage Layer: read files
    expect(msg(d, "Read all artifact files")).toMatchObject({ fromId: "C-001", toId: "C-002" });
    // Storage Layer -> itself: parse (same owner => self-call)
    expect(msg(d, "Parse a file")).toMatchObject({ fromId: "C-002", toId: "C-002", self: true });
  });

  it("honours an explicit activity initiator overriding the default sender", () => {
    const p = project();
    // Make "Parse a file" explicitly initiated by the engineer.
    p.components[1].activities[1].initiator = "SH-001";
    const d = deriveSequenceDiagram(p, p.flows[0]);
    expect(msg(d, "Parse a file")).toMatchObject({ fromId: "SH-001", toId: "C-002", self: false });
  });

  it("emits an alt fragment for a guarded alternate", () => {
    const p = project();
    p.flows = [
      flow("FL-001", ["ACT-001", "ACT-002"], [
        {
          id: "AP-1",
          condition: "the folder has no artifact subfolders",
          guard: "",
          after: 0,
          rejoin: 1,
          steps: ["ACT-003"],
        },
      ]),
    ];
    const d = deriveSequenceDiagram(p, p.flows[0]);
    const frag = d.fragments.find((f) => f.id === "AP-1");
    expect(frag).toBeTruthy();
    expect(frag).toMatchObject({ op: "alt", label: "the folder has no artifact subfolders" });
    // The alternate's message is tagged with its id.
    expect(msg(d, "Parse a file")?.altId).toBe("AP-1");
  });

  it("marks a backward-rejoining alternate as a loop fragment", () => {
    const p = project();
    p.flows = [
      flow("FL-001", ["ACT-001", "ACT-002"], [
        { id: "AP-1", condition: "retry", after: 1, rejoin: 0, steps: ["ACT-003"] },
      ]),
    ];
    const d = deriveSequenceDiagram(p, p.flows[0]);
    expect(d.fragments.find((f) => f.id === "AP-1")?.op).toBe("loop");
  });

  it("falls back to a self-initiated first message when the use case has no actor", () => {
    const p = project();
    p.useCases[0].actors = [];
    const d = deriveSequenceDiagram(p, p.flows[0]);
    expect(d.participants[0].id).toBe("C-001"); // no actor lifeline
    expect(msg(d, "Open a project folder")).toMatchObject({ fromId: "C-001", toId: "C-001", self: true });
  });

  it("reports an empty flow", () => {
    const p = project();
    p.flows = [flow("FL-001", [])];
    expect(deriveSequenceDiagram(p, p.flows[0]).empty).toBe(true);
  });
});
