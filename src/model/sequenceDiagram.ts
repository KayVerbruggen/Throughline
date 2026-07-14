// ---------------------------------------------------------------------------
// Sequence-diagram derivation.
//
// A flow already carries the two things a sequence diagram needs: an ordered
// set of activities, and the component that performs each. So the participants
// (lifelines) are the flow's components — plus the use case's actor(s), resolved
// to stakeholders — and a *message* is a hand-off: when control moves from an
// activity owned by A to the next owned by B, that's A → B labelled with the
// receiving activity. The primary actor initiates the first message; an activity
// may name an explicit `initiator` (a stakeholder actor or a component) to
// override the sender. Alternates become `alt` / `loop` combined fragments.
//
// This is the temporal companion to the Structure view's component graph, scoped
// to one flow. Pure and deterministic; reads no effects.
// ---------------------------------------------------------------------------

import { componentOfActivity, findActivity, useCaseOfFlow } from "./behavior";
import { resolveActors } from "./actors";
import type { Flow, Project } from "../types";

export type ParticipantKind = "actor" | "component";

export interface Participant {
  /** Stakeholder id (actor) or component id. */
  id: string;
  kind: ParticipantKind;
  label: string;
  /** Centre x of the lifeline (layout). */
  x: number;
}

export interface SeqMessage {
  fromId: string;
  toId: string;
  label: string;
  /** True when sender and receiver are the same lifeline (a self-call). */
  self: boolean;
  /** Id of the alternate this message belongs to, if any (fragment membership). */
  altId?: string;
  // layout
  y: number;
  fromX: number;
  toX: number;
}

