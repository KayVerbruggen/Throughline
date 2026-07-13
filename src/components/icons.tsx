import type { CSSProperties } from "react";

export type IconName =
  | "stakeholder"
  | "need"
  | "use-case"
  | "requirement"
  | "structure"
  | "behavior"
  | "trace"
  | "search"
  | "plus"
  | "warn"
  | "trash"
  | "close"
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
