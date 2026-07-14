import { useEffect, useMemo } from "react";

import { flowOfUseCase } from "../../model/behavior";
import {
  CHART_ARROW_LEN,
  deriveStateChart,
  type ChartEdge,
  type ChartNode,
  type StateChart,
} from "../../model/statechart";
import { useStore } from "../../state/store";
import type { UseCase } from "../../types";

// The guarded transitions are the interesting edges; colour them with the same
// amber the Behaviour view uses for alternate paths so the two views read as one
// story. Sequential spine stays neutral.
const ALT_ACCENT = "oklch(0.62 0.13 70)";

/** Stable hue per component id, matching the Structure view's node dots. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function StateChartView() {
  const project = useStore((s) => s.project);
  // Share the Behaviour view's selected use case, so switching between the two
  // keeps you on the same flow.
  const ucId = useStore((s) => s.prefs.behaviorUseCase);
  const setPrefs = useStore((s) => s.setPrefs);
  const setUcId = (behaviorUseCase: string | null) => setPrefs({ behaviorUseCase });

  useEffect(() => {
    if (project.useCases.length === 0) {
      if (ucId !== null) setUcId(null);
      return;
    }
    if (!ucId || !project.useCases.some((u) => u.id === ucId)) {
      setUcId(project.useCases[0].id);
    }
  }, [project.useCases, ucId]);

  const uc = project.useCases.find((u) => u.id === ucId) ?? null;

  if (project.useCases.length === 0) {
    return (
      <div style={{ padding: "20px 26px" }}>
        <p style={{ font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--faint)" }}>
          No use cases yet. A state chart is derived from a use case's flow — add one in the Use Cases
          view first.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 26px 64px" }}>
      <p style={{ margin: "0 0 16px", font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--sub)", maxWidth: 680 }}>
        The state machine implied by this flow: each activity is a state, edges follow the happy path
        and each branch's <em>after</em>/<em>rejoin</em>, and a guarded branch is labelled with its
        guard. Derived from the flow's control-points and Stage-0 guards alone — activities need no
        effects to appear here.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {project.useCases.map((u) => (
          <UcTab key={u.id} uc={u} active={u.id === ucId} onClick={() => setUcId(u.id)} />
        ))}
      </div>

      {uc ? <ChartPanel uc={uc} /> : null}
    </div>
  );
}

function UcTab({ uc, active, onClick }: { uc: UseCase; active: boolean; onClick: () => void }) {
  const project = useStore((s) => s.project);
  const hasFlow = flowOfUseCase(project, uc) != null;
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 13px",
        border: `1px solid ${active ? "var(--accent)" : "rgba(var(--line),.12)"}`,
        borderRadius: 9,
        background: active ? "var(--accent-bg)" : "var(--surface)",
        color: active ? "var(--accent-ink)" : "var(--sub)",
        font: `${active ? 500 : 400} 12.5px 'IBM Plex Sans'`,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: hasFlow ? "oklch(0.62 0.14 150)" : "var(--faint)",
        }}
      />
      <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11.5 }}>{uc.id}</span>
      {uc.title}
    </button>
  );
}

function ChartPanel({ uc }: { uc: UseCase }) {
  const project = useStore((s) => s.project);
  const flow = flowOfUseCase(project, uc);
  const chart = useMemo<StateChart | null>(
    () => (flow ? deriveStateChart(project, flow) : null),
    [project, flow],
  );

  if (!flow || !chart) {
    return (
      <Empty>
        No flow yet for {uc.id}. Model its activities in the System Behavior view and the chart will
        appear here.
      </Empty>
    );
  }
  if (chart.empty) {
    return (
      <Empty>
        {flow.id} has no steps yet. Add activities to its happy path in the System Behavior view.
      </Empty>
    );
  }

  return (
    <div style={{ overflow: "auto", paddingBottom: 12 }}>
      <div style={{ position: "relative", width: chart.width, height: chart.height, minWidth: "100%" }}>
        <svg
          width={chart.width}
          height={chart.height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          <defs>
            <ArrowMarker id="chart-arrow-seq" fill="rgba(var(--line),.5)" />
            <ArrowMarker id="chart-arrow-alt" fill={ALT_ACCENT} />
          </defs>
          {chart.edges.map((e, i) => (
            <Edge key={`${e.from}-${e.to}-${i}`} edge={e} />
          ))}
        </svg>

        {/* Edge labels (guards) as positioned chips over the SVG. */}
        {chart.edges.map((e, i) =>
          e.label ? <EdgeLabel key={`l-${i}`} edge={e} /> : null,
        )}

        {chart.nodes.map((n) => (
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
      markerWidth={CHART_ARROW_LEN + 1}
      markerHeight={CHART_ARROW_LEN + 1}
      orient="auto-start-reverse"
    >
      <path d={`M0 1.5 L${CHART_ARROW_LEN} 5 L0 8.5 z`} fill={fill} />
    </marker>
  );
}

function Edge({ edge }: { edge: ChartEdge }) {
  const alt = edge.kind !== "seq";
  return (
    <path
      d={edge.d}
      fill="none"
      stroke={alt ? ALT_ACCENT : "rgba(var(--line),.45)"}
      strokeWidth={alt ? 1.8 : 1.5}
      strokeDasharray={edge.kind === "rejoin" ? "5 4" : undefined}
      markerEnd={`url(#${alt ? "chart-arrow-alt" : "chart-arrow-seq"})`}
    />
  );
}

function EdgeLabel({ edge }: { edge: ChartEdge }) {
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

function Node({ node }: { node: ChartNode }) {
  const select = useStore((s) => s.select);

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
      onClick={() => node.componentId && select("component", node.componentId)}
      title={node.componentId ? "Open the owning component" : undefined}
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
        cursor: node.componentId ? "pointer" : "default",
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

function Empty({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  );
}