export interface SeqFragment {
  id: string;
  op: "alt" | "loop";
  /** Guard (preferred) or prose condition. */
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SequenceDiagram {
  participants: Participant[];
  messages: SeqMessage[];
  fragments: SeqFragment[];
  /** Y where lifelines begin (below the participant header) and end. */
  laneTop: number;
  laneBottom: number;
  width: number;
  height: number;
  empty: boolean;
}

// --- geometry ---------------------------------------------------------------

const PAD = 24;
const LIFELINE_W = 176;
const HEAD_H = 44; // participant box height
const HEAD_TOP = 8;
const MSG_GAP = 48;
const FRAG_PAD_TOP = 16;
const FRAG_PAD_BOTTOM = 12;
const FRAG_MARGIN_X = 34;

// --- derivation -------------------------------------------------------------

interface RawMsg {
  fromId: string;
  toId: string;
  label: string;
  self: boolean;
  altId?: string;
}

export function deriveSequenceDiagram(project: Project, flow: Flow): SequenceDiagram {
  const inMainRange = (n: number) => n >= 0 && n < flow.main.length;
  if (flow.main.length === 0) {
    return emptyDiagram();
  }

  const uc = useCaseOfFlow(project, flow);
  const actors = uc ? resolveActors(project, uc.actors) : [];
  const primaryActor = actors[0] ?? null;

  // Ordered participants + lookup; `ensure` appends on first appearance so the
  // actor stays leftmost and components follow in flow order.
  const order: Participant[] = [];
  const byId = new Map<string, Participant>();
  const ensure = (id: string, kind: ParticipantKind, label: string): Participant => {
    const existing = byId.get(id);
    if (existing) return existing;
    const p: Participant = { id, kind, label, x: 0 };
    order.push(p);
    byId.set(id, p);
    return p;
  };

  if (primaryActor) ensure(primaryActor.id, "actor", primaryActor.label);

  const ownerOf = (activityId: string): Participant | null => {
    const c = componentOfActivity(project, activityId);
    return c ? ensure(c.id, "component", c.title) : null;
  };

  // Resolve an activity's explicit initiator to a participant: a stakeholder
  // (by id/title) → actor, a component (by id) → component, else a named actor.
  const initiatorOf = (activityId: string): Participant | null => {
    const act = findActivity(project, activityId);
    const value = act?.initiator?.trim();
    if (!value) return null;
    const sh = project.stakeholders.find(
      (s) => s.id === value || s.title.toLowerCase() === value.toLowerCase(),
    );
    if (sh) return ensure(sh.id, "actor", sh.title);
    const comp = project.components.find((c) => c.id === value);
    if (comp) return ensure(comp.id, "component", comp.title);
    return ensure(`actor:${value}`, "actor", value);
  };

  const raw: RawMsg[] = [];
  const emit = (fromId: string, toId: string, label: string, altId?: string) =>
    raw.push({ fromId, toId, label, self: fromId === toId, altId });

  let prevMainOwnerId: string | null = null;

  flow.main.forEach((actId, i) => {
    const receiver = ownerOf(actId);
    if (!receiver) return; // unassigned activity: nothing to place on a lifeline
    const act = findActivity(project, actId);
    const init = initiatorOf(actId);
    const senderId = init
      ? init.id
      : i === 0
        ? (primaryActor?.id ?? receiver.id)
        : (prevMainOwnerId ?? receiver.id);
    emit(senderId, receiver.id, act?.label || "(unnamed)");
    prevMainOwnerId = receiver.id;

    // Alternates diverging after this step, emitted contiguously so their
    // fragment box spans a clean run of messages.
    for (const alt of flow.alternates) {
      if (alt.after !== i) continue;
      let altPrevId = receiver.id;
      for (const sActId of alt.steps) {
        const sRecv = ownerOf(sActId);
        if (!sRecv) continue;
        const sAct = findActivity(project, sActId);
        const sInit = initiatorOf(sActId);
        emit(sInit ? sInit.id : altPrevId, sRecv.id, sAct?.label || "(unnamed)", alt.id);
        altPrevId = sRecv.id;
      }
    }
  });

  if (order.length === 0 || raw.length === 0) return emptyDiagram();

  // --- layout ---------------------------------------------------------------
  order.forEach((p, i) => {
    p.x = PAD + LIFELINE_W / 2 + i * LIFELINE_W;
  });

  const laneTop = HEAD_TOP + HEAD_H;
  const messages: SeqMessage[] = raw.map((m, i) => {
    const fromX = byId.get(m.fromId)!.x;
    const toX = byId.get(m.toId)!.x;
    return { ...m, y: laneTop + (i + 1) * MSG_GAP, fromX, toX };
  });
  const laneBottom = laneTop + (messages.length + 1) * MSG_GAP;

  // Fragments span the run of messages carrying their altId, across the
  // lifelines those messages touch.
  const fragments: SeqFragment[] = [];
  for (const alt of flow.alternates) {
    const own = messages.filter((m) => m.altId === alt.id);
    if (own.length === 0) continue;
    const ys = own.map((m) => m.y);
    const xs = own.flatMap((m) => [m.fromX, m.toX]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const top = Math.min(...ys) - FRAG_PAD_TOP;
    const bottom = Math.max(...ys) + FRAG_PAD_BOTTOM;
    fragments.push({
      id: alt.id,
      op: inMainRange(alt.rejoin) && alt.rejoin <= alt.after ? "loop" : "alt",
      label: alt.guard || alt.condition || "alt",
      x: minX - FRAG_MARGIN_X,
      y: top,
      w: maxX - minX + FRAG_MARGIN_X * 2,
      h: bottom - top,
    });
  }

  const width = PAD * 2 + order.length * LIFELINE_W;
  const height = laneBottom + PAD;
  return { participants: order, messages, fragments, laneTop, laneBottom, width, height, empty: false };
}

function emptyDiagram(): SequenceDiagram {
  return {
    participants: [],
    messages: [],
    fragments: [],
    laneTop: HEAD_TOP + HEAD_H,
    laneBottom: HEAD_TOP + HEAD_H,
    width: PAD * 2,
    height: PAD * 2,
    empty: true,
  };
}
