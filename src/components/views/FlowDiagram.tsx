import { useMemo } from "react";

import {
  DIAGRAM_ARROW_LEN,
  deriveActivityDiagram,
  type ActivityDiagram,
  type DiagramEdge,
  type DiagramNode,
} from "../../model/activityDiagram";
import { useStore } from "../../state/store";
import type { Flow } from "../../types";

// The guarded transitions are the interesting edges; colour them with the same
// amber the Behaviour view uses for alternate paths so the diagram and the step
// list read as one story. The sequential spine stays neutral.
const ALT_ACCENT = "oklch(0.62 0.13 70)";

/** Stable hue per component id, matching the Structure view's node dots. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/**
 * The activity diagram for one flow — the "Diagram" alternate of the Behaviour
 * view's step list. Nodes are activities, edges are control flow, and a guarded
 * branch is labelled with its guard. Reads only guards, never effects.
 */
export function FlowDiagram({ flow }: { flow: Flow }) {
  const project = useStore((s) => s.project);
  const diagram = useMemo<ActivityDiagram>(
    () => deriveActivityDiagram(project, flow),
    [project, flow],
  );

  if (diagram.empty) {
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
        {flow.id} has no steps yet. Add activities on the Steps view and they'll appear here.
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto", paddingBottom: 12 }}>
      <div style={{ position: "relative", width: diagram.width, height: diagram.height, minWidth: "100%" }}>
        <svg
          width={diagram.width}
          height={diagram.height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          <defs>
            <ArrowMarker id="diagram-arrow-seq" fill="rgba(var(--line),.5)" />
            <ArrowMarker id="diagram-arrow-alt" fill={ALT_ACCENT} />
          </defs>
          {diagram.edges.map((e, i) => (
            <Edge key={`${e.from}-${e.to}-${i}`} edge={e} />
          ))}
        </svg>

        {/* Edge labels (guards) as positioned chips over the SVG. */}
        {diagram.edges.map((e, i) => (e.label ? <EdgeLabel key={`l-${i}`} edge={e} /> : null))}

        {diagram.nodes.map((n) => (
          <Node key={n.id} node={n} />
        ))}
      </div>
    </div>
  );
}

function ArrowMarker({ id, fill }: { id: string; fill: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={0}
      refY={5}
      markerUnits="userSpaceOnUse"
      markerWidth={DIAGRAM_ARROW_LEN + 1}
      markerHeight={DIAGRAM_ARROW_LEN + 1}
      orient="auto-start-reverse"
    >
      <path d={`M0 1.5 L${DIAGRAM_ARROW_LEN} 5 L0 8.5 z`} fill={fill} />
    </marker>
  );
}

function Edge({ edge }: { edge: DiagramEdge }) {
  const alt = edge.kind !== "seq";
  return (
    <path
      d={edge.d}
      fill="none"
      stroke={alt ? ALT_ACCENT : "rgba(var(--line),.45)"}
      strokeWidth={alt ? 1.8 : 1.5}
      strokeDasharray={edge.kind === "rejoin" ? "5 4" : undefined}
      markerEnd={`url(#${alt ? "diagram-arrow-alt" : "diagram-arrow-seq"})`}
    />
  );
}

function EdgeLabel({ edge }: { edge: DiagramEdge }) {
  return (
    <div
      title={edge.formal ? "Guard" : "Condition (not yet formalised)"}
      style={{
        position: "absolute",
        left: edge.labelX,
        top: edge.labelY,
        transform: "translate(-50%, -50%)",
        maxWidth: 210,
        padding: "2px 7px",
        borderRadius: 6,
        background: "var(--surface)",
        border: `1px solid ${edge.formal ? "rgba(var(--line),.14)" : "rgba(var(--line),.1)"}`,
        font: `400 10.5px ${edge.formal ? "'IBM Plex Mono'" : "'IBM Plex Sans'"}`,
        fontStyle: edge.formal ? "normal" : "italic",
        color: edge.formal ? "oklch(0.5 0.11 62)" : "var(--ter)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      }}
    >
      {edge.label}
    </div>
  );
}

function Node({ node }: { node: DiagramNode }) {
  if (node.kind !== "activity") {
    // Start / End caps.
    const isStart = node.kind === "start";
    return (
      <div
        style={{
          position: "absolute",
          left: node.x,
          top: node.y,
          width: node.w,
          height: node.h,
          borderRadius: node.h / 2,
          background: isStart ? "var(--ink)" : "var(--surface)",
          border: isStart ? "none" : "1.5px solid rgba(var(--line),.3)",
          color: isStart ? "var(--bg)" : "var(--sub)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "500 11px 'IBM Plex Mono'",
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        {node.label}
      </div>
    );
  }

  const hue = node.componentId != null ? hueOf(node.componentId) : 250;
  return (
    <div
      title={node.label}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        border: "1px solid rgba(var(--line),.12)",
        borderLeft: `3px solid oklch(0.62 0.14 ${hue})`,
        borderRadius: 10,
        background: "var(--surface)",
        boxShadow: "0 1px 3px rgba(var(--line),.05)",
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: "500 13px 'IBM Plex Sans'",
          color: "var(--ink)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {node.label}
      </span>
    </div>
  );
}
