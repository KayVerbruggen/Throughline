import { useMemo, useState } from "react";

import { layoutStructure, type LaidOutNode } from "../../model/layout";
import { useStore } from "../../state/store";
import type { Component } from "../../types";

/** Stable hue per component id, for the node dot. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function StructureView() {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => layoutStructure(project), [project]);
  const byId = useMemo(() => {
    const m = new Map<string, Component>();
    for (const c of project.components) m.set(c.id, c);
    return m;
  }, [project.components]);

  // Which edges touch the hovered node — highlight them and their endpoints.
  const activeIds = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    for (const e of layout.edges) {
      if (e.a === hover) set.add(e.b);
      if (e.b === hover) set.add(e.a);
    }
    return set;
  }, [hover, layout.edges]);

  if (project.components.length === 0) {
    return (
      <div style={{ padding: "6px 26px 48px" }}>
        <Intro />
        <div style={{ font: "400 13px 'IBM Plex Sans'", color: "var(--faint)", padding: "20px 2px" }}>
          No components yet. Add one with “New Component”, or assign an activity to a component from a
          flow in System Behavior.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "6px 26px 48px" }}>
      <Intro />
      <div style={{ overflow: "auto", paddingBottom: 12 }}>
        <div
          style={{
            position: "relative",
            width: layout.width,
            height: layout.height,
            minWidth: "100%",
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
          >
            {layout.edges.map((e, i) => {
              const active = activeIds != null && activeIds.has(e.a) && activeIds.has(e.b);
              const dim = activeIds != null && !active;
              return (
                <path
                  key={i}
                  d={e.d}
                  fill="none"
                  stroke={active ? "var(--accent)" : "rgba(var(--line),.2)"}
                  strokeWidth={active ? 2 : 1.3}
                  opacity={dim ? 0.25 : 1}
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => {
            const comp = byId.get(n.id);
            if (!comp) return null;
            return (
              <Node
                key={n.id}
                node={n}
                component={comp}
                dim={activeIds != null && !activeIds.has(n.id)}
                highlight={activeIds != null && activeIds.has(n.id)}
                onEnter={() => setHover(n.id)}
                onLeave={() => setHover(null)}
                onClick={() => select("component", n.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <p style={{ margin: "0 0 20px", font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--sub)", maxWidth: 640 }}>
      Nodes are system components. A line connects two components whenever one's activity runs
      immediately before the other's within a flow on the System Behavior page — meaning they must
      communicate. The diagram is derived from the flows, so it can never drift out of sync.
    </p>
  );
}

function Node({
  node,
  component,
  dim,
  highlight,
  onEnter,
  onLeave,
  onClick,
}: {
  node: LaidOutNode;
  component: Component;
  dim: boolean;
  highlight: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const hue = hueOf(component.id);
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        border: `1px solid ${highlight ? "var(--accent)" : "rgba(var(--line),.11)"}`,
        borderRadius: 11,
        background: "var(--surface)",
        boxShadow: highlight ? "0 2px 12px rgba(var(--line),.1)" : "0 1px 3px rgba(var(--line),.05)",
        padding: "12px 14px",
        cursor: "pointer",
        opacity: dim ? 0.4 : 1,
        transition: "opacity .15s ease, border-color .15s ease, box-shadow .15s ease",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flex: "none",
            background: `oklch(0.62 0.14 ${hue})`,
          }}
        />
        <span
          style={{
            font: "500 13.5px 'IBM Plex Sans'",
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {component.title}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ font: "400 10.5px 'IBM Plex Mono'", color: "var(--faint)" }}>
          {component.activities.length} act
        </span>
      </div>
      <div
        style={{
          font: "400 12px/1.45 'IBM Plex Sans'",
          color: "var(--sub)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {component.description || "No description."}
      </div>
    </div>
  );
}
