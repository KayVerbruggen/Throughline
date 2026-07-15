import type { CSSProperties } from "react";

export type IconName =
  | "stakeholder"
  | "need"
  | "use-case"
  | "requirement"
  | "structure"
  | "behavior"
  | "diagram"
  | "trace"
  | "search"
  | "plus"
  | "warn"
  | "trash"
  | "close"
  | "back"
  | "check"
  | "chevron"
  | "list"
  | "play"
  | "grip"
  | "focus"
  | "folder"
  | "decision"
  | "glossary"
  | "test"
  | "sun"
  | "moon";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
  title?: string;
}

const S = 1.6;

export function Icon({ name, size = 17, color = "currentColor", style, title }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 18 18",
    fill: "none",
    style: { display: "block", ...style },
    "aria-hidden": title ? undefined : true,
  } as const;

  const stroke = { stroke: color, strokeWidth: S, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  return (
    <svg {...common} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {shape(name, color, stroke)}
    </svg>
  );
}

function shape(name: IconName, color: string, stroke: Record<string, unknown>) {
  switch (name) {
    case "stakeholder":
      return (
        <>
          <circle cx={9} cy={6} r={2.7} {...stroke} />
          <path d="M3.8 15a5.2 5.2 0 0 1 10.4 0" {...stroke} />
        </>
      );
    case "need":
      return <circle cx={9} cy={9} r={5.4} {...stroke} />;
    case "structure":
      return <rect x={3.6} y={3.6} width={10.8} height={10.8} rx={2} {...stroke} />;
    case "requirement":
      return <path d="M9 2.6 15.4 9 9 15.4 2.6 9Z" {...stroke} />;
    case "use-case":
      return (
        <>
          <rect x={2.4} y={6.2} width={9} height={9} rx={1.8} {...stroke} />
          <rect x={6.6} y={2.4} width={9} height={9} rx={1.8} fill="var(--panel)" {...stroke} />
        </>
      );
    case "behavior":
      return (
        <>
          <circle cx={4.5} cy={4.5} r={2.1} {...stroke} />
          <circle cx={13.5} cy={13.5} r={2.1} {...stroke} />
          <path d="M6.6 4.5H10a2.4 2.4 0 0 1 2.4 2.4V11" {...stroke} />
        </>
      );
    case "diagram":
      // Two nodes joined by a control-flow arrow — the activity diagram.
      return (
        <>
          <rect x={2.4} y={3} width={7} height={5} rx={2.5} {...stroke} />
          <rect x={8.6} y={10} width={7} height={5} rx={2.5} {...stroke} />
          <path d="M6 8v1.2a2 2 0 0 0 2 2h1.1" {...stroke} />
        </>
      );
    case "trace":
      return (
        <>
          <circle cx={3.6} cy={9} r={2} fill={color} />
          <circle cx={14.4} cy={4.4} r={2} fill={color} />
          <circle cx={14.4} cy={13.6} r={2} fill={color} />
          <path d="M5.4 8.1 12.6 4.9M5.4 9.9l7.2 3.2" stroke={color} strokeWidth={1.4} />
        </>
      );
    case "search":
      return (
        <>
          <circle cx={8} cy={8} r={4.6} {...stroke} />
          <path d="M11.6 11.6 15 15" {...stroke} />
        </>
      );
    case "plus":
      return <path d="M9 3.8v10.4M3.8 9h10.4" {...stroke} />;
    case "warn":
      return (
        <>
          <path d="M9 2.8 16 15H2L9 2.8Z" {...stroke} />
          <path d="M9 7.2v3.4" {...stroke} />
          <circle cx={9} cy={12.6} r={0.9} fill={color} />
        </>
      );
    case "trash":
      return (
        <>
          <path d="M3.8 5.2h10.4M7.4 5.2V4a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v1.2M5 5.2l.7 8.4a1.2 1.2 0 0 0 1.2 1.1h4.2a1.2 1.2 0 0 0 1.2-1.1l.7-8.4" {...stroke} />
        </>
      );
    case "close":
      return <path d="M4.4 4.4 13.6 13.6M13.6 4.4 4.4 13.6" {...stroke} />;
    case "back":
      return <path d="M11 4 6 9l5 5" {...stroke} />;
    case "check":
      return <path d="M3.8 9.4 7.2 13 14.2 5.4" {...stroke} />;
    case "chevron":
      return <path d="M4.5 6.75 9 11.25l4.5-4.5" {...stroke} />;
    case "list":
      // Stacked rows — the ordered step list you author in Build mode.
      return (
        <>
          <path d="M6 5h9M6 9h9M6 13h9" {...stroke} />
          <circle cx={3.2} cy={5} r={0.9} fill={color} />
          <circle cx={3.2} cy={9} r={0.9} fill={color} />
          <circle cx={3.2} cy={13} r={0.9} fill={color} />
        </>
      );
    case "play":
      // A filled triangle — walking the token through in Run mode.
      return <path d="M5.5 3.8 14 9l-8.5 5.2Z" fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />;
    case "grip":
      return (
        <>
          <circle cx={6.6} cy={4.5} r={1.1} fill={color} />
          <circle cx={11.4} cy={4.5} r={1.1} fill={color} />
          <circle cx={6.6} cy={9} r={1.1} fill={color} />
          <circle cx={11.4} cy={9} r={1.1} fill={color} />
          <circle cx={6.6} cy={13.5} r={1.1} fill={color} />
          <circle cx={11.4} cy={13.5} r={1.1} fill={color} />
        </>
      );
    case "focus":
      return (
        <>
          <path d="M3 6.5V4.5A1.5 1.5 0 0 1 4.5 3H6.5" {...stroke} />
          <path d="M11.5 3H13.5A1.5 1.5 0 0 1 15 4.5V6.5" {...stroke} />
          <path d="M15 11.5V13.5A1.5 1.5 0 0 1 13.5 15H11.5" {...stroke} />
          <path d="M6.5 15H4.5A1.5 1.5 0 0 1 3 13.5V11.5" {...stroke} />
          <circle cx={9} cy={9} r={1.7} fill={color} />
        </>
      );
    case "folder":
      return (
        <path
          d="M2.6 5.4a1.4 1.4 0 0 1 1.4-1.4h2.3l1.4 1.6h6.3a1.4 1.4 0 0 1 1.4 1.4v5.6a1.4 1.4 0 0 1-1.4 1.4H4a1.4 1.4 0 0 1-1.4-1.4Z"
          {...stroke}
        />
      );
    case "decision":
      // A lightbulb — the recorded rationale / "why".
      return (
        <>
          <path d="M6 11.2a4 4 0 1 1 6 0c-.5.6-.9 1.1-1 1.9H7c-.1-.8-.5-1.3-1-1.9Z" {...stroke} />
          <path d="M7.3 15.2h3.4" {...stroke} />
        </>
      );
    case "glossary":
      // An open book — the shared vocabulary.
      return (
        <>
          <path d="M9 4.6C7.6 3.7 5.7 3.5 4 3.9v8.9c1.7-.4 3.6-.2 5 .7 1.4-.9 3.3-1.1 5-.7V3.9c-1.7-.4-3.6-.2-5 .7Z" {...stroke} />
          <path d="M9 4.6v8.9" {...stroke} />
        </>
      );
    case "test":
      // A check inside a rounded badge — a verified requirement.
      return (
        <>
          <rect x={3} y={3} width={12} height={12} rx={3.2} {...stroke} />
          <path d="M6 9.2 8.1 11.3 12 6.9" {...stroke} />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx={9} cy={9} r={3.2} {...stroke} />
          <path d="M9 1.8v1.8M9 14.4v1.8M1.8 9h1.8M14.4 9h1.8M3.9 3.9l1.3 1.3M12.8 12.8l1.3 1.3M14.1 3.9l-1.3 1.3M5.2 12.8l-1.3 1.3" {...stroke} />
        </>
      );
    case "moon":
      return <path d="M14.5 10.6A6 6 0 0 1 7.4 3.5a6 6 0 1 0 7.1 7.1Z" {...stroke} />;
  }
}
