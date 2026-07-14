import { useEffect, useMemo, useRef, useState } from "react";

import { activityLabel, componentOfActivity, flowOfUseCase } from "../../model/behavior";
import { analyzeEffect, analyzeGuard, guardCandidates, type GuardCandidate } from "../../model/expr";
import {
  addAlternate,
  addStep,
  deleteAlternate,
  deleteStep,
  moveStep,
  setActivityDetails,
  setStepComponent,
  setStepLabel,
  updateAlternate,
  type FlowEdit,
  type StepLoc,
} from "../../model/flowEdit";
import { nextId } from "../../model/ids";
import { useStore } from "../../state/store";
import type { AltPath, Component, Flow, UseCase } from "../../types";
import { Icon } from "../icons";
import { useConfirm } from "../useConfirm";
import { FlowDiagram } from "./FlowDiagram";

const NEW_COMPONENT = "__new__";
const ALT_ACCENT = "oklch(0.62 0.13 70)";

export function BehaviorView() {
  const project = useStore((s) => s.project);
  // Persisted so the chosen use case survives navigation and window reopens.
  const ucId = useStore((s) => s.prefs.behaviorUseCase);
  const setPrefs = useStore((s) => s.setPrefs);
  const setUcId = (behaviorUseCase: string | null) => setPrefs({ behaviorUseCase });

  // Default to the first use case; keep selection valid as the list changes.
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
          No use cases yet. Behaviour is modelled per use case — add one in the Use Cases view first.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 26px 64px" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {project.useCases.map((u) => (
          <UcTab key={u.id} uc={u} active={u.id === ucId} onClick={() => setUcId(u.id)} />
        ))}
      </div>
      {uc ? <FlowPanel uc={uc} /> : null}
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

