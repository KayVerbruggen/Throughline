import { useState } from "react";

import { useStore, type ViewId } from "../state/store";
import { Icon, type IconName } from "./icons";

interface NavDef {
  id: ViewId;
  label: string;
  icon: IconName;
  soon?: boolean;
}

const NAV: NavDef[] = [
  { id: "stakeholders", label: "Stakeholders", icon: "stakeholder" },
  { id: "needs", label: "Needs", icon: "need" },
  { id: "use-cases", label: "Use Cases", icon: "use-case" },
  { id: "requirements", label: "Requirements", icon: "requirement" },
  { id: "structure", label: "System Structure", icon: "structure" },
  { id: "behavior", label: "System Behavior", icon: "behavior" },
  { id: "traceability", label: "Traceability", icon: "trace" },
];

function NavButton({ def }: { def: NavDef }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const [hover, setHover] = useState(false);
  const active = view === def.id;

  return (
    <button
      onClick={() => setView(def.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 9px",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        font: `${active ? 500 : 400} 13px 'IBM Plex Sans'`,
        color: active ? "var(--ink)" : "var(--sub)",
        background: active
          ? "rgba(var(--line),.06)"
          : hover
            ? "rgba(var(--line),.035)"
            : "transparent",
      }}
    >
      <span
        style={{
          display: "flex",
          width: 17,
          height: 17,
          flex: "none",
          alignItems: "center",
          justifyContent: "center",
          color: active ? "var(--ink)" : "var(--sub)",
        }}
      >
        <Icon name={def.icon} size={17} />
      </span>
      <span style={{ flex: 1 }}>{def.label}</span>
      {def.soon ? (
        <span
          style={{
            font: "500 8.5px 'IBM Plex Mono'",
            letterSpacing: ".09em",
            color: "var(--ter)",
            textTransform: "uppercase",
          }}
        >
          soon
        </span>
      ) : null}
    </button>
  );
}

export function Sidebar() {
  const location = useStore((s) => s.storage.location());
  const kind = useStore((s) => s.storage.kind);

  return (
    <aside
      style={{
        width: 246,
        flex: "none",
        height: "100%",
        background: "var(--panel)",
        borderRight: "1px solid rgba(var(--line),.08)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 18px" }}>
        <div
          style={{
            width: 25,
            height: 25,
            borderRadius: 7,
            background: "var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              background: "var(--bg)",
              transform: "rotate(45deg)",
              borderRadius: 1.5,
            }}
          />
        </div>
        <div style={{ font: "600 15px 'IBM Plex Sans'", letterSpacing: "-.02em" }}>Throughline</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((def) => (
          <NavButton key={def.id} def={def} />
        ))}
      </nav>

      <div
        style={{
          marginTop: "auto",
          padding: "14px 8px 4px",
          borderTop: "1px solid rgba(var(--line),.08)",
        }}
      >
        <div
          style={{
            font: "500 9px 'IBM Plex Mono'",
            letterSpacing: ".11em",
            textTransform: "uppercase",
            color: "var(--ter)",
            marginBottom: 8,
          }}
        >
          Project
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "oklch(0.88 0.06 258)",
              flex: "none",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                font: "500 12.5px 'IBM Plex Sans'",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={location ?? undefined}
            >
              {location ? shortName(location) : "No project"}
            </div>
            <div style={{ font: "400 10.5px 'IBM Plex Mono'", color: "var(--ter)" }}>
              {kind === "tauri" ? "local files" : "browser · demo"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function shortName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}
