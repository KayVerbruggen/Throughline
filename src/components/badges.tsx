import type { CSSProperties, ReactNode } from "react";

import type { EarsPattern, Moscow, StakeholderType, Status } from "../types";
import { Icon } from "./icons";

// --- label + color maps -----------------------------------------------------

const STATUS: Record<Status, { bg: string; color: string; label: string }> = {
  draft: { bg: "rgba(var(--line),.06)", color: "#6b6c70", label: "Draft" },
  approved: { bg: "oklch(0.94 0.045 150)", color: "oklch(0.42 0.09 150)", label: "Approved" },
  deprecated: { bg: "oklch(0.94 0.04 40)", color: "oklch(0.48 0.11 40)", label: "Deprecated" },
};

const STAKEHOLDER_TYPE: Record<StakeholderType, { bg: string; color: string; label: string }> = {
  primary: { bg: "oklch(0.95 0.03 258)", color: "oklch(0.48 0.12 258)", label: "Primary" },
  secondary: { bg: "rgba(var(--line),.06)", color: "var(--sub)", label: "Secondary" },
};

const MOSCOW: Record<Moscow, { color: string; label: string }> = {
  must: { color: "oklch(0.55 0.17 25)", label: "Must" },
  should: { color: "oklch(0.58 0.13 65)", label: "Should" },
  could: { color: "oklch(0.55 0.12 245)", label: "Could" },
  wont: { color: "oklch(0.58 0.015 280)", label: "Won’t" },
};

export const EARS_LABEL: Record<EarsPattern, string> = {
  ubiquitous: "Ubiquitous",
  "event-driven": "Event-driven",
  "unwanted-behavior": "Unwanted behaviour",
  "state-driven": "State-driven",
  optional: "Optional",
  complex: "Complex",
};

// --- components -------------------------------------------------------------

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        font: "500 10.5px 'IBM Plex Mono'",
        letterSpacing: ".02em",
        color: s.color,
        background: s.bg,
        padding: "3px 8px",
        borderRadius: 6,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export function StakeholderTypeBadge({ type }: { type: StakeholderType }) {
  const t = STAKEHOLDER_TYPE[type];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        font: "500 10.5px 'IBM Plex Mono'",
        letterSpacing: ".02em",
        color: t.color,
        background: t.bg,
        padding: "3px 8px",
        borderRadius: 6,
        whiteSpace: "nowrap",
      }}
    >
      {t.label}
    </span>
  );
}

export function MoscowBadge({ moscow }: { moscow: Moscow }) {
  const m = MOSCOW[moscow];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, flex: "none" }}
      />
      <span style={{ font: "500 12.5px 'IBM Plex Sans'", color: m.color }}>{m.label}</span>
    </span>
  );
}

export function EarsBadge({ ears }: { ears: EarsPattern }) {
  return (
    <span
      style={{
        display: "inline-flex",
        font: "500 11px 'IBM Plex Mono'",
        color: "var(--sub)",
        background: "rgba(var(--line),.05)",
        padding: "3px 7px",
        borderRadius: 5,
        whiteSpace: "nowrap",
      }}
    >
      {EARS_LABEL[ears]}
    </span>
  );
}

export function TraceChip({
  id,
  onOpen,
  icon,
}: {
  id: string;
  onOpen?: (e: React.MouseEvent) => void;
  icon?: ReactNode;
}) {
  return (
    <span
      onClick={onOpen}
      className="trace-chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: "500 11px 'IBM Plex Mono'",
        color: "var(--accent-ink)",
        background: "var(--accent-bg)",
        padding: icon ? "4px 9px" : "2px 7px",
        borderRadius: icon ? 6 : 5,
        cursor: onOpen ? "pointer" : "default",
      }}
    >
      {icon}
      {id}
    </span>
  );
}

export function OrphanChip() {
  return (
    <span
      style={{
        font: "500 11px 'IBM Plex Mono'",
        color: "var(--warn)",
        background: "var(--warn-bg)",
        padding: "2px 7px",
        borderRadius: 5,
      }}
    >
      orphan
    </span>
  );
}

export function WarnMark({ message }: { message: string }) {
  return (
    <span style={{ display: "inline-flex" }} title={message}>
      <Icon name="warn" size={14} color="var(--warn)" title={message} />
    </span>
  );
}

export function fieldLabelStyle(): CSSProperties {
  return {
    font: "500 10px 'IBM Plex Mono'",
    letterSpacing: ".08em",
    textTransform: "uppercase",
    color: "var(--ter)",
    marginBottom: 6,
  };
}