function FlowPanel({ uc }: { uc: UseCase }) {
  const project = useStore((s) => s.project);
  const ensureFlowForUseCase = useStore((s) => s.ensureFlowForUseCase);
  const flow = flowOfUseCase(project, uc);

  if (!flow) {
    return (
      <div
        style={{
          border: "1px dashed rgba(var(--line),.2)",
          borderRadius: 12,
          padding: "28px 24px",
          textAlign: "center",
          background: "var(--surface2)",
        }}
      >
        <div style={{ font: "500 14px 'IBM Plex Sans'", color: "var(--ink)", marginBottom: 6 }}>
          No flow yet for {uc.id}
        </div>
        <p style={{ margin: "0 0 16px", font: "400 12.5px/1.55 'IBM Plex Sans'", color: "var(--sub)" }}>
          A flow captures the ordered activities — and who performs them — that realise this use case.
        </p>
        <button
          onClick={() => void ensureFlowForUseCase(uc.id)}
          style={{
            padding: "9px 15px",
            border: "none",
            borderRadius: 8,
            background: "var(--ink)",
            color: "var(--bg)",
            font: "500 13px 'IBM Plex Sans'",
            cursor: "pointer",
          }}
        >
          Create flow
        </button>
      </div>
    );
  }

  // Steps on the left (the editor), the derived activity diagram on the right.
  // The list needs far less width than it used to claim, so splitting frees the
  // right half for the graph. Remount both per flow so per-flow UI state (which
  // branches are collapsed) and the diagram reset cleanly on flow switch.
  return (
    <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 0", minWidth: 460 }}>
        <FlowEditor key={flow.id} flow={flow} uc={uc} />
      </div>
      <div
        style={{
          flex: "1 1 0",
          minWidth: 0,
          position: "sticky",
          top: 4,
          alignSelf: "flex-start",
          borderLeft: "1px solid rgba(var(--line),.08)",
          paddingLeft: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, height: 30 }}>
          <span style={{ display: "flex", color: "var(--ter)" }}>
            <Icon name="diagram" size={16} />
          </span>
          <span style={{ font: "600 12.5px 'IBM Plex Sans'", color: "var(--ink)" }}>Activity diagram</span>
          <span
            style={{
              font: "400 11px 'IBM Plex Sans'",
              color: "var(--faint)",
            }}
          >
            derived from steps &amp; guards
          </span>
        </div>
        <FlowDiagram key={flow.id} flow={flow} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow editor
//
// The happy path is a vertical list of steps. Each alternate path is rendered
// *inline*, indented directly beneath the main step it diverges from (its
// `after` index), so a branch reads where it actually happens rather than in a
// separate list at the bottom.
// ---------------------------------------------------------------------------

function FlowEditor({ flow, uc }: { flow: Flow; uc: UseCase }) {
  const upsertArtifact = useStore((s) => s.upsertArtifact);
  const select = useStore((s) => s.select);

  // Which branches are collapsed to a one-line summary. Seeded branches (that
  // already have steps) start collapsed for a compact overview; a freshly added
  // branch stays expanded so it can be filled in. Purely a view concern — never
  // persisted to the flow.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(flow.alternates.filter((a) => a.steps.length > 0).map((a) => a.id)),
  );
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Apply a pure edit: persist the new flow and any changed components.
  const apply = async (edit: FlowEdit) => {
    await upsertArtifact(edit.flow);
    for (const c of edit.components) await upsertArtifact(c);
  };

  // Group alternates under the main step they branch from. Any whose anchor is
  // out of range (e.g. a branch added before the happy path has steps) fall
  // through to a trailing "unattached" group so they never disappear.
  const inRange = (n: number) => n >= 0 && n < flow.main.length;
  const branchesAfter = (i: number) => flow.alternates.filter((a) => a.after === i);
  const orphanBranches = flow.alternates.filter((a) => !inRange(a.after));

  const renderAlt = (alt: AltPath) => (
    <AltBlock
      key={alt.id}
      flow={flow}
      alt={alt}
      apply={apply}
      collapsed={collapsed.has(alt.id) && alt.steps.length > 0}
      onToggle={() => toggleCollapsed(alt.id)}
    />
  );

  const mainDrag = useStepDrag(`${flow.id}:main`, (from, to) => void apply(moveStep(flow, "main", from, to)));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ font: "600 15px 'IBM Plex Sans'", color: "var(--ink)" }}>{uc.title}</div>
        <span
          onClick={() => select("flow", flow.id)}
          style={{
            font: "500 11px 'IBM Plex Mono'",
            color: "var(--accent-ink)",
            background: "var(--accent-bg)",
            padding: "2px 7px",
            borderRadius: 5,
            cursor: "pointer",
          }}
        >
          {flow.id}
        </span>
        <span
          style={{
            font: "500 10px 'IBM Plex Mono'",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--faint)",
          }}
        >
          Happy path · branches inline where they diverge
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => void apply(addAlternate(flow))} style={secondaryBtn}>
          + Add alternate path
        </button>
      </div>

      {/* Main flow, with each alternate rendered beneath its branch point. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} {...dropZoneProps(mainDrag)}>
        {flow.main.map((actId, i) => (
          <div key={`main-${i}-${actId}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <StepRow
              flow={flow}
              loc="main"
              index={i}
              activityId={actId}
              number={i + 1}
              apply={apply}
              dnd={mainDrag}
            />
            {branchesAfter(i).map(renderAlt)}
          </div>
        ))}
      </div>
      <AddStepButton onClick={() => void apply(addStep(flow, "main"))} label="Add activity" />

      {orphanBranches.length > 0 && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              font: "500 10px 'IBM Plex Mono'",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--ter)",
            }}
          >
            Unattached branches
          </div>
          {orphanBranches.map(renderAlt)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reorder-by-drag coordination.
//
// Each list (the main flow, and each alternate's steps) is independent, so the
// container owns one `useStepDrag`; every StepRow in it shares that state. A row
// is only made `draggable` while its grip is held (so the text inputs inside
// stay selectable the rest of the time).
//
// The drop model is *gap-based*: the whole list container is the drop target
// (via `dropZoneProps`), and the cursor's Y position picks an insertion gap
// `0..count` between rows. Making the container the target — not each row — is
// what lets you drop in the space between two rows (a per-row target leaves the
// flex `gap` as dead space where the OS shows a "blocked" cursor). `gap` maps to
// `moveStep`'s final index: dropping at gap g moves `from` to `g-1` if it sat
// above the gap, else `g`.
// ---------------------------------------------------------------------------

interface StepDnd {
  /** Identifies this list's rows in the DOM (rows carry `data-drag-list`). */
  listId: string;
  dragIndex: number | null;
  /** Insertion gap under the cursor, 0..count, or null when off-list. */
  gap: number | null;
  start: (index: number) => void;
  setGap: (gap: number | null) => void;
  commit: () => void;
  end: () => void;
}

