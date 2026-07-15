import { useMemo, useState } from "react";

import { ancestorChain } from "../../model/hierarchy";
import { layoutNested, layoutTree, type LaidOutNode, type StructureLayout } from "../../model/layout";
import {
  useStore,
  type StructureLayoutMode as LayoutMode,
  type StructureOverlay as Overlay,
} from "../../state/store";
import type { Component } from "../../types";
import { Icon } from "../icons";

/** Stable hue per component id, for the node dot. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

// Layout mode ("tree" | "nested") sets how nodes are placed; the hierarchy is
// always the backbone (tree links / nested containment). A single overlay
// ("none" | "connections" | "dependencies") is drawn on top — never two at once,
// so the diagram can't clutter. Both are persisted — see ViewPrefs in the store.

export function StructureView() {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const addComponent = useStore((s) => s.addComponent);
  const mode = useStore((s) => s.prefs.structureLayout);
  const overlay = useStore((s) => s.prefs.structureOverlay);
  const setPrefs = useStore((s) => s.setPrefs);
  const setMode = (structureLayout: LayoutMode) => setPrefs({ structureLayout });
  const setOverlay = (structureOverlay: Overlay) => setPrefs({ structureOverlay });
  const [hover, setHover] = useState<string | null>(null);
  // Drill-down root: "" = whole project, else show only this component + subtree.
  const [focus, setFocus] = useState<string>("");

  // Ignore a stale focus (e.g. the focused component was deleted).
  const focusChain = useMemo(() => ancestorChain(project, focus), [project, focus]);
  const effFocus = focusChain.length ? focus : "";

  const layout = useMemo<StructureLayout>(
    () => (mode === "tree" ? layoutTree(project, effFocus) : layoutNested(project, effFocus)),
    [project, mode, effFocus],
  );
  const byId = useMemo(() => {
    const m = new Map<string, Component>();
    for (const c of project.components) m.set(c.id, c);
    return m;
  }, [project.components]);

  const showConn = overlay === "connections";
  const showDeps = overlay === "dependencies";

  // Which components are touched by the hovered node through the active overlay —
  // highlight them and the arcs between them, dim the rest. Nothing to highlight
  // when the overlay is "none".
  const activeIds = useMemo(() => {
    if (!hover || overlay === "none") return null;
    const set = new Set<string>([hover]);
    if (showConn) {
      for (const e of layout.connEdges) {
        if (e.a === hover) set.add(e.b);
        if (e.b === hover) set.add(e.a);
      }
    } else {
      for (const e of layout.usesEdges) {
        if (e.from === hover) set.add(e.to);
        if (e.to === hover) set.add(e.from);
      }
    }
    return set;
  }, [hover, overlay, showConn, layout.connEdges, layout.usesEdges]);

  if (project.components.length === 0) {
    return (
      <div style={{ padding: "6px 26px 48px" }}>
        <Intro />
        <div style={{ font: "400 13px 'IBM Plex Sans'", color: "var(--faint)", padding: "20px 2px" }}>
          No components yet. Add one below with “+ Add top-level component”, use “New Component” in the
          header, or assign an activity to a component from a flow in System Behavior.
        </div>
        <div style={{ paddingTop: 14 }}>
          <AddButton label="+ Add top-level component" onClick={() => void addComponent("")} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "6px 26px 48px" }}>
      <Intro />
      <Controls
        mode={mode}
        overlay={overlay}
        focused={effFocus !== ""}
        onMode={setMode}
        onOverlay={setOverlay}
        onAdd={() => void addComponent(effFocus)}
      />
      <Breadcrumb chain={focusChain} byId={byId} onNavigate={setFocus} />
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
            {/* Hierarchy links — the always-on backbone in tree mode (nested
                shows the same relationship by containment). Solid, arrow-headed,
                parent → child. */}
            {mode === "tree" && (
              <>
                <defs>
                  {/* Base at the path endpoint (refX 0), tip 9px forward — the
                      curve stops at the arrowhead's base, the arrow fills the
                      rest. markerUnits userSpaceOnUse keeps it a fixed size. */}
                  <marker
                    id="tl-arrow"
                    viewBox="0 0 10 10"
                    refX={0}
                    refY={5}
                    markerUnits="userSpaceOnUse"
                    markerWidth={10}
                    markerHeight={10}
                    orient="auto-start-reverse"
                  >
                    <path d="M0 1.5 L9 5 L0 8.5 z" fill="rgba(var(--line),.5)" />
                  </marker>
                </defs>
                {layout.hierEdges.map((e, i) => {
                  const dim = activeIds != null && !(activeIds.has(e.parent) && activeIds.has(e.child));
                  return (
                    <path
                      key={`h-${i}`}
                      d={e.d}
                      fill="none"
                      stroke="rgba(var(--line),.4)"
                      strokeWidth={1.5}
                      markerEnd="url(#tl-arrow)"
                      opacity={dim ? 0.25 : 1}
                    />
                  );
                })}
              </>
            )}

            {/* Connection arcs — derived from flows. Dashed + accent so they read
                as a different kind of relationship from the hierarchy. */}
            {showConn &&
              layout.connEdges.map((e, i) => {
                const active = activeIds != null && activeIds.has(e.a) && activeIds.has(e.b);
                const dim = activeIds != null && !active;
                return (
                  <path
                    key={`c-${i}`}
                    d={e.d}
                    fill="none"
                    stroke={active ? "var(--accent)" : "rgba(var(--line),.32)"}
                    strokeWidth={active ? 2 : 1.3}
                    strokeDasharray="4 4"
                    opacity={dim ? 0.2 : 1}
                  />
                );
              })}

            {/* Dependency arcs — authored static "uses" edges. Directed (arrow-
                headed) + dotted, so they read as distinct from both the solid
                hierarchy backbone and the dashed flow connections. */}
            {showDeps && (
              <>
                <defs>
                  <DepArrow id="tl-dep-arrow" fill="rgba(var(--line),.5)" />
                  <DepArrow id="tl-dep-arrow-active" fill="var(--accent)" />
                </defs>
                {layout.usesEdges.map((e, i) => {
                  const active = activeIds != null && activeIds.has(e.from) && activeIds.has(e.to);
                  const dim = activeIds != null && !active;
                  return (
                    <path
                      key={`u-${i}`}
                      d={e.d}
                      fill="none"
                      stroke={active ? "var(--accent)" : "rgba(var(--line),.42)"}
                      strokeWidth={active ? 2 : 1.4}
                      strokeDasharray="1.5 4"
                      strokeLinecap="round"
                      markerEnd={`url(#tl-dep-arrow${active ? "-active" : ""})`}
                      opacity={dim ? 0.2 : 1}
                    />
                  );
                })}
              </>
            )}
          </svg>

          {layout.nodes.map((n) => {
            const comp = byId.get(n.id);
            if (!comp) return null;
            return (
              <Node
                key={n.id}
                node={n}
                component={comp}
                nested={mode === "nested"}
                // Don't offer "jump into" on the node you're already focused on.
                canFocus={n.container && n.id !== effFocus}
                dim={activeIds != null && !activeIds.has(n.id)}
                highlight={activeIds != null && activeIds.has(n.id)}
                onEnter={() => setHover(n.id)}
                onLeave={() => setHover(null)}
                onClick={() => select("component", n.id)}
                onAddChild={() => void addComponent(n.id)}
                onFocus={() => setFocus(n.id)}
              />
            );
          })}
        </div>
      </div>
      <div style={{ paddingTop: 6 }}>
        <AddButton
          label={effFocus ? "+ Add sub-component here" : "+ Add top-level component"}
          onClick={() => void addComponent(effFocus)}
        />
      </div>
    </div>
  );
}

