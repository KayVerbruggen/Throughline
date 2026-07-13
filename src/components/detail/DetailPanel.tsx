import { useState } from "react";

import { needWarning, requirementWarning, useCaseWarning } from "../../model/trace";
import { useStore } from "../../state/store";
import {
  MOSCOWS,
  STATUSES,
  type Artifact,
  type ArtifactKind,
  type Moscow,
  type Status,
} from "../../types";
import { Icon, type IconName } from "../icons";
import { ComponentBody, FlowBody, NeedBody, RequirementBody, StakeholderBody, UseCaseBody } from "./bodies";
import { Select } from "./fields";

const TYPE_META: Record<ArtifactKind, { label: string; icon: IconName }> = {
  stakeholder: { label: "Stakeholder", icon: "stakeholder" },
  need: { label: "Need", icon: "need" },
  "use-case": { label: "Use Case", icon: "use-case" },
  requirement: { label: "Requirement", icon: "requirement" },
  component: { label: "Component", icon: "structure" },
  flow: { label: "Flow", icon: "behavior" },
};

const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  approved: "Approved",
  deprecated: "Deprecated",
};

const MOSCOW_LABEL: Record<Moscow, string> = {
  must: "Must",
  should: "Should",
  could: "Could",
  wont: "Won’t",
};

export function DetailPanel() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const closeDetail = useStore((s) => s.closeDetail);
  const updateSelected = useStore((s) => s.updateSelected);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const select = useStore((s) => s.select);

  if (!selection) return null;

  const list: Artifact[] =
    selection.kind === "stakeholder"
      ? project.stakeholders
      : selection.kind === "need"
        ? project.needs
        : selection.kind === "use-case"
          ? project.useCases
          : selection.kind === "requirement"
            ? project.requirements
            : selection.kind === "component"
              ? project.components
              : project.flows;
  const artifact = list.find((a) => a.id === selection.id);
  if (!artifact) return null;

  const meta = TYPE_META[artifact.kind];
  const warn =
    artifact.kind === "need"
      ? needWarning(project, artifact)
      : artifact.kind === "use-case"
        ? useCaseWarning(artifact)
        : artifact.kind === "requirement"
          ? requirementWarning(artifact)
          : null;

  const onDelete = () => {
    if (window.confirm(`Delete ${artifact.id} — “${artifact.title}”? This cannot be undone.`)) {
      deleteSelected();
    }
  };

  return (
    <>
      <div
        onClick={closeDetail}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.5)",
          animation: "tl-fade .18s ease",
          zIndex: 40,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          width: 496,
          maxWidth: "93vw",
          background: "var(--surface)",
          borderLeft: "1px solid rgba(var(--line),.1)",
          boxShadow: "-10px 0 34px rgba(var(--line),.11)",
          zIndex: 41,
          display: "flex",
          flexDirection: "column",
          animation: "tl-slide .24s cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {/* header */}
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "15px 20px",
            borderBottom: "1px solid rgba(var(--line),.08)",
          }}
        >
          <span style={{ display: "flex", color: "var(--sub)" }}>
            <Icon name={meta.icon} size={16} />
          </span>
          <span style={{ font: "500 12.5px 'IBM Plex Mono'", color: "var(--sub)" }}>{artifact.id}</span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--faint)" }} />
          <span
            style={{
              font: "500 10.5px 'IBM Plex Sans'",
              color: "var(--ter)",
              textTransform: "uppercase",
              letterSpacing: ".07em",
            }}
          >
            {meta.label}
          </span>
          {warn ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                font: "500 10.5px 'IBM Plex Sans'",
                color: "var(--warn-ink)",
                background: "var(--warn-bg)",
                padding: "3px 8px",
                borderRadius: 5,
              }}
            >
              <Icon name="warn" size={12} color="var(--warn-ink)" />
              {warn.message}
            </span>
          ) : null}
          <div style={{ flex: 1 }} />
          <IconButton icon="trash" title="Delete" danger onClick={onDelete} />
          <IconButton icon="close" title="Close" onClick={closeDetail} />
        </div>

        {/* body */}
        <div style={{ flex: 1, overflow: "auto", padding: "22px 22px 48px" }}>
          <TitleInput
            value={artifact.title}
            onChange={(v) => updateSelected({ title: v } as Partial<Artifact>)}
          />

          {/* Only the prioritised spine artifacts carry status/priority.
              Stakeholders, components and flows don't. */}
          {(artifact.kind === "need" ||
            artifact.kind === "use-case" ||
            artifact.kind === "requirement") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
              <div>
                <div style={labelStyle}>Status</div>
                <Select<Status>
                  value={artifact.status}
                  onChange={(v) => updateSelected({ status: v } as Partial<Artifact>)}
                  options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                />
              </div>
              <div>
                <div style={labelStyle}>Priority (MoSCoW)</div>
                <Select<Moscow>
                  value={artifact.moscow}
                  onChange={(v) => updateSelected({ moscow: v } as Partial<Artifact>)}
                  options={MOSCOWS.map((m) => ({ value: m, label: MOSCOW_LABEL[m] }))}
                />
              </div>
            </div>
          )}

          {artifact.kind === "stakeholder" && (
            <StakeholderBody
              stakeholder={artifact}
              update={(patch) => updateSelected(patch as Partial<Artifact>)}
            />
          )}
          {artifact.kind === "need" && (
            <NeedBody
              need={artifact}
              update={(patch) => updateSelected(patch as Partial<Artifact>)}
            />
          )}
          {artifact.kind === "use-case" && (
            <UseCaseBody
              uc={artifact}
              update={(patch) => updateSelected(patch as Partial<Artifact>)}
              onOpenNeed={(id) => select("need", id)}
            />
          )}
          {artifact.kind === "requirement" && (
            <RequirementBody
              req={artifact}
              update={(patch) => updateSelected(patch as Partial<Artifact>)}
              onOpenUseCase={(id) => select("use-case", id)}
            />
          )}
          {artifact.kind === "component" && (
            <ComponentBody
              component={artifact}
              update={(patch) => updateSelected(patch as Partial<Artifact>)}
              onOpenUseCase={(id) => select("use-case", id)}
              onOpenRequirement={(id) => select("requirement", id)}
            />
          )}
          {artifact.kind === "flow" && (
            <FlowBody flow={artifact} onOpenUseCase={(id) => select("use-case", id)} />
          )}
        </div>
      </div>
    </>
  );
}

const labelStyle = {
  font: "500 10px 'IBM Plex Mono'",
  letterSpacing: ".08em",
  textTransform: "uppercase" as const,
  color: "var(--ter)",
  marginBottom: 6,
};

function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        border: "none",
        outline: "none",
        font: "600 21px 'IBM Plex Sans'",
        letterSpacing: "-.025em",
        color: "var(--ink)",
        padding: "0 0 4px",
        marginBottom: 18,
        background: "transparent",
      }}
    />
  );
}

function IconButton({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: IconName;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover
          ? danger
            ? "oklch(0.95 0.05 25)"
            : "rgba(var(--line),.035)"
          : "transparent",
        color: hover && danger ? "oklch(0.5 0.16 25)" : "var(--sub)",
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
