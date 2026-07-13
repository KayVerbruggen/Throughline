import { useEffect, useState } from "react";

import { activityLabel, componentOfActivity, flowOfUseCase } from "../../model/behavior";
import {
  addAlternate,
  addStep,
  deleteAlternate,
  deleteStep,
  moveStep,
  setStepComponent,
  setStepLabel,
  updateAlternate,
  type FlowEdit,
  type StepLoc,
} from "../../model/flowEdit";
import { nextId } from "../../model/ids";
import { useStore } from "../../state/store";
import type { AltPath, Flow, UseCase } from "../../types";
import { Icon } from "../icons";

const NEW_COMPONENT = "__new__";

export function BehaviorView() {
  const project = useStore((s) => s.project);
  const [ucId, setUcId] = useState<string | null>(null);

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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
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

  return <FlowEditor flow={flow} uc={uc} />;
}

// ---------------------------------------------------------------------------
// Flow editor
// ---------------------------------------------------------------------------

function FlowEditor({ flow, uc }: { flow: Flow; uc: UseCase }) {
  const upsertArtifact = useStore((s) => s.upsertArtifact);
  const select = useStore((s) => s.select);

  // Apply a pure edit: persist the new flow and any changed components.
  const apply = async (edit: FlowEdit) => {
    await upsertArtifact(edit.flow);
    for (const c of edit.components) await upsertArtifact(c);
  };

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
          Happy path · branches listed below
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => void apply(addAlternate(flow))} style={secondaryBtn}>
          + Add alternate path
        </button>
      </div>

      {/* Main flow */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        {flow.main.map((actId, i) => (
          <StepRow
            key={`main-${i}-${actId}`}
            flow={flow}
            loc="main"
            index={i}
            activityId={actId}
            count={flow.main.length}
            number={i + 1}
            apply={apply}
          />
        ))}
      </div>
      <AddStepButton onClick={() => void apply(addStep(flow, "main"))} label="Add activity" />

      {/* Alternate paths */}
      {flow.alternates.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <div
            style={{
              font: "500 10px 'IBM Plex Mono'",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--ter)",
              marginBottom: 12,
            }}
          >
            Alternate paths
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {flow.alternates.map((alt) => (
              <AltBlock key={alt.id} flow={flow} alt={alt} apply={apply} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single activity step (component select + label + controls)
// ---------------------------------------------------------------------------

function StepRow({
  flow,
  loc,
  index,
  activityId,
  count,
  number,
  apply,
  accent = "var(--accent-bg)",
  accentInk = "var(--accent-ink)",
}: {
  flow: Flow;
  loc: StepLoc;
  index: number;
  activityId: string;
  count: number;
  number: number;
  apply: (edit: FlowEdit) => Promise<void>;
  accent?: string;
  accentInk?: string;
}) {
  const project = useStore((s) => s.project);
  const upsertArtifact = useStore((s) => s.upsertArtifact);

  const owner = componentOfActivity(project, activityId);
  const label = activityLabel(project, activityId);
  const [draft, setDraft] = useState(label);
  useEffect(() => setDraft(label), [label]);

  const commitLabel = () => {
    if (draft !== label) void apply(setStepLabel(project, flow, loc, index, draft));
  };

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
        description: "",
        activities: [],
        created: new Date().toISOString().slice(0, 10),
      });
      const after = useStore.getState().project;
      const flowNow = after.flows.find((f) => f.id === flow.id) ?? flow;
      await apply(setStepComponent(after, flowNow, loc, index, id));
      return;
    }
    await apply(setStepComponent(project, flow, loc, index, value));
  };

  const reuseListId = `reuse-${flow.id}-${loc}-${index}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: "1px solid rgba(var(--line),.1)",
        borderRadius: 10,
        background: "var(--surface)",
      }}
    >
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

      <input
        value={draft}
        list={owner ? reuseListId : undefined}
        disabled={!owner}
        placeholder={owner ? "Activity…" : "Pick a component first →"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "7px 10px",
          border: "1px solid rgba(var(--line),.12)",
          borderRadius: 8,
          background: owner ? "var(--surface)" : "var(--surface2)",
          font: "400 13px 'IBM Plex Sans'",
          color: "var(--ink)",
          outline: "none",
        }}
      />
      {owner ? (
        <datalist id={reuseListId}>
          {owner.activities
            .filter((a) => a.id !== activityId && a.label.trim())
            .map((a) => (
              <option key={a.id} value={a.label} />
            ))}
        </datalist>
      ) : null}

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

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <MiniIconButton
          title="Move up"
          disabled={index === 0}
          onClick={() => void apply(moveStep(flow, loc, index, index - 1))}
        >
          ▲
        </MiniIconButton>
        <MiniIconButton
          title="Move down"
          disabled={index === count - 1}
          onClick={() => void apply(moveStep(flow, loc, index, index + 1))}
        >
          ▼
        </MiniIconButton>
      </div>

      <RowIconButton title="Remove activity" onClick={() => void apply(deleteStep(project, flow, loc, index))}>
        <Icon name="trash" size={14} />
      </RowIconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alternate path block
// ---------------------------------------------------------------------------

function AltBlock({
  flow,
  alt,
  apply,
}: {
  flow: Flow;
  alt: AltPath;
  apply: (edit: FlowEdit) => Promise<void>;
}) {
  const project = useStore((s) => s.project);
  const [cond, setCond] = useState(alt.condition);
  useEffect(() => setCond(alt.condition), [alt.condition]);

  const mainOptions = flow.main.map((actId, i) => ({
    value: i,
    label: `Step ${i + 1}: ${activityLabel(project, actId) || "(unnamed)"}`,
  }));

  return (
    <div
      style={{
        border: "1px solid rgba(var(--line),.1)",
        borderLeft: "2px solid oklch(0.62 0.13 70)",
        borderRadius: "0 10px 10px 0",
        background: "var(--surface2)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ font: "600 11px 'IBM Plex Mono'", color: "oklch(0.52 0.11 62)" }}>↳ IF</span>
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
        <RowIconButton title="Delete alternate path" onClick={() => void apply(deleteAlternate(project, flow, alt.id))}>
          <Icon name="trash" size={14} />
        </RowIconButton>
      </div>

      <div style={{ display: "flex", gap: 18, marginBottom: 14, flexWrap: "wrap" }}>
        <AnchorSelect
          label="After"
          value={alt.after}
          options={mainOptions}
          onChange={(v) => void apply(updateAlternate(flow, alt.id, { after: v }))}
        />
        <AnchorSelect
          label="Rejoins"
          value={alt.rejoin}
          options={[{ value: -1, label: "Ends the flow" }, ...mainOptions]}
          onChange={(v) => void apply(updateAlternate(flow, alt.id, { rejoin: v }))}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {alt.steps.map((actId, i) => (
          <StepRow
            key={`${alt.id}-${i}-${actId}`}
            flow={flow}
            loc={alt.id}
            index={i}
            activityId={actId}
            count={alt.steps.length}
            number={i + 1}
            apply={apply}
            accent="oklch(0.95 0.04 70)"
            accentInk="oklch(0.5 0.12 62)"
          />
        ))}
      </div>
      <AddStepButton onClick={() => void apply(addStep(flow, alt.id))} label="Add activity" />
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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          font: "500 9.5px 'IBM Plex Mono'",
          letterSpacing: ".07em",
          textTransform: "uppercase",
          color: "var(--ter)",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          padding: "6px 9px",
          border: "1px solid rgba(var(--line),.12)",
          borderRadius: 7,
          background: "var(--surface)",
          font: "400 12.5px 'IBM Plex Sans'",
          color: "var(--ink)",
          cursor: "pointer",
          outline: "none",
          maxWidth: 260,
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

function MiniIconButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: 20,
        height: 13,
        border: "none",
        background: "transparent",
        color: disabled ? "var(--faint)" : "var(--ter)",
        cursor: disabled ? "default" : "pointer",
        fontSize: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

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
  return (
    <button
      onClick={onClick}
      title={title}
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
        background: hover ? "oklch(0.95 0.05 25)" : "transparent",
        color: hover ? "oklch(0.5 0.16 25)" : "var(--ter)",
      }}
    >
      {children}
    </button>
  );
}