/** Arrowhead for the directed dependency arcs. Geometry matches USES_ARROW_LEN
 *  in layout.ts (the arc stops one arrow-length outside the target node, so the
 *  arrow — pointing forward along the path into the node — lands on its edge). */
function DepArrow({ id, fill }: { id: string; fill: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={0}
      refY={5}
      markerUnits="userSpaceOnUse"
      markerWidth={10}
      markerHeight={10}
      orient="auto"
    >
      <path d="M0 1.5 L9 5 L0 8.5 z" fill={fill} />
    </marker>
  );
}

function Intro() {
  return (
    <p style={{ margin: "0 0 16px", font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--sub)", maxWidth: 680 }}>
      Components arranged by hierarchy — the parts each one is composed of (solid arrows, or nesting).
      Over that backbone you can overlay one relationship at a time: <em>Connections</em>, the dashed
      links derived from flows whenever two components’ activities run back-to-back; or
      <em> Dependencies</em>, the dotted directed arrows you author on a component (“Depends on”) to
      record a static uses/imports edge that no flow would reveal. Add sub-components in place with the
      “+” on any block.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function Controls({
  mode,
  overlay,
  focused,
  onMode,
  onOverlay,
  onAdd,
}: {
  mode: LayoutMode;
  overlay: Overlay;
  focused: boolean;
  onMode: (m: LayoutMode) => void;
  onOverlay: (o: Overlay) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
      <ControlGroup label="Layout">
        <Segmented<LayoutMode>
          value={mode}
          onChange={onMode}
          options={[
            { value: "tree", label: "Tree" },
            { value: "nested", label: "Nested" },
          ]}
        />
      </ControlGroup>
      <ControlGroup label="Overlay">
        <Segmented<Overlay>
          value={overlay}
          onChange={onOverlay}
          options={[
            { value: "none", label: "None" },
            { value: "connections", label: "Connections" },
            { value: "dependencies", label: "Dependencies" },
          ]}
        />
      </ControlGroup>
      <div style={{ flex: 1 }} />
      <AddButton label={focused ? "+ Add sub-component here" : "+ Add top-level component"} onClick={onAdd} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb (drill-down location)
// ---------------------------------------------------------------------------

function Breadcrumb({
  chain,
  byId,
  onNavigate,
}: {
  chain: string[];
  byId: Map<string, Component>;
  onNavigate: (id: string) => void;
}) {
  // Root is always present; the chain (top-ancestor … focus) follows it. When
  // not drilled in it's just "Root", which doubles as the reset target.
  const crumbs = [
    { id: "", label: "Root" },
    ...chain.map((id) => ({ id, label: byId.get(id)?.title ?? id })),
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
        marginBottom: 14,
        font: "500 12.5px 'IBM Plex Sans'",
      }}
    >
      {crumbs.map((c, i) => {
        const current = i === crumbs.length - 1;
        return (
          <span key={c.id || "root"} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 && (
              <span style={{ color: "var(--faint)", font: "400 12px 'IBM Plex Sans'" }}>›</span>
            )}
            <button
              onClick={() => !current && onNavigate(c.id)}
              disabled={current}
              title={current ? "Current view" : `Jump to ${c.label}`}
              style={{
                padding: "3px 8px",
                border: "none",
                borderRadius: 6,
                cursor: current ? "default" : "pointer",
                background: current ? "var(--accent-bg)" : "transparent",
                color: current ? "var(--accent-ink)" : "var(--sub)",
                font: "inherit",
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span
        style={{
          font: "500 9.5px 'IBM Plex Mono'",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--ter)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        gap: 2,
        border: "1px solid rgba(var(--line),.11)",
        borderRadius: 8,
        background: "var(--surface2)",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: "5px 11px",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              font: "500 12px 'IBM Plex Sans'",
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--ink)" : "var(--sub)",
              boxShadow: on ? "0 1px 2px rgba(var(--line),.08)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "6px 12px",
        border: "1px dashed rgba(var(--line),.2)",
        borderRadius: 8,
        background: hover ? "rgba(var(--line),.035)" : "transparent",
        color: "var(--sub)",
        font: "500 12px 'IBM Plex Sans'",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

function Node({
  node,
  component,
  nested,
  canFocus,
  dim,
  highlight,
  onEnter,
  onLeave,
  onClick,
  onAddChild,
  onFocus,
}: {
  node: LaidOutNode;
  component: Component;
  nested: boolean;
  canFocus: boolean;
  dim: boolean;
  highlight: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
  onAddChild: () => void;
  onFocus: () => void;
}) {
  const hue = hueOf(component.id);
  const isContainer = nested && node.container;

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
        // Nested containers get a subtle tint that deepens with depth so the
        // "blocks within blocks" nesting reads clearly.
        background: isContainer ? containerTint(node.depth) : "var(--surface)",
        boxShadow: highlight ? "0 2px 12px rgba(var(--line),.1)" : "0 1px 3px rgba(var(--line),.05)",
        padding: isContainer ? 0 : "12px 14px",
        cursor: "pointer",
        opacity: dim ? 0.4 : 1,
        transition: "opacity .15s ease, border-color .15s ease, box-shadow .15s ease",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        zIndex: node.depth + 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: isContainer ? "center" : "flex-start",
          gap: 9,
          padding: isContainer ? "0 12px" : 0,
          marginBottom: isContainer ? 0 : 7,
          height: isContainer ? node.headerH : "auto",
          flex: "none",
          borderBottom: isContainer ? "1px solid rgba(var(--line),.09)" : "none",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flex: "none",
            marginTop: isContainer ? 0 : 4,
            background: `oklch(0.62 0.14 ${hue})`,
          }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            font: "500 14.5px 'IBM Plex Sans'",
            color: "var(--ink)",
            overflow: "hidden",
            // Container titles are a single-line header; leaf titles may wrap to
            // two lines so long names stay readable instead of truncating early.
            ...(isContainer
              ? { whiteSpace: "nowrap", textOverflow: "ellipsis" }
              : {
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  lineHeight: 1.25,
                }),
          }}
        >
          {component.title}
        </span>
        {canFocus && <JumpButton onClick={onFocus} />}
        <AddChildButton onClick={onAddChild} />
      </div>
      {!isContainer && (
        <div
          style={{
            marginTop: 2,
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
      )}
    </div>
  );
}

/** Container fill that gets a touch darker at each nesting level. */
function containerTint(depth: number): string {
  const l = Math.max(0.2, 0.14 - depth * 0.015);
  return `rgba(var(--line),${l.toFixed(3)})`;
}

/** "Jump into" — drill the view down to this component's subtree. */
function JumpButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Jump into — show only this component and its sub-components"
      style={{
        flex: "none",
        width: 28,
        height: 28,
        border: `1px solid ${hover ? "transparent" : "rgba(var(--line),.14)"}`,
        borderRadius: 7,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover ? "var(--accent-bg)" : "var(--surface)",
        color: hover ? "var(--accent-ink)" : "var(--sub)",
      }}
    >
      <Icon name="focus" size={16} color={hover ? "var(--accent-ink)" : "var(--sub)"} />
    </button>
  );
}

function AddChildButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Add a sub-component"
      style={{
        flex: "none",
        width: 28,
        height: 28,
        border: `1px solid ${hover ? "transparent" : "rgba(var(--line),.14)"}`,
        borderRadius: 7,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover ? "var(--accent-bg)" : "var(--surface)",
        color: hover ? "var(--accent-ink)" : "var(--sub)",
      }}
    >
      <Icon name="plus" size={17} color={hover ? "var(--accent-ink)" : "var(--sub)"} />
    </button>
  );
}
