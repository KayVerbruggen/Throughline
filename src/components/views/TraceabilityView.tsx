import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  chainOf,
  needWarning,
  requirementWarning,
} from "../../model/trace";
import { useStore } from "../../state/store";
import type { Artifact, Project } from "../../types";
import { EarsBadge, MoscowBadge, StatusBadge } from "../badges";
import { Icon, type IconName } from "../icons";

interface Edge {
  from: string;
  to: string;
}
interface EdgePath extends Edge {
  d: string;
}

function edgesOf(project: Project): Edge[] {
  const edges: Edge[] = [];
  for (const u of project.useCases) {
    for (const n of u.trace) edges.push({ from: n, to: u.id });
  }
  for (const r of project.requirements) {
    for (const u of r.trace) edges.push({ from: u, to: r.id });
  }
  return edges;
}

export function TraceabilityView() {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const [hover, setHover] = useState<string | null>(null);
  const [paths, setPaths] = useState<EdgePath[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next: EdgePath[] = [];
    for (const edge of edgesOf(project)) {
      const a = cardRefs.current.get(edge.from);
      const b = cardRefs.current.get(edge.to);
      if (!a || !b) continue;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const x1 = ar.right - cRect.left;
      const y1 = ar.top - cRect.top + ar.height / 2;
      const x2 = br.left - cRect.left;
      const y2 = br.top - cRect.top + br.height / 2;
      const dx = (x2 - x1) / 2;
      next.push({ ...edge, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` });
    }
    setPaths(next);
  }, [project]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const chain = hover ? chainOf(project, hover) : null;
  const inChain = (id: string) => !chain || chain.has(id);

  return (
    <div style={{ padding: "20px 26px 48px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0, font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--sub)", maxWidth: 500 }}>
          Hover any card to light up its trace chain across the columns. Warning markers flag
          orphaned requirements and must-priority needs whose linked use cases are all lower
          priority.
        </p>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Legend icon="need" label="Need" />
          <Legend icon="use-case" label="Use Case" />
          <Legend icon="requirement" label="Requirement" />
          <Legend icon="warn" label="Needs review" color="var(--warn)" />
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 52,
          alignItems: "start",
        }}
      >
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
        >
          {paths.map((p, i) => {
            const active = chain != null && chain.has(p.from) && chain.has(p.to);
            return (
              <path
                key={i}
                d={p.d}
                fill="none"
                stroke={active ? "var(--accent)" : "rgba(var(--line),.14)"}
                strokeWidth={active ? 1.8 : 1.2}
                opacity={chain && !active ? 0.35 : 1}
              />
            );
          })}
        </svg>

        <Column icon="need" title="Needs" count={project.needs.length}>
          {project.needs.map((n) => (
            <Card
              key={n.id}
              artifact={n}
              dim={!inChain(n.id)}
              highlight={chain?.has(n.id) ?? false}
              warn={needWarning(project, n)?.message}
              register={registerCard}
              onEnter={() => setHover(n.id)}
              onLeave={() => setHover(null)}
              onOpen={() => select("need", n.id)}
            />
          ))}
        </Column>

        <Column icon="use-case" title="Use Cases" count={project.useCases.length}>
          {project.useCases.map((u) => (
            <Card
              key={u.id}
              artifact={u}
              dim={!inChain(u.id)}
              highlight={chain?.has(u.id) ?? false}
              register={registerCard}
              onEnter={() => setHover(u.id)}
              onLeave={() => setHover(null)}
              onOpen={() => select("use-case", u.id)}
            />
          ))}
        </Column>

        <Column icon="requirement" title="Requirements" count={project.requirements.length}>
          {project.requirements.map((r) => (
            <Card
              key={r.id}
              artifact={r}
              dim={!inChain(r.id)}
              highlight={chain?.has(r.id) ?? false}
              warn={requirementWarning(r)?.message}
              register={registerCard}
              onEnter={() => setHover(r.id)}
              onLeave={() => setHover(null)}
              onOpen={() => select("requirement", r.id)}
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

function Legend({ icon, label, color }: { icon: IconName; label: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: "400 12px 'IBM Plex Sans'",
        color: "var(--sub)",
      }}
    >
      <span style={{ display: "flex" }}>
        <Icon name={icon} size={15} color={color ?? "var(--sub)"} />
      </span>
      {label}
    </span>
  );
}

function Column({
  icon,
  title,
  count,
  children,
}: {
  icon: IconName;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative", zIndex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 2px" }}>
        <span style={{ display: "flex", color: "var(--sub)" }}>
          <Icon name={icon} size={15} />
        </span>
        <span
          style={{
            font: "600 10.5px 'IBM Plex Mono'",
            letterSpacing: ".09em",
            textTransform: "uppercase",
            color: "var(--sub)",
          }}
        >
          {title}
        </span>
        <span style={{ font: "400 11px 'IBM Plex Mono'", color: "var(--faint)" }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Card({
  artifact,
  dim,
  highlight,
  warn,
  register,
  onEnter,
  onLeave,
  onOpen,
}: {
  artifact: Artifact;
  dim: boolean;
  highlight: boolean;
  warn?: string;
  register: (id: string, el: HTMLDivElement | null) => void;
  onEnter: () => void;
  onLeave: () => void;
  onOpen: () => void;
}) {
  const isReq = artifact.kind === "requirement";
  return (
    <div
      ref={(el) => register(artifact.id, el)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onOpen}
      style={{
        border: `1px solid ${highlight ? "var(--accent)" : "rgba(var(--line),.09)"}`,
        borderRadius: 10,
        padding: "12px 13px",
        background: "var(--surface)",
        cursor: "pointer",
        opacity: dim ? 0.38 : 1,
        transition: "opacity .15s ease, border-color .15s ease",
        boxShadow: highlight ? "0 1px 8px rgba(var(--line),.08)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ font: "500 11.5px 'IBM Plex Mono'", color: "var(--sub)" }}>{artifact.id}</span>
        {warn ? (
          <span style={{ display: "flex" }} title={warn}>
            <Icon name="warn" size={13} color="var(--warn)" title={warn} />
          </span>
        ) : null}
        <div style={{ flex: 1 }} />
        <StatusBadge status={artifact.status} />
      </div>
      <div
        style={{
          font: "500 13px/1.35 'IBM Plex Sans'",
          color: "var(--ink)",
          marginBottom: 8,
          textWrap: "pretty",
        }}
      >
        {artifact.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isReq ? <EarsBadge ears={artifact.ears} /> : null}
        <MoscowBadge moscow={artifact.moscow} />
      </div>
    </div>
  );
}
