import { useState, type ReactNode } from "react";

export function ListContainer({ children }: { children: ReactNode }) {
  return <div style={{ padding: "6px 26px 48px" }}>{children}</div>;
}

export function HeaderRow({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 14,
        padding: "11px 14px",
        font: "500 10px 'IBM Plex Mono'",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--ter)",
        borderBottom: "1px solid rgba(var(--line),.08)",
      }}
    >
      {labels.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

export function Row({
  columns,
  onClick,
  children,
}: {
  columns: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 14,
        alignItems: "center",
        padding: "13px 14px",
        borderBottom: "1px solid rgba(var(--line),.055)",
        cursor: "pointer",
        borderRadius: 8,
        background: hover ? "rgba(var(--line),.035)" : "transparent",
      }}
    >
      {children}
    </div>
  );
}

export function CellId({ id, warnMessage }: { id: string; warnMessage?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        font: "500 12.5px 'IBM Plex Mono'",
        color: "var(--sub)",
      }}
    >
      {warnMessage ? <WarnInline message={warnMessage} /> : null}
      {id}
    </div>
  );
}

export function CellTitle({ title }: { title: string }) {
  return (
    <div
      style={{
        font: "500 13.5px 'IBM Plex Sans'",
        color: "var(--ink)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {title}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: "40px 14px", font: "400 13px 'IBM Plex Sans'", color: "var(--ter)" }}>
      {message}
    </div>
  );
}

// small local warn icon to avoid an import cycle with badges
import { Icon } from "./icons";
function WarnInline({ message }: { message: string }) {
  return (
    <span style={{ display: "flex" }} title={message}>
      <Icon name="warn" size={14} color="var(--warn)" title={message} />
    </span>
  );
}