function useStepDrag(listId: string, onMove: (from: number, to: number) => void): StepDnd {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [gap, setGap] = useState<number | null>(null);
  return {
    listId,
    dragIndex,
    gap,
    start: (index) => {
      setDragIndex(index);
      setGap(null);
    },
    setGap: (g) => setGap(g),
    commit: () => {
      if (dragIndex !== null && gap !== null) {
        const to = dragIndex < gap ? gap - 1 : gap;
        if (to !== dragIndex) onMove(dragIndex, to);
      }
      setDragIndex(null);
      setGap(null);
    },
    end: () => {
      setDragIndex(null);
      setGap(null);
    },
  };
}

/**
 * Drop-target handlers for a list container. The container spans the rows *and*
 * the gaps between them, so a drop is never lost to dead space. The insertion
 * gap is the first row whose vertical midpoint is below the cursor (else the
 * end). Guards on `dnd.dragIndex` so a container nested inside another list
 * (an alternate block within the main flow) ignores drags meant for its parent.
 */
function dropZoneProps(dnd: StepDnd) {
  return {
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      if (dnd.dragIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rows = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>(`[data-drag-list="${dnd.listId}"]`),
      );
      let g = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          g = i;
          break;
        }
      }
      dnd.setGap(g);
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      if (dnd.dragIndex === null) return;
      e.preventDefault();
      dnd.commit();
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dnd.setGap(null);
    },
  };
}

// ---------------------------------------------------------------------------
// A single activity step (component select + activity name + controls)
// ---------------------------------------------------------------------------

