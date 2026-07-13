import { useStore, type ViewId } from "../../state/store";
import { Icon, type IconName } from "../icons";

const CONFIG: Partial<Record<ViewId, { title: string; icon: IconName; message: string }>> = {
  structure: {
    title: "System Structure",
    icon: "structure",
    message:
      "One dynamic, navigable containment view of components and their loose connections. Coming after the Needs → Requirements spine is in place.",
  },
  behavior: {
    title: "System Behavior",
    icon: "behavior",
    message:
      "Bootstrap behavior from concrete scenarios, tag steps with components, then merge fragments into canonical state charts. Coming in a later slice.",
  },
};

export function ComingSoon({ view }: { view: ViewId }) {
  const setView = useStore((s) => s.setView);
  const cfg = CONFIG[view] ?? CONFIG.structure!;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 16,
        padding: 40,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid rgba(var(--line),.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ter)",
          boxShadow: "0 1px 3px rgba(var(--line),.05)",
        }}
      >
        <Icon name={cfg.icon} size={24} />
      </div>
      <div style={{ font: "600 18px 'IBM Plex Sans'", letterSpacing: "-.02em" }}>{cfg.title}</div>
      <p
        style={{
          margin: 0,
          maxWidth: 390,
          font: "400 13.5px/1.6 'IBM Plex Sans'",
          color: "var(--sub)",
        }}
      >
        {cfg.message}
      </p>
      <span
        style={{
          font: "500 9.5px 'IBM Plex Mono'",
          letterSpacing: ".13em",
          textTransform: "uppercase",
          color: "var(--accent)",
          background: "var(--accent-bg)",
          padding: "6px 13px",
          borderRadius: 20,
        }}
      >
        Coming soon
      </span>
      <button
        onClick={() => setView("needs")}
        style={{
          marginTop: 4,
          border: "none",
          background: "transparent",
          color: "var(--accent)",
          font: "500 12.5px 'IBM Plex Sans'",
          cursor: "pointer",
        }}
      >
        ← Back to Needs
      </button>
    </div>
  );
}
