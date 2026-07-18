import { useEffect, useMemo, useState } from "react";

import {
  DIAGRAM_ARROW_LEN,
  deriveActivityDiagram,
  type ActivityDiagram,
  type DiagramEdge,
  type DiagramNode,
} from "../../model/activityDiagram";
import {
  advance,
  autoStep,
  autoTransition,
  callStack,
  displayNodeId,
  initExec,
  initialValuation,
  isDecisionPoint,
  outgoing,
  variableRows,
  type ExecState,
  type Transition,
  type Valuation,
  type Value,
  type VariableRow,
} from "../../model/interpret";
import { useCaseOfFlow } from "../../model/behavior";
import { useStore } from "../../state/store";
import type { Flow, Project } from "../../types";
import { Icon } from "../icons";

// The guarded transitions are the interesting edges; colour them with the same
// amber the Behaviour view uses for alternate paths. The sequential spine stays
// neutral. A live run highlights the current node and last-taken edge in accent.
const ALT_ACCENT = "oklch(0.62 0.13 70)";

/** Stable hue per component id, matching the Structure view's node dots. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

interface RunHandle {
  exec: ExecState;
  /** Node the token left on the last advance, for edge highlighting. Held as a
   *  *displayed* node id, so a step taken inside a callee (which draws no edge
   *  in this flow's diagram) simply highlights nothing. */
  prev: string | null;
  /** Valuation before the last advance, to flag which variables just changed. */
  prevVal: Valuation | null;
}

/**
 * The activity diagram for one flow, plus an in-place interpreter: press Run to
 * walk the token through it, applying effects and evaluating guards.
 *
 * `interactive` (the default) shows the Run controls and the live/setup state
 * table above the graph — that's the behaviour view's Run mode. Passing
 * `interactive={false}` renders just the graph as a static structural reference
 * (Diagram mode).
 */
