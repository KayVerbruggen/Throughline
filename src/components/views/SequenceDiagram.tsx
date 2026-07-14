import { useMemo } from "react";

import {
  deriveSequenceDiagram,
  type Participant,
  type SeqFragment,
  type SeqMessage,
  type SequenceDiagram as SeqModel,
} from "../../model/sequenceDiagram";
import { useStore } from "../../state/store";
import type { Flow } from "../../types";
import { Icon } from "../icons";

const SELF_W = 26; // width of a self-message loop
const SELF_H = 16;

/** Stable hue per component id, matching the other diagrams' colours. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/**
 * The sequence diagram for one flow: actor + component lifelines down the top,
 * messages (hand-offs) flowing top-to-bottom, alternates as alt/loop fragments.
 * Read-only, derived from the flow — the step editor is on the left.
 */
export function SequenceDiagram({ flow }: { flow: Flow }) {
  const project = useStore((s) => s.project);
  const model = useMemo<SeqModel>(() => deriveSequenceDiagram(project, flow), [project, flow]);

  if (model.empty) {
    return (
      <div
        style={{
          border: "1px dashed rgba(var(--line),.2)",
          borderRadius: 12,
          padding: "28px 24px",
          textAlign: "center",
          background: "var(--surface2)",
          font: "400 12.5px/1.55 'IBM Plex Sans'",
          color: "var(--sub)",
        }}
      >
        {flow.id} has no steps yet. Add activities on the left and they'll appear here.
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto", paddingBottom: 12 }}>
      <div style={{ position: "relative", width: model.width, height: model.height, minWidth: "100%" }}>
        <svg
          width={model.width}
          height={model.height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          <defs>
            <marker
              id="seq-arrow"
              viewBox="0 0 10 10"
              refX={9}
              refY={5}
              markerUnits="userSpaceOnUse"
              markerWidth={10}
              markerHeight={10}
              orient="auto"
            >
              <path d="M0 1.5 L9 5 L0 8.5 z" fill="var(--sub)" />
            </marker>
          </defs>

          {/* Fragments behind everything. */}
          {model.fragments.map((f) => (
            <rect
              key={f.id}
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={7}
              fill="rgba(var(--line),.03)"
              stroke="rgba(var(--line),.2)"
              strokeWidth={1}
              strokeDasharray={f.op === "loop" ? "5 4" : undefined}
            />
          ))}

          {/* Lifelines. */}
          {model.participants.map((p) => (
            <line
              key={p.id}
              x1={p.x}
              y1={model.laneTop}
              x2={p.x}
              y2={model.laneBottom}
              stroke="rgba(var(--line),.22)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
          ))}

          {/* Messages. */}
          {model.messages.map((m, i) => (
            <MessageArc key={i} msg={m} />
          ))}
        </svg>

        {/* Participant headers. */}
        {model.participants.map((p) => (
          <Head key={p.id} p={p} />
        ))}

        {/* Message labels. */}
        {model.messages.map((m, i) => (
          <MessageLabel key={i} msg={m} />
        ))}

        {/* Fragment labels. */}
        {model.fragments.map((f) => (
          <FragmentLabel key={f.id} frag={f} />
        ))}
      </div>
    </div>
  );
}

function MessageArc({ msg }: { msg: SeqMessage }) {
  if (msg.self) {
    // A small loop hanging off the right of the lifeline.
    const x = msg.fromX;
    const y = msg.y;
    const d = `M ${x} ${y} h ${SELF_W} v ${SELF_H} h ${-SELF_W}`;
    return <path d={d} fill="none" stroke="var(--sub)" strokeWidth={1.3} markerEnd="url(#seq-arrow)" />;
  }
  return (
    <line
      x1={msg.fromX}
      y1={msg.y}
      x2={msg.toX}
      y2={msg.y}
      stroke="var(--sub)"
      strokeWidth={1.3}
      markerEnd="url(#seq-arrow)"
    />
  );
}

function MessageLabel({ msg }: { msg: SeqMessage }) {
  const left = msg.self ? msg.fromX + SELF_W + 8 : (msg.fromX + msg.toX) / 2;
  const transform = msg.self ? "translateY(-50%)" : "translate(-50%, -100%)";
  return (
    <div
      title={msg.label}
      style={{
        position: "absolute",
        left,
        top: msg.self ? msg.y + SELF_H / 2 : msg.y - 4,
        transform,
        maxWidth: 200,
        padding: "1px 6px",
        borderRadius: 5,
        background: "var(--surface)",
        font: "400 11px 'IBM Plex Sans'",
        color: "var(--ink)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      }}
    >
      {msg.label}
    </div>
  );
}

function Head({ p }: { p: Participant }) {
  const W = 152;
  const H = 40;
  const isActor = p.kind === "actor";
  const hue = hueOf(p.id);
  return (
    <div
      title={p.label}
      style={{
        position: "absolute",
        left: p.x - W / 2,
        top: 8,
        width: W,
        height: H,
        borderRadius: isActor ? H / 2 : 9,
        border: "1px solid rgba(var(--line),.14)",
        borderLeft: isActor ? "1px solid rgba(var(--line),.14)" : `3px solid oklch(0.62 0.14 ${hue})`,
        background: isActor ? "var(--accent-bg)" : "var(--surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        padding: "0 10px",
        boxShadow: "0 1px 3px rgba(var(--line),.05)",
      }}
    >
      {isActor ? (
        <span style={{ display: "flex", flex: "none", color: "var(--accent-ink)" }}>
          <Icon name="stakeholder" size={14} />
        </span>
      ) : null}
      <span
        style={{
          minWidth: 0,
          font: `${isActor ? 600 : 500} 12px 'IBM Plex Sans'`,
          color: isActor ? "var(--accent-ink)" : "var(--ink)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {p.label}
      </span>
    </div>
  );
}

function FragmentLabel({ frag }: { frag: SeqFragment }) {
  return (
    <div
      style={{
        position: "absolute",
        left: frag.x,
        top: frag.y - 9,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        maxWidth: frag.w,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          font: "600 8.5px 'IBM Plex Mono'",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--bg)",
          background: "var(--ter)",
          padding: "2px 6px",
          borderRadius: 4,
        }}
      >
        {frag.op}
      </span>
      <span
        title={frag.label}
        style={{
          font: "400 10.5px 'IBM Plex Sans'",
          fontStyle: "italic",
          color: "var(--sub)",
          background: "var(--surface)",
          padding: "1px 6px",
          borderRadius: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        [{frag.label}]
      </span>
    </div>
  );
}
