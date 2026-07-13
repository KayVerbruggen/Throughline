import { useState, type ReactNode } from "react";

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div
      style={{
        font: "500 10px 'IBM Plex Mono'",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--ter)",
        marginBottom: 6,
      }}
    >
      {children}
      {hint ? (
        <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--faint)" }}>
          {" "}
          {hint}
        </span>
      ) : null}
    </div>
  );
}

const BASE_INPUT = {
  width: "100%",
  padding: "8px 11px",
  border: "1px solid rgba(var(--line),.12)",
  borderRadius: 8,
  outline: "none",
  background: "var(--surface)",
} as const;

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        ...BASE_INPUT,
        font: `400 13px '${mono ? "IBM Plex Mono" : "IBM Plex Sans"}'`,
        borderColor: focus ? "oklch(0.6 0.12 258)" : "rgba(var(--line),.12)",
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        ...BASE_INPUT,
        padding: "8px 10px",
        font: "400 13px 'IBM Plex Sans'",
        cursor: "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea({
  value,
  onChange,
  rows = 6,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  mono?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: "100%",
        padding: "12px 13px",
        border: `1px solid ${focus ? "oklch(0.6 0.12 258)" : "rgba(var(--line),.12)"}`,
        borderRadius: 9,
        font: mono ? "400 13px/1.6 'IBM Plex Mono'" : "400 13.5px/1.65 'IBM Plex Sans'",
        color: "var(--ink)",
        resize: "vertical",
        outline: "none",
        background: focus ? "var(--surface)" : "var(--surface2)",
      }}
    />
  );
}

export function Section({ children, mb = 20 }: { children: ReactNode; mb?: number }) {
  return <div style={{ marginBottom: mb }}>{children}</div>;
}