export function FlowDiagram({ flow, interactive = true }: { flow: Flow; interactive?: boolean }) {
  const project = useStore((s) => s.project);
  const diagram = useMemo<ActivityDiagram>(
    () => deriveActivityDiagram(project, flow),
    [project, flow],
  );

  const [run, setRun] = useState<RunHandle | null>(null);
  const [playing, setPlaying] = useState(false);

  // Ephemeral starting values, keyed canonically, that override each variable's
  // declared `initial` for this run only — the knob that lets a reader flip
  // `dirty` to true and drive the other branch without editing the model.
  const [overrides, setOverrides] = useState<Valuation>(new Map());

  // Editing the flow's structure invalidates a running token (node ids shift),
  // so end any run when the flow changes; drop the sim overrides with it.
  useEffect(() => {
    setRun(null);
    setPlaying(false);
    setOverrides(new Map());
  }, [flow]);

  // The starting valuation the setup table shows: declared initials, overlaid
  // with whatever the reader has changed.
  const setupRows = useMemo<VariableRow[]>(() => {
    const val = initialValuation(project);
    for (const [k, v] of overrides) val.set(k, v);
    return variableRows(project, val);
  }, [project, overrides]);

  const choices = useMemo<Transition[]>(
    () => (run && !run.exec.done ? outgoing(project, flow, run.exec) : []),
    [run, project, flow],
  );
  const auto = useMemo(() => autoTransition(choices), [choices]);

  const start = () => setRun({ exec: initExec(project, flow, overrides), prev: null, prevVal: null });
  const editVar = (key: string, value: Value) =>
    setOverrides((m) => new Map(m).set(key, value));
  const step = (t?: Transition) => {
    setRun((r) => {
      if (!r || r.exec.done) return r;
      const chosen = t ?? autoTransition(outgoing(project, flow, r.exec));
      if (!chosen) return { ...r, exec: { ...r.exec, done: true } };
      return {
        exec: advance(project, flow, r.exec, chosen),
        prev: displayNodeId(r.exec),
        prevVal: r.exec.valuation,
      };
    });
  };
  const reset = () => {
    setPlaying(false);
    setRun({ exec: initExec(project, flow, overrides), prev: null, prevVal: null });
  };
  const exit = () => {
    setPlaying(false);
    setRun(null);
  };

  // Auto-play: advance on a timer until the token reaches End. Hold at an
  // unresolved fork (guards don't force a single path) so the user picks the
  // branch; choosing advances the token and this effect resumes the timer.
  useEffect(() => {
    if (!playing || !run) return;
    if (run.exec.done) {
      setPlaying(false);
      return;
    }
    if (isDecisionPoint(outgoing(project, flow, run.exec))) return;
    const id = setTimeout(() => {
      setRun((r) => {
        if (!r || r.exec.done) return r;
        return {
          exec: autoStep(project, flow, r.exec),
          prev: displayNodeId(r.exec),
          prevVal: r.exec.valuation,
        };
      });
    }, 750);
    return () => clearTimeout(id);
  }, [playing, run, project, flow]);

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
        {flow.id} has no steps yet. Add activities on the left and they'll appear here.
      </div>
    );
  }

  // While the token is inside a callee it has no node in *this* diagram, so the
  // caller's call node stays lit — the run panel's breadcrumb says where it
  // really is.
  const currentId = run ? displayNodeId(run.exec) : null;
  const activeEdge = run?.prev != null && currentId != null ? { from: run.prev, to: currentId } : null;
  const changed = run?.prevVal
    ? new Set(
        [...run.exec.valuation.entries()]
          .filter(([k, v]) => run.prevVal!.get(k) !== v)
          .map(([k]) => k),
      )
    : new Set<string>();

  const graph = (
    <div style={{ position: "relative", width: diagram.width, height: diagram.height, minWidth: "100%" }}>
      <svg
        width={diagram.width}
        height={diagram.height}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
      >
        <defs>
          <ArrowMarker id="diagram-arrow-seq" fill="rgba(var(--line),.5)" />
          <ArrowMarker id="diagram-arrow-alt" fill={ALT_ACCENT} />
          <ArrowMarker id="diagram-arrow-active" fill="var(--accent)" />
        </defs>
        {diagram.edges.map((e, i) => (
          <Edge
            key={`${e.from}-${e.to}-${i}`}
            edge={e}
            active={!!activeEdge && activeEdge.from === e.from && activeEdge.to === e.to}
          />
        ))}
      </svg>

      {diagram.edges.map((e, i) => (e.label ? <EdgeLabel key={`l-${i}`} edge={e} /> : null))}

      {diagram.nodes.map((n) => (
        <Node key={n.id} node={n} current={n.id === currentId} dim={run != null && n.id !== currentId} />
      ))}
    </div>
  );

  // Diagram mode: just the graph.
  if (!interactive) {
    return <div style={{ overflow: "auto", paddingBottom: 12 }}>{graph}</div>;
  }

  // Run mode: the activity diagram is a tall, narrow vertical spine, so the run
  // controls and state table sit in a sticky column *beside* it rather than
  // stacked above — that fills the space to the diagram's right and keeps the
  // starting-state knobs in view while the token walks down a long flow.
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 440px", minWidth: 0, overflow: "auto", paddingBottom: 12 }}>{graph}</div>
      <div
        style={{
          flex: "1 1 360px",
          minWidth: 300,
          maxWidth: 560,
          position: "sticky",
          top: 4,
          alignSelf: "flex-start",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <RunBar
          running={run != null}
          playing={playing}
          done={run?.exec.done ?? false}
          onRun={start}
          onPlay={() => setPlaying((p) => !p)}
          onStep={() => step()}
          onReset={reset}
          onExit={exit}
        />

        {run ? (
          <RunState
            exec={run.exec}
            choices={choices}
            auto={auto}
            changed={changed}
            onChoose={(t) => step(t)}
          />
        ) : (
          <SetupState rows={setupRows} onEdit={editVar} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run controls + state
// ---------------------------------------------------------------------------

function RunBar({
  running,
  playing,
  done,
  onRun,
  onPlay,
  onStep,
  onReset,
  onExit,
}: {
  running: boolean;
  playing: boolean;
  done: boolean;
  onRun: () => void;
  onPlay: () => void;
  onStep: () => void;
  onReset: () => void;
  onExit: () => void;
}) {
  if (!running) {
    return (
      <div style={{ display: "flex", marginBottom: 12 }}>
        <BarButton onClick={onRun} primary>
          ▶ Run
        </BarButton>
        <span style={{ flex: 1, alignSelf: "center", marginLeft: 10, font: "400 11px 'IBM Plex Sans'", color: "var(--faint)" }}>
          Walk the token through — applies effects, evaluates guards.
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
      <BarButton onClick={onPlay} primary disabled={done}>
        {playing ? "⏸ Pause" : "▶ Play"}
      </BarButton>
      <BarButton onClick={onStep} disabled={done || playing}>
        Step
      </BarButton>
      <BarButton onClick={onReset}>Reset</BarButton>
      <BarButton onClick={onExit}>Exit</BarButton>
    </div>
  );
}

function BarButton({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 13px",
        border: primary ? "none" : "1px solid rgba(var(--line),.14)",
        borderRadius: 8,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: primary ? "var(--ink)" : "var(--surface)",
        color: primary ? "var(--bg)" : "var(--sub)",
        font: "500 12.5px 'IBM Plex Sans'",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function RunState({
  exec,
  choices,
  auto,
  changed,
  onChoose,
}: {
  exec: ExecState;
  choices: Transition[];
  auto: Transition | null;
  changed: Set<string>;
  onChoose: (t: Transition) => void;
}) {
  const project = useStore((s) => s.project);
  const rows = variableRows(project, exec.valuation);

  return (
    <div
      style={{
        border: "1px solid rgba(var(--line),.1)",
        borderRadius: 10,
        background: "var(--surface2)",
        padding: "11px 13px",
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Where the token actually is, once it has descended into a subflow. */}
      <CallStackTrail exec={exec} project={project} />

      {/* Live valuation: the current value of every variable, changed ones lit. */}
      <VariableTable rows={rows} changed={changed} />

      {/* Branch choices when the token is at a decision with more than one path. */}
      {!exec.done && choices.length > 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ font: "500 9.5px 'IBM Plex Mono'", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ter)" }}>
            Choose branch
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {choices.map((t, i) => {
              const isAuto = t === auto;
              const g = t.guardValue;
              return (
                <button
                  key={i}
                  onClick={() => onChoose(t)}
                  title={t.kind === "branch" ? "Alternate branch" : "Continue on the main path"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 10px",
                    borderRadius: 7,
                    border: `1px solid ${isAuto ? "var(--accent)" : "rgba(var(--line),.14)"}`,
                    background: isAuto ? "var(--accent-bg)" : "var(--surface)",
                    color: isAuto ? "var(--accent-ink)" : "var(--sub)",
                    font: "400 11.5px 'IBM Plex Sans'",
                    cursor: "pointer",
                    maxWidth: 260,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.kind === "branch" ? t.label || "branch" : "Continue"}
                  </span>
                  {g !== undefined ? (
                    <span
                      style={{
                        font: "600 9px 'IBM Plex Mono'",
                        color: g ? "oklch(0.55 0.13 150)" : "var(--faint)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g ? "TRUE" : "FALSE"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {exec.done ? (
        <span style={{ font: "500 11.5px 'IBM Plex Sans'", color: "oklch(0.55 0.13 150)" }}>
          ● Reached End — {exec.steps} step{exec.steps === 1 ? "" : "s"}.
        </span>
      ) : null}

      {/* Notes: unmet preconditions, skipped effects, loop cap. */}
      {exec.notes.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {exec.notes.map((n, i) => (
            <span key={i} style={{ font: "400 11px/1.4 'IBM Plex Sans'", color: "var(--warn-ink)" }}>
              ⚠ {n}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The diagram only draws the flow being viewed, so once the token descends into
// a subflow call there's nothing on screen to highlight (the call node stays lit
// instead). This trail names the flows the token is inside, innermost last, so
// the reader can follow a run that crosses use cases. Hidden at the root, where
// the diagram already tells the whole story.
function CallStackTrail({ exec, project }: { exec: ExecState; project: Project }) {
  if (exec.stack.length === 0) return null;

  const titleOf = (flowId: string) => {
    const f = project.flows.find((x) => x.id === flowId);
    if (!f) return flowId;
    return useCaseOfFlow(project, f)?.title || f.title || flowId;
  };
  const ids = callStack(exec);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          font: "500 9.5px 'IBM Plex Mono'",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--ter)",
        }}
      >
        Inside subflow
      </span>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
        {ids.map((id, i) => {
          const deepest = i === ids.length - 1;
          return (
            <span key={`${id}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {i > 0 ? (
                <span style={{ color: "var(--faint)", font: "400 11px 'IBM Plex Sans'" }}>›</span>
              ) : null}
              <span
                title={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: deepest ? "var(--accent-bg)" : "var(--surface)",
                  border: `1px solid ${deepest ? "var(--accent)" : "rgba(var(--line),.12)"}`,
                  color: deepest ? "var(--accent-ink)" : "var(--sub)",
                  font: `${deepest ? 500 : 400} 11.5px 'IBM Plex Sans'`,
                  maxWidth: 220,
                }}
              >
                {i > 0 ? <Icon name="subflow" size={12} /> : null}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {titleOf(id)}
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Before a run: the same variable table, but the values are editable so a
// reader can set up a scenario (e.g. flip `dirty` to true) and watch which
// branch it drives. These edits seed the run and are thrown away on Exit.
function SetupState({
  rows,
  onEdit,
}: {
  rows: VariableRow[];
  onEdit: (key: string, value: Value) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div
      style={{
        border: "1px solid rgba(var(--line),.1)",
        borderRadius: 10,
        background: "var(--surface2)",
        padding: "11px 13px",
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span style={{ font: "500 9.5px 'IBM Plex Mono'", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ter)" }}>
        Starting state · edit to simulate a run
      </span>
      <VariableTable rows={rows} onEdit={onEdit} />
    </div>
  );
}

// A row per variable — name, its prose description, and the value. With `onEdit`
// the value is an input (setup); otherwise it's read-only and lights up when it
// changed on the last step. Shared by the setup panel and the live run panel.
function VariableTable({
  rows,
  changed,
  onEdit,
}: {
  rows: VariableRow[];
  changed?: Set<string>;
  onEdit?: (key: string, value: Value) => void;
}) {
  const cell: React.CSSProperties = {
    padding: "5px 8px",
    borderTop: "1px solid rgba(var(--line),.08)",
    verticalAlign: "top",
    textAlign: "left",
  };
  const head: React.CSSProperties = {
    padding: "0 8px 4px",
    font: "500 9.5px 'IBM Plex Mono'",
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "var(--ter)",
    textAlign: "left",
    fontWeight: 500,
  };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={head}>Variable</th>
          <th style={head}>Description</th>
          <th style={{ ...head, width: onEdit ? 120 : 90 }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const hot = changed?.has(r.key) ?? false;
          return (
            <tr key={r.key}>
              <td style={cell}>
                <span style={{ font: "500 12px 'IBM Plex Mono'", color: "var(--ink)" }}>{r.name}</span>
                <span
                  title={r.typeLabel}
                  style={{ display: "block", font: "400 10px 'IBM Plex Sans'", color: "var(--faint)" }}
                >
                  {r.componentTitle} · {r.typeLabel}
                </span>
              </td>
              <td style={{ ...cell, font: "400 11.5px/1.45 'IBM Plex Sans'", color: r.description ? "var(--sub)" : "var(--faint)" }}>
                {r.description || "—"}
              </td>
              <td style={cell}>
                {onEdit ? (
                  <ValueEditor row={r} onChange={(v) => onEdit(r.key, v)} />
                ) : (
                  <span
                    style={{
                      font: "500 11.5px 'IBM Plex Mono'",
                      padding: "2px 7px",
                      borderRadius: 6,
                      background: hot ? "var(--accent-bg)" : "var(--surface)",
                      border: `1px solid ${hot ? "var(--accent)" : "rgba(var(--line),.12)"}`,
                      color: hot ? "var(--accent-ink)" : "var(--ink)",
                    }}
                  >
                    {String(r.value)}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Type-aware editor for a starting value: a toggle for bool, a picker for enum,
// a clamped number field for int.
function ValueEditor({ row, onChange }: { row: VariableRow; onChange: (v: Value) => void }) {
  const box: React.CSSProperties = {
    font: "400 11.5px 'IBM Plex Mono'",
    padding: "3px 6px",
    borderRadius: 6,
    border: "1px solid rgba(var(--line),.16)",
    background: "var(--surface)",
    color: "var(--ink)",
    width: "100%",
  };
  const t = row.type;

  if (t.kind === "bool") {
    return (
      <select style={box} value={String(row.value === true)} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (t.kind === "enum") {
    return (
      <select style={box} value={String(row.value)} onChange={(e) => onChange(e.target.value)}>
        {t.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      style={box}
      value={Number(row.value)}
      min={t.min}
      max={t.max}
      onChange={(e) => {
        let n = Math.trunc(Number(e.target.value));
        if (!Number.isFinite(n)) return;
        if (t.min != null) n = Math.max(t.min, n);
        if (t.max != null) n = Math.min(t.max, n);
        onChange(n);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SVG pieces
// ---------------------------------------------------------------------------

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

function Edge({ edge, active }: { edge: DiagramEdge; active: boolean }) {
  const alt = edge.kind !== "seq";
  const stroke = active ? "var(--accent)" : alt ? ALT_ACCENT : "rgba(var(--line),.45)";
  const marker = active ? "diagram-arrow-active" : alt ? "diagram-arrow-alt" : "diagram-arrow-seq";
  return (
    <path
      d={edge.d}
      fill="none"
      stroke={stroke}
      strokeWidth={active ? 2.6 : alt ? 1.8 : 1.5}
      strokeDasharray={edge.kind === "rejoin" ? "5 4" : undefined}
      markerEnd={`url(#${marker})`}
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

// The current node gets an outer accent ring via box-shadow (not a border), so
// the border longhands below stay stable across rerenders — mixing a `border`
// shorthand with `borderLeft` while toggling is what React warns about.
const RING = "0 0 0 2px var(--accent), 0 0 0 6px var(--accent-bg)";

function Node({ node, current, dim }: { node: DiagramNode; current: boolean; dim: boolean }) {
  const opacity = dim ? 0.5 : 1;

  if (node.kind === "invoke") {
    // A subflow call — a single opaque node (the callee isn't expanded inline),
    // set apart from activities by a dashed accent frame + the subflow glyph.
    return (
      <div
        title={`Calls ${node.label}`}
        style={{
          position: "absolute",
          left: node.x,
          top: node.y,
          width: node.w,
          height: node.h,
          border: "1.5px dashed rgba(var(--line),.32)",
          borderRadius: 10,
          background: "var(--accent-bg)",
          boxShadow: current ? RING : "0 1px 3px rgba(var(--line),.05)",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflow: "hidden",
          opacity,
        }}
      >
        <span style={{ flex: "none", color: "var(--accent-ink)", display: "flex" }}>
          <Icon name="subflow" size={15} />
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            font: "500 12.5px 'IBM Plex Sans'",
            color: "var(--accent-ink)",
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

  if (node.kind !== "activity") {
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
          opacity,
          boxShadow: current ? RING : undefined,
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
        // All-longhand borders (the left edge carries the component colour).
        borderTop: "1px solid rgba(var(--line),.12)",
        borderRight: "1px solid rgba(var(--line),.12)",
        borderBottom: "1px solid rgba(var(--line),.12)",
        borderLeft: `3px solid oklch(0.62 0.14 ${hue})`,
        borderRadius: 10,
        background: "var(--surface)",
        boxShadow: current ? RING : "0 1px 3px rgba(var(--line),.05)",
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        opacity,
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