function StepRow({
  flow,
  loc,
  index,
  activityId,
  number,
  apply,
  dnd,
  accent = "var(--accent-bg)",
  accentInk = "var(--accent-ink)",
}: {
  flow: Flow;
  loc: StepLoc;
  index: number;
  activityId: string;
  number: number;
  apply: (edit: FlowEdit) => Promise<void>;
  dnd: StepDnd;
  accent?: string;
  accentInk?: string;
}) {
  const project = useStore((s) => s.project);
  const upsertArtifact = useStore((s) => s.upsertArtifact);
  const [armed, setArmed] = useState(false);
  const [showBehavior, setShowBehavior] = useState(false);

  const owner = componentOfActivity(project, activityId);
  const activity = owner?.activities.find((a) => a.id === activityId) ?? null;
  const hasBehavior = !!(activity && (activity.pre || activity.effects?.length));

  // Drop-line: at insertion gap g, we paint one row's edge. Moving down we mark
  // the lower edge of the activity above the gap (row g-1); moving up we mark
  // the upper edge of the activity below it (row g). No line for a no-op drop.
  const isDragging = dnd.dragIndex === index;
  let showTop = false;
  let showBottom = false;
  if (dnd.dragIndex !== null && dnd.gap !== null) {
    const from = dnd.dragIndex;
    const gap = dnd.gap;
    const to = from < gap ? gap - 1 : gap;
    if (to !== from) {
      if (to > from && index === gap - 1) showBottom = true;
      else if (to < from && index === gap) showTop = true;
    }
  }

  const onComponent = async (value: string) => {
    if (value === NEW_COMPONENT) {
      const name = window.prompt("New component name", "New Component");
      if (!name || !name.trim()) return;
      const fresh = useStore.getState().project;
      const id = nextId(fresh, "component");
      await upsertArtifact({
        kind: "component",
        id,
        title: name.trim(),
        parent: "",
        description: "",
        activities: [],
        variables: [],
        decisions: [],
        created: new Date().toISOString().slice(0, 10),
      });
      const after = useStore.getState().project;
      const flowNow = after.flows.find((f) => f.id === flow.id) ?? flow;
      await apply(setStepComponent(after, flowNow, loc, index, id));
      return;
    }
    await apply(setStepComponent(project, flow, loc, index, value));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
    <div
      data-drag-list={dnd.listId}
      draggable={armed}
      onDragStart={(e) => {
        // Firefox only starts a drag if some data is set.
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        dnd.start(index);
      }}
      onDragEnd={() => {
        dnd.end();
        setArmed(false);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: "1px solid rgba(var(--line),.1)",
        borderRadius: 10,
        background: "var(--surface)",
        opacity: isDragging ? 0.4 : 1,
        boxShadow: showTop
          ? `inset 0 2px 0 0 ${ALT_ACCENT}`
          : showBottom
            ? `inset 0 -2px 0 0 ${ALT_ACCENT}`
            : undefined,
      }}
    >
      <button
        type="button"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        onMouseDown={() => setArmed(true)}
        onMouseUp={() => setArmed(false)}
        style={{
          flex: "none",
          width: 22,
          height: 28,
          border: "none",
          background: "transparent",
          color: "var(--faint)",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          touchAction: "none",
        }}
      >
        <Icon name="grip" size={16} />
      </button>

      <span
        style={{
          flex: "none",
          width: 24,
          height: 24,
          borderRadius: 7,
          background: accent,
          color: accentInk,
          font: "500 12px 'IBM Plex Mono'",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {number}
      </span>

      <ActivityField
        flow={flow}
        loc={loc}
        index={index}
        activityId={activityId}
        owner={owner}
        apply={apply}
      />

      <select
        value={owner?.id ?? ""}
        onChange={(e) => void onComponent(e.target.value)}
        style={{
          flex: "none",
          width: 190,
          padding: "7px 9px",
          border: "1px solid rgba(var(--line),.12)",
          borderRadius: 8,
          background: "var(--surface)",
          font: "400 12.5px 'IBM Plex Sans'",
          color: owner ? "var(--ink)" : "var(--ter)",
          cursor: "pointer",
          outline: "none",
        }}
      >
        <option value="">— component —</option>
        {project.components.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
        <option value={NEW_COMPONENT}>+ New component…</option>
      </select>

      <button
        type="button"
        disabled={!activity}
        title={
          activity
            ? hasBehavior
              ? "Edit preconditions / effects"
              : "Add preconditions / effects"
            : "Name the activity first"
        }
        onClick={() => setShowBehavior((v) => !v)}
        style={{
          flex: "none",
          width: 28,
          height: 28,
          border: "none",
          borderRadius: 7,
          cursor: activity ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: showBehavior ? "var(--accent-bg)" : "transparent",
          color: !activity
            ? "var(--faint)"
            : hasBehavior || showBehavior
              ? "var(--accent-ink)"
              : "var(--ter)",
          font: "600 13px 'IBM Plex Mono'",
        }}
      >
        ƒ
      </button>

      <RowIconButton title="Remove activity" onClick={() => void apply(deleteStep(project, flow, loc, index))}>
        <Icon name="trash" size={14} />
      </RowIconButton>
    </div>
    {showBehavior && activity ? (
      <ActivityBehaviorEditor flow={flow} activityId={activityId} apply={apply} />
    ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity behaviour editor — the formal `pre` / `effects` of an activity.
//
// Progressive disclosure: hidden until the ƒ button is pressed. Because an
// activity is component-owned and reused across flows, editing here changes the
// activity everywhere it appears — the panel says so. Preconditions type-check
// as a bool guard; each effect as an assignment `head.name := value`.
// ---------------------------------------------------------------------------

function ActivityBehaviorEditor({
  flow,
  activityId,
  apply,
}: {
  flow: Flow;
  activityId: string;
  apply: (edit: FlowEdit) => Promise<void>;
}) {
  const project = useStore((s) => s.project);
  const owner = componentOfActivity(project, activityId);
  const activity = owner?.activities.find((a) => a.id === activityId) ?? null;

  const [pre, setPre] = useState(activity?.pre ?? "");
  useEffect(() => setPre(activity?.pre ?? ""), [activity?.pre]);
  const [effects, setEffects] = useState<string[]>(activity?.effects ?? []);
  useEffect(() => setEffects(activity?.effects ?? []), [activity?.effects]);

  if (!activity) return null;

  const preCheck = pre.trim() ? analyzeGuard(project, pre) : null;
  const preError = preCheck && !preCheck.ok ? preCheck.message : null;
  const commitPre = () => {
    const p = pre.trim();
    if ((activity.pre ?? "") !== p) {
      void apply(setActivityDetails(project, flow, activityId, { pre: p || undefined }));
    }
  };

  const persistEffects = (next: string[]) =>
    void apply(setActivityDetails(project, flow, activityId, { effects: next }));

  return (
    <div
      style={{
        margin: "6px 0 2px 34px",
        padding: "12px 14px",
        border: "1px solid rgba(var(--line),.1)",
        borderLeft: "2px solid var(--accent)",
        borderRadius: "0 10px 10px 0",
        background: "var(--surface2)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          font: "500 9.5px 'IBM Plex Mono'",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--ter)",
        }}
      >
        Behaviour of {activity.label || "this activity"}
        <span style={{ color: "var(--faint)", textTransform: "none", letterSpacing: 0 }}>
          {" "}
          — {activity.id}, shared wherever it is used
        </span>
      </div>

      {/* Precondition — a bool guard that must hold for the step to run. */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            title="Precondition: a boolean guard that must hold when the step runs"
            style={{ font: "600 11px 'IBM Plex Mono'", color: "var(--sub)", whiteSpace: "nowrap", width: 20 }}
          >
            pre
          </span>
          <GuardInput
            value={pre}
            onChange={setPre}
            onCommit={commitPre}
            invalid={!!preError}
            placeholder="optional precondition, e.g. chamber.vesselCount == 0"
          />
        </div>
        {preError ? (
          <div
            style={{ marginTop: 5, marginLeft: 28, font: "400 11.5px/1.4 'IBM Plex Sans'", color: "var(--warn-ink)" }}
          >
            {preError}
          </div>
        ) : null}
      </div>

      {/* Effects — assignments applied when the activity runs. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {effects.map((eff, i) => {
          const effCheck = eff.trim() ? analyzeEffect(project, eff) : null;
          const effError = effCheck && !effCheck.ok ? effCheck.message : null;
          const setAt = (v: string) => setEffects((arr) => arr.map((e, j) => (j === i ? v : e)));
          const removeAt = () => {
            const next = effects.filter((_, j) => j !== i);
            setEffects(next);
            persistEffects(next);
          };
          return (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  title="Effect: an assignment applied when the step runs"
                  style={{
                    font: "600 11px 'IBM Plex Mono'",
                    color: "var(--sub)",
                    whiteSpace: "nowrap",
                    width: 20,
                  }}
                >
                  {i === 0 ? "do" : ""}
                </span>
                <GuardInput
                  value={eff}
                  onChange={setAt}
                  onCommit={() => persistEffects(effects)}
                  invalid={!!effError}
                  placeholder="effect, e.g. upstreamGate.state := open"
                />
                <RowIconButton title="Remove effect" onClick={removeAt}>
                  <Icon name="trash" size={13} />
                </RowIconButton>
              </div>
              {effError ? (
                <div
                  style={{
                    marginTop: 5,
                    marginLeft: 28,
                    font: "400 11.5px/1.4 'IBM Plex Sans'",
                    color: "var(--warn-ink)",
                  }}
                >
                  {effError}
                </div>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setEffects((arr) => [...arr, ""])}
          style={{
            alignSelf: "flex-start",
            marginLeft: 28,
            padding: "5px 10px",
            border: "1px dashed rgba(var(--line),.18)",
            borderRadius: 7,
            background: "transparent",
            color: "var(--sub)",
            font: "500 12px 'IBM Plex Sans'",
            cursor: "pointer",
          }}
        >
          + Add effect
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity name field: a text input for naming/renaming the step's activity,
// plus a real dropdown for *reusing* an activity already defined on the same
// component. (The old native <datalist> filtered its options against the field's
// current value, so once a step was named the list appeared empty — it never
// worked as a picker. This is an explicit, always-openable menu instead.)
// ---------------------------------------------------------------------------

function ActivityField({
  flow,
  loc,
  index,
  activityId,
  owner,
  apply,
}: {
  flow: Flow;
  loc: StepLoc;
  index: number;
  activityId: string;
  owner: Component | null;
  apply: (edit: FlowEdit) => Promise<void>;
}) {
  const project = useStore((s) => s.project);
  const label = activityLabel(project, activityId);
  const [draft, setDraft] = useState(label);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => setDraft(label), [label]);

  // Other named activities on this component — the reuse candidates.
  const reusable = owner
    ? owner.activities.filter((a) => a.id !== activityId && a.label.trim())
    : [];

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commitLabel = () => {
    if (draft !== label) void apply(setStepLabel(project, flow, loc, index, draft));
  };

  const reuse = (chosen: string) => {
    setOpen(false);
    setDraft(chosen);
    void apply(setStepLabel(project, flow, loc, index, chosen));
  };

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0, position: "relative", display: "flex" }}>
      <input
        value={draft}
        disabled={!owner}
        placeholder={owner ? "Activity…" : "Pick a component first →"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "7px 10px",
          paddingRight: reusable.length ? 30 : 10,
          border: "1px solid rgba(var(--line),.12)",
          borderRadius: 8,
          background: owner ? "var(--surface)" : "var(--surface2)",
          font: "400 13px 'IBM Plex Sans'",
          color: "var(--ink)",
          outline: "none",
        }}
      />
      {reusable.length > 0 && (
        <button
          type="button"
          title="Reuse an existing activity from this component"
          onClick={() => setOpen((v) => !v)}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            width: 22,
            height: 22,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            color: "var(--ter)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="chevron" size={13} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </button>
      )}
      {open && reusable.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: 220,
            overflowY: "auto",
            border: "1px solid rgba(var(--line),.14)",
            borderRadius: 8,
            background: "var(--surface)",
            boxShadow: "0 8px 24px rgba(var(--line),.14)",
            padding: 4,
          }}
        >
          <div
            style={{
              font: "500 9px 'IBM Plex Mono'",
              letterSpacing: ".07em",
              textTransform: "uppercase",
              color: "var(--faint)",
              padding: "5px 8px 3px",
            }}
          >
            Reuse from {owner?.title}
          </div>
          {reusable.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => reuse(a.label)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 8px",
                border: "none",
                borderRadius: 6,
                background: "transparent",
                color: "var(--ink)",
                font: "400 12.5px 'IBM Plex Sans'",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(var(--line),.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alternate path block — rendered inline beneath its branch point.
// ---------------------------------------------------------------------------

function AltBlock({
  flow,
  alt,
  apply,
  collapsed,
  onToggle,
}: {
  flow: Flow;
  alt: AltPath;
  apply: (edit: FlowEdit) => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const project = useStore((s) => s.project);
  const [cond, setCond] = useState(alt.condition);
  useEffect(() => setCond(alt.condition), [alt.condition]);

  const stepDrag = useStepDrag(`${flow.id}:${alt.id}`, (from, to) => void apply(moveStep(flow, alt.id, from, to)));

  const [guard, setGuard] = useState(alt.guard ?? "");
  useEffect(() => setGuard(alt.guard ?? ""), [alt.guard]);
  const guardCheck = guard.trim() ? analyzeGuard(project, guard) : null;
  const guardError = guardCheck && !guardCheck.ok ? guardCheck.message : null;
  const commitGuard = () => {
    const g = guard.trim();
    if ((alt.guard ?? "") !== g) void apply(updateAlternate(flow, alt.id, { guard: g || undefined }));
  };

  const rejoinOptions = [
    { value: -1, label: "Ends the flow" },
    ...flow.main.map((actId, i) => ({
      value: i,
      label: `Rejoin at step ${i + 1}: ${activityLabel(project, actId) || "(unnamed)"}`,
    })),
  ];

  const toggleBtn = (
    <button
      type="button"
      title={collapsed ? "Expand branch" : "Collapse branch"}
      onClick={onToggle}
      style={{
        flex: "none",
        width: 20,
        height: 20,
        border: "none",
        borderRadius: 5,
        background: "transparent",
        color: "oklch(0.52 0.11 62)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="chevron" size={13} style={{ transform: collapsed ? "rotate(-90deg)" : undefined }} />
    </button>
  );

  const ifGlyph = (
    <span style={{ font: "600 11px 'IBM Plex Mono'", color: "oklch(0.52 0.11 62)", whiteSpace: "nowrap" }}>
      ↳ IF
    </span>
  );

  return (
    <div
      style={{
        marginLeft: 34,
        border: "1px solid rgba(var(--line),.1)",
        borderLeft: `2px solid ${ALT_ACCENT}`,
        borderRadius: "0 10px 10px 0",
        background: "var(--surface2)",
        padding: collapsed ? "9px 14px" : "14px 16px",
      }}
    >
      {collapsed ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {toggleBtn}
          {ifGlyph}
          <span
            style={{
              flex: 1,
              minWidth: 0,
              font: "400 13px 'IBM Plex Sans'",
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={alt.condition}
          >
            {alt.condition || "(no condition)"}
          </span>
          {alt.guard ? (
            <span
              title={guardError ? `Invalid guard: ${guardError}` : "Guard"}
              style={{
                font: "400 10.5px 'IBM Plex Mono'",
                color: guardError ? "var(--warn-ink)" : "oklch(0.52 0.11 62)",
                background: guardError ? "var(--warn-bg)" : "rgba(var(--line),.05)",
                padding: "2px 6px",
                borderRadius: 5,
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              ƒ {alt.guard}
            </span>
          ) : null}
          <span style={{ font: "400 11px 'IBM Plex Mono'", color: "var(--ter)", whiteSpace: "nowrap" }}>
            {alt.steps.length} {alt.steps.length === 1 ? "step" : "steps"}
          </span>
          <RowIconButton
            title="Delete alternate path"
            onClick={() => void apply(deleteAlternate(project, flow, alt.id))}
          >
            <Icon name="trash" size={14} />
          </RowIconButton>
        </div>
      ) : (
        <>
          {/* Three stacked rows — If / Branches after / Then — so the controls
              never crowd or overflow to the right. */}
          {/* Row 1: IF <condition> */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {toggleBtn}
            {ifGlyph}
            <input
              value={cond}
              placeholder="condition, e.g. the card is not recognised"
              onChange={(e) => setCond(e.target.value)}
              onBlur={() => cond !== alt.condition && void apply(updateAlternate(flow, alt.id, { condition: cond }))}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "6px 10px",
                border: "1px solid rgba(var(--line),.12)",
                borderRadius: 7,
                background: "var(--surface)",
                font: "400 13px 'IBM Plex Sans'",
                color: "var(--ink)",
                outline: "none",
              }}
            />
            <RowIconButton
              title="Delete alternate path"
              onClick={() => void apply(deleteAlternate(project, flow, alt.id))}
            >
              <Icon name="trash" size={14} />
            </RowIconButton>
          </div>

          {/* Row 2: BRANCHES AFTER <step> */}
          <div style={{ marginBottom: 8, paddingLeft: 28 }}>
            <AnchorSelect
              label="Branches after"
              value={alt.after}
              options={flow.main.map((actId, i) => ({
                value: i,
                label: `Step ${i + 1}: ${activityLabel(project, actId) || "(unnamed)"}`,
              }))}
              onChange={(v) => void apply(updateAlternate(flow, alt.id, { after: v }))}
            />
          </div>

          {/* Row 3: THEN <rejoin> */}
          <div style={{ marginBottom: 12, paddingLeft: 28 }}>
            <AnchorSelect
              label="Then"
              value={alt.rejoin}
              options={rejoinOptions}
              onChange={(v) => void apply(updateAlternate(flow, alt.id, { rejoin: v }))}
            />
          </div>

          {/* Formal guard — the machine-readable form of the condition. */}
          <div style={{ marginBottom: guardError ? 4 : 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                title="Guard: a boolean expression over component variables"
                style={{ font: "600 11px 'IBM Plex Mono'", color: "oklch(0.52 0.11 62)", whiteSpace: "nowrap" }}
              >
                ƒ&nbsp;=
              </span>
              <GuardInput
                value={guard}
                onChange={setGuard}
                onCommit={commitGuard}
                invalid={!!guardError}
                placeholder="optional guard, e.g. chamber.vesselCount != 0"
              />
            </div>
            {guardError ? (
              <div
                style={{
                  marginTop: 5,
                  marginLeft: 26,
                  font: "400 11.5px/1.4 'IBM Plex Sans'",
                  color: "var(--warn-ink)",
                }}
              >
                {guardError}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} {...dropZoneProps(stepDrag)}>
            {alt.steps.map((actId, i) => (
              <StepRow
                key={`${alt.id}-${i}-${actId}`}
                flow={flow}
                loc={alt.id}
                index={i}
                activityId={actId}
                number={i + 1}
                apply={apply}
                dnd={stepDrag}
                accent="oklch(0.95 0.04 70)"
                accentInk="oklch(0.5 0.12 62)"
              />
            ))}
          </div>
          <AddStepButton onClick={() => void apply(addStep(flow, alt.id))} label="Add step" />
        </>
      )}
    </div>
  );
}

function AnchorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span
        style={{
          font: "500 9.5px 'IBM Plex Mono'",
          letterSpacing: ".07em",
          textTransform: "uppercase",
          color: "var(--ter)",
          whiteSpace: "nowrap",
          width: 96,
          flex: "none",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "6px 9px",
          border: "1px solid rgba(var(--line),.12)",
          borderRadius: 7,
          background: "var(--surface)",
          font: "400 12.5px 'IBM Plex Sans'",
          color: "var(--ink)",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guard input with token-aware autocomplete.
//
// Guards are compound expressions, so completion works on the identifier token
// under the caret (the run of `[A-Za-z0-9_.]` before it) rather than the whole
// field: typing `cha` or `chamber.ves` suggests matching component-variable
// references, and after a comparison the enum members / booleans show too.
// ---------------------------------------------------------------------------

/** The identifier-ish token immediately left of the caret (for completion). */
function currentToken(value: string, caret: number): { start: number; text: string } {
  let start = caret;
  while (start > 0 && /[A-Za-z0-9_.]/.test(value[start - 1])) start--;
  return { start, text: value.slice(start, caret) };
}

function GuardInput({
  value,
  onChange,
  onCommit,
  invalid,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  invalid: boolean;
  placeholder?: string;
}) {
  const project = useStore((s) => s.project);
  const candidates = useMemo(() => guardCandidates(project), [project]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);

  const token = currentToken(value, caret);
  const matches = useMemo(() => {
    if (!open) return [];
    const t = token.text.toLowerCase();
    return candidates.filter((c) => c.text.toLowerCase().startsWith(t) && c.text.toLowerCase() !== t).slice(0, 8);
  }, [open, token.text, candidates]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  const syncCaret = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length);

  const apply = (cand: GuardCandidate) => {
    const before = value.slice(0, token.start) + cand.text;
    onChange(before + value.slice(caret));
    setOpen(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(before.length, before.length);
        setCaret(before.length);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && matches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        apply(matches[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(e) => {
          syncCaret(e.target);
          setOpen(true);
        }}
        onClick={(e) => syncCaret(e.currentTarget)}
        onKeyUp={(e) => syncCaret(e.currentTarget)}
        onBlur={() => {
          setOpen(false);
          onCommit();
        }}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          padding: "6px 10px",
          border: `1px solid ${invalid ? "var(--warn-border)" : "rgba(var(--line),.12)"}`,
          borderRadius: 7,
          background: "var(--surface)",
          font: "400 12.5px 'IBM Plex Mono'",
          color: "var(--ink)",
          outline: "none",
        }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            maxHeight: 240,
            overflowY: "auto",
            border: "1px solid rgba(var(--line),.14)",
            borderRadius: 8,
            background: "var(--surface)",
            boxShadow: "0 8px 24px rgba(var(--line),.14)",
            padding: 4,
          }}
        >
          {matches.map((c, i) => (
            <button
              key={`${c.kind}-${c.text}`}
              type="button"
              // Keep focus in the input so the caret/selection survive the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(c)}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                border: "none",
                borderRadius: 6,
                background: i === activeIndex ? "rgba(var(--line),.07)" : "transparent",
                cursor: "pointer",
              }}
            >
              <span style={{ font: "400 12.5px 'IBM Plex Mono'", color: "var(--ink)" }}>{c.text}</span>
              <span style={{ flex: 1 }} />
              <span style={{ font: "400 10.5px 'IBM Plex Mono'", color: "var(--faint)", whiteSpace: "nowrap" }}>
                {c.kind === "enum" ? c.detail : c.kind === "bool" ? "bool" : c.detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// small shared bits
// ---------------------------------------------------------------------------

const secondaryBtn = {
  padding: "7px 12px",
  border: "1px solid rgba(var(--line),.14)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--sub)",
  font: "500 12.5px 'IBM Plex Sans'",
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

function AddStepButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 8,
        alignSelf: "flex-start",
        padding: "7px 12px",
        border: "1px dashed rgba(var(--line),.18)",
        borderRadius: 8,
        background: "transparent",
        color: "var(--sub)",
        font: "500 12px 'IBM Plex Sans'",
        cursor: "pointer",
      }}
    >
      + {label}
    </button>
  );
}

// Destructive row control: an "arm then confirm" button. The first click arms
// it (turns solid red, swaps to a check); a second click within a few seconds
// runs the deletion, so a stray click never removes a step or path.
function RowIconButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const { armed, trigger } = useConfirm(onClick);
  return (
    <button
      onClick={trigger}
      title={armed ? `${title} — click again to confirm` : title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: "none",
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: armed ? "oklch(0.55 0.18 25)" : hover ? "oklch(0.95 0.05 25)" : "transparent",
        color: armed ? "#fff" : hover ? "oklch(0.5 0.16 25)" : "var(--ter)",
      }}
    >
      {armed ? <Icon name="check" size={14} /> : children}
    </button>
  );
}
