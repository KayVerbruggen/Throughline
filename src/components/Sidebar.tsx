import { useEffect, useRef, useState } from "react";

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
  { id: "tests", label: "Tests", icon: "test" },
  { id: "structure", label: "System Structure", icon: "structure" },
  { id: "behavior", label: "System Behavior", icon: "behavior" },
  { id: "state-chart", label: "State Chart", icon: "statechart" },
  { id: "decisions", label: "Design Decisions", icon: "decision" },
  { id: "glossary", label: "Glossary", icon: "glossary" },
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

      <ProjectMenu />
    </aside>
  );
}

/**
 * The bottom-left project switcher: shows the open project and, on click, a
 * popover to open a different project folder or create a new one. Replaces the
 * previously static project label.
 */
function ProjectMenu() {
  const location = useStore((s) => s.storage.location());
  const kind = useStore((s) => s.storage.kind);
  const chooseProject = useStore((s) => s.chooseProject);
  const newProject = useStore((s) => s.newProject);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "new">("menu");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setMode("menu");
    setName("");
  };

  // Dismiss the popover on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const doOpen = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await chooseProject();
    } finally {
      setBusy(false);
      close();
    }
  };

  const doCreate = async () => {
    const trimmed = name.trim();
    if (busy || (kind === "tauri" && !trimmed)) return;
    setBusy(true);
    try {
      await newProject(trimmed);
    } finally {
      setBusy(false);
      close();
    }
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        marginTop: "auto",
        paddingTop: 12,
        borderTop: "1px solid rgba(var(--line),.08)",
      }}
    >
      {open ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(100% + 6px)",
            background: "var(--bg)",
            border: "1px solid rgba(var(--line),.12)",
            borderRadius: 10,
            boxShadow: "0 10px 30px -8px rgba(0,0,0,.28)",
            padding: 6,
            zIndex: 20,
          }}
        >
          {location ? (
            <div
              style={{
                font: "400 10.5px 'IBM Plex Mono'",
                color: "var(--ter)",
                padding: "5px 8px 7px",
                wordBreak: "break-all",
                lineHeight: 1.45,
              }}
              title={location}
            >
              {location}
            </div>
          ) : null}

          {mode === "menu" ? (
            <>
              <MenuItem icon="folder" label="Open project…" onClick={doOpen} />
              <MenuItem icon="plus" label="New project…" onClick={() => setMode("new")} />
            </>
          ) : (
            <div style={{ padding: "4px 6px 6px" }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doCreate();
                }}
                placeholder="Project name"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "7px 9px",
                  border: "1px solid rgba(var(--line),.14)",
                  borderRadius: 7,
                  background: "var(--surface)",
                  font: "400 12.5px 'IBM Plex Sans'",
                  outline: "none",
                }}
              />
              <div
                style={{
                  font: "400 10.5px 'IBM Plex Sans'",
                  color: "var(--ter)",
                  margin: "7px 2px 9px",
                  lineHeight: 1.45,
                }}
              >
                {kind === "tauri"
                  ? "You'll choose where to create it next."
                  : "Starts a fresh, empty project."}
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <button
                  onClick={() => {
                    setMode("menu");
                    setName("");
                  }}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    border: "1px solid rgba(var(--line),.14)",
                    borderRadius: 7,
                    background: "transparent",
                    color: "var(--sub)",
                    font: "500 12px 'IBM Plex Sans'",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void doCreate()}
                  disabled={kind === "tauri" && !name.trim()}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    border: "none",
                    borderRadius: 7,
                    background: kind === "tauri" && !name.trim() ? "var(--ter)" : "var(--ink)",
                    color: "var(--bg)",
                    font: "500 12px 'IBM Plex Sans'",
                    cursor: kind === "tauri" && !name.trim() ? "default" : "pointer",
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="Switch project"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          width: "100%",
          padding: "8px 8px",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          textAlign: "left",
          background: open || hover ? "rgba(var(--line),.05)" : "transparent",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "oklch(0.88 0.06 258)",
            flex: "none",
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
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
        <span
          style={{
            display: "flex",
            flex: "none",
            color: "var(--ter)",
            transform: "rotate(180deg)",
          }}
        >
          <Icon name="chevron" size={15} />
        </span>
      </button>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 8px",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        textAlign: "left",
        font: "400 12.5px 'IBM Plex Sans'",
        color: "var(--ink)",
        background: hover ? "rgba(var(--line),.06)" : "transparent",
      }}
    >
      <span style={{ display: "flex", flex: "none", color: "var(--sub)" }}>
        <Icon name={icon} size={16} />
      </span>
      {label}
    </button>
  );
}

function shortName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}
