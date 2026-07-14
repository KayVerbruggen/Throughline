import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { composeEars } from "../../model/ears";
import { chainOf, needWarning, requirementWarning, testWarning } from "../../model/trace";
import { useStore } from "../../state/store";
import type { ArtifactKind, Project, SpineArtifact, Test } from "../../types";
import { EARS_LABEL, EarsBadge, MoscowBadge, StatusBadge, TestResultBadge } from "../badges";
import { Icon, type IconName } from "../icons";

/** A card in the traceability grid: a spine artifact or a test. */
type TraceNode = SpineArtifact | Test;

/** The element kinds shown as columns, in spine order. */
const COLUMN_KINDS = ["need", "use-case", "requirement", "test"] as const;
type ColumnKind = (typeof COLUMN_KINDS)[number];

const COLUMN_META: Record<ColumnKind, { icon: IconName; title: string; label: string }> = {
  need: { icon: "need", title: "Needs", label: "Needs" },
  "use-case": { icon: "use-case", title: "Use Cases", label: "Use Cases" },
  requirement: { icon: "requirement", title: "Requirements", label: "Requirements" },
  test: { icon: "test", title: "Tests", label: "Tests" },
};

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
  for (const t of project.tests) {
    for (const r of t.trace) edges.push({ from: r, to: t.id });
  }
  return edges;
}

function findArtifact(project: Project, id: string): TraceNode | null {
  return (
    project.needs.find((n) => n.id === id) ??
    project.useCases.find((u) => u.id === id) ??
    project.requirements.find((r) => r.id === id) ??
    project.tests.find((t) => t.id === id) ??
    null
  );
}

/**
 * IDs visible when scoped to a single stakeholder: that stakeholder's needs,
 * plus everything downstream of them (use cases tracing to those needs, and
 * requirements tracing to those use cases). `null` = no stakeholder filter.
 */
function stakeholderScope(project: Project, stakeholderId: string | null): Set<string> | null {
  if (stakeholderId == null) return null;
  const scope = new Set<string>();
  const needIds = new Set<string>();
  for (const n of project.needs) {
    if (n.stakeholder === stakeholderId) {
      scope.add(n.id);
      needIds.add(n.id);
    }
  }
  const ucIds = new Set<string>();
  for (const u of project.useCases) {
    if (u.trace.some((id) => needIds.has(id))) {
      scope.add(u.id);
      ucIds.add(u.id);
    }
  }
  const reqIds = new Set<string>();
  for (const r of project.requirements) {
    if (r.trace.some((id) => ucIds.has(id))) {
      scope.add(r.id);
      reqIds.add(r.id);
    }
  }
  for (const t of project.tests) {
    if (t.trace.some((id) => reqIds.has(id))) scope.add(t.id);
  }
  return scope;
}

export function TraceabilityView() {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const setPrefs = useStore((s) => s.setPrefs);
  const [hover, setHover] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  // Stakeholder scope and visible columns are persisted preferences (see
  // ViewPrefs in the store) so they survive navigation and window reopens.
  const traceStakeholder = useStore((s) => s.prefs.traceStakeholder);
  // Drop a persisted stakeholder that no longer exists rather than scoping the
  // grid to a deleted id (which would hide every card).
  const stakeholderId =
    traceStakeholder != null && project.stakeholders.some((s) => s.id === traceStakeholder)
      ? traceStakeholder
      : null;
  const setStakeholderId = (id: string | null) => setPrefs({ traceStakeholder: id });

  // Which element types appear as columns. All on by default; toggling one off
  // drops its whole column (and its edges, which measure() skips automatically).
  const traceColumns = useStore((s) => s.prefs.traceColumns);
  const visibleKinds = useMemo(() => new Set(traceColumns), [traceColumns]);
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
      if (!a || !b) continue; // one endpoint isn't currently rendered (filtered out)
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

  // Re-measure whenever the rendered set changes (project, focus) or on resize.
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, focusId, stakeholderId, visibleKinds]);

  const focused = focusId ? findArtifact(project, focusId) : null;
  const focusMode = focused != null;

  // In focus mode the chain comes from the clicked card and drives filtering.
  // In overview mode, hover previews a chain by dimming everything else.
  const chain = focusMode ? chainOf(project, focused!.id) : hover ? chainOf(project, hover) : null;

  // Optional stakeholder filter: constrains every column to that stakeholder's
  // needs and their downstream trace chain, independently of focus mode.
  const scope = stakeholderScope(project, stakeholderId);

  const visible = (id: string) =>
    (!focusMode || chain!.has(id)) && (scope == null || scope.has(id));

  const needs = project.needs.filter((n) => visible(n.id));
  const useCases = project.useCases.filter((u) => visible(u.id));
  const requirements = project.requirements.filter((r) => visible(r.id));
  const tests = project.tests.filter((t) => visible(t.id));

  const enter = focusMode ? undefined : (id: string) => setHover(id);
  const leave = focusMode ? undefined : () => setHover(null);

  const shownColumns = COLUMN_KINDS.filter((k) => visibleKinds.has(k));
  const toggleKind = (k: ColumnKind) => {
    const next = new Set(visibleKinds);
    // Keep at least one column visible so the grid never collapses to nothing.
    if (next.has(k)) {
      if (next.size > 1) next.delete(k);
    } else {
      next.add(k);
    }
    // Persist in spine order so the stored value is stable across toggles.
    setPrefs({ traceColumns: COLUMN_KINDS.filter((c) => next.has(c)) });
    setFocusId(null);
  };

  const renderCard = (artifact: TraceNode, warn?: string) => {
    if (focusMode && artifact.id === focusId) {
      return (
        <ExpandedCard
          key={artifact.id}
          artifact={artifact}
          warn={warn}
          register={registerCard}
          onBack={() => setFocusId(null)}
          onEdit={() => select(artifact.kind, artifact.id)}
        />
      );
    }
    return (
      <Card
        key={artifact.id}
        artifact={artifact}
        dim={!focusMode && chain != null && !chain.has(artifact.id)}
        highlight={!focusMode && (chain?.has(artifact.id) ?? false)}
        warn={warn}
        register={registerCard}
        onEnter={enter ? () => enter(artifact.id) : undefined}
        onLeave={leave}
        onClick={() => setFocusId(artifact.id)}
      />
    );
  };

  return (
    <div style={{ padding: "20px 26px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        <p style={{ margin: 0, font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--sub)", maxWidth: 520 }}>
          {focusMode ? (
            <>
              Focused on <strong style={{ color: "var(--ink)" }}>{focused!.id}</strong> — the columns
              are filtered to just its trace chain. Click another card to shift focus, or use{" "}
              <strong style={{ color: "var(--ink)" }}>Full view</strong> to reset.
            </>
          ) : (
            "Hover a card to preview its trace chain. Click any card to focus it: the card expands and the columns filter to just its linked artifacts."
          )}
        </p>
        <div style={{ flex: 1 }} />
        {project.stakeholders.length > 0 ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ font: "500 10.5px 'IBM Plex Mono'", letterSpacing: ".09em", textTransform: "uppercase", color: "var(--sub)" }}>
              Stakeholder
            </span>
            <select
              value={stakeholderId ?? ""}
              onChange={(e) => {
                setStakeholderId(e.target.value || null);
                setFocusId(null);
              }}
              style={selectStyle}
            >
              <option value="">All stakeholders</option>
              {project.stakeholders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {focusMode ? (
          <button onClick={() => setFocusId(null)} style={fullViewBtnStyle}>
            <Icon name="close" size={13} />
            Full view
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ font: "500 10.5px 'IBM Plex Mono'", letterSpacing: ".09em", textTransform: "uppercase", color: "var(--sub)", marginRight: 2 }}>
              Show
            </span>
            {COLUMN_KINDS.map((k) => (
              <FilterChip
                key={k}
                icon={COLUMN_META[k].icon}
                label={COLUMN_META[k].label}
                on={visibleKinds.has(k)}
                onClick={() => toggleKind(k)}
              />
            ))}
          </div>
        )}
      </div>

      {shownColumns.length === 0 ? null : (
        <div
          ref={containerRef}
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: `repeat(${shownColumns.length}, 1fr)`,
            gap: 52,
            alignItems: "start",
          }}
        >
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}>
            {paths.map((p, i) => {
              const active = chain != null && chain.has(p.from) && chain.has(p.to);
              return (
                <path
                  key={i}
                  d={p.d}
                  fill="none"
                  stroke={active ? "var(--accent)" : "rgba(var(--line),.14)"}
                  strokeWidth={active ? 1.8 : 1.2}
                  opacity={chain && !active ? 0.3 : 1}
                />
              );
            })}
          </svg>

          {shownColumns.map((k) => {
            const meta = COLUMN_META[k];
            if (k === "need") {
              return (
                <Column key={k} icon={meta.icon} title={meta.title} count={needs.length}>
                  {needs.map((n) => renderCard(n, needWarning(project, n)?.message))}
                </Column>
              );
            }
            if (k === "use-case") {
              return (
                <Column key={k} icon={meta.icon} title={meta.title} count={useCases.length}>
                  {useCases.map((u) => renderCard(u))}
                </Column>
              );
            }
            if (k === "requirement") {
              return (
                <Column key={k} icon={meta.icon} title={meta.title} count={requirements.length}>
                  {requirements.map((r) => renderCard(r, requirementWarning(r)?.message))}
                </Column>
              );
            }
            return (
              <Column key={k} icon={meta.icon} title={meta.title} count={tests.length}>
                {tests.map((t) => renderCard(t, testWarning(t)?.message))}
              </Column>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  icon,
  label,
  on,
  onClick,
}: {
  icon: IconName;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={on ? `Hide ${label}` : `Show ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        border: `1px solid ${on ? "var(--accent)" : "rgba(var(--line),.14)"}`,
        borderRadius: 20,
        cursor: "pointer",
        background: on ? "var(--accent-bg)" : "transparent",
        color: on ? "var(--accent-ink)" : "var(--ter)",
        font: "500 12px 'IBM Plex Sans'",
      }}
    >
      <Icon name={icon} size={13} color={on ? "var(--accent-ink)" : "var(--ter)"} />
      {label}
    </button>
  );
}

const selectStyle = {
  padding: "6px 10px",
  border: "1px solid rgba(var(--line),.14)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--ink)",
  font: "500 12.5px 'IBM Plex Sans'",
  cursor: "pointer",
} as const;

const fullViewBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 12px",
  border: "1px solid rgba(var(--line),.14)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--ink)",
  font: "500 12.5px 'IBM Plex Sans'",
  cursor: "pointer",
} as const;

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
        <span style={{ font: "600 10.5px 'IBM Plex Mono'", letterSpacing: ".09em", textTransform: "uppercase", color: "var(--sub)" }}>
          {title}
        </span>
        <span style={{ font: "400 11px 'IBM Plex Mono'", color: "var(--faint)" }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function CardHeader({ artifact, warn }: { artifact: TraceNode; warn?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
      <span style={{ font: "500 11.5px 'IBM Plex Mono'", color: "var(--sub)" }}>{artifact.id}</span>
      {warn ? (
        <span style={{ display: "flex" }} title={warn}>
          <Icon name="warn" size={13} color="var(--warn)" title={warn} />
        </span>
      ) : null}
      <div style={{ flex: 1 }} />
      {artifact.kind === "test" ? (
        <TestResultBadge result={artifact.result} />
      ) : (
        <StatusBadge status={artifact.status} />
      )}
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
  onClick,
}: {
  artifact: TraceNode;
  dim: boolean;
  highlight: boolean;
  warn?: string;
  register: (id: string, el: HTMLDivElement | null) => void;
  onEnter?: () => void;
  onLeave?: () => void;
  onClick: () => void;
}) {
  return (
    <div
      ref={(el) => register(artifact.id, el)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
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
      <CardHeader artifact={artifact} warn={warn} />
      <div style={{ font: "500 13px/1.35 'IBM Plex Sans'", color: "var(--ink)", marginBottom: 8, textWrap: "pretty" }}>
        {artifact.title}
      </div>
      {artifact.kind === "test" ? (
        artifact.file ? (
          <div
            style={{
              font: "400 11px 'IBM Plex Mono'",
              color: "var(--ter)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={artifact.file}
          >
            {artifact.file}
          </div>
        ) : null
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {artifact.kind === "requirement" ? <EarsBadge ears={artifact.ears} /> : null}
          <MoscowBadge moscow={artifact.moscow} />
        </div>
      )}
    </div>
  );
}

// --- expanded (focused) card -----------------------------------------------

const EARS_KEYWORDS = new Set(["WHEN", "WHILE", "IF", "THEN", "WHERE", "SHALL", "shall", "AND", "OR"]);

function ExpandedCard({
  artifact,
  warn,
  register,
  onBack,
  onEdit,
}: {
  artifact: TraceNode;
  warn?: string;
  register: (id: string, el: HTMLDivElement | null) => void;
  onBack: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      ref={(el) => register(artifact.id, el)}
      style={{
        border: "1px solid var(--accent)",
        borderRadius: 12,
        padding: "14px 15px 15px",
        background: "var(--surface)",
        boxShadow: "0 4px 18px rgba(var(--line),.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ display: "flex", color: "var(--accent-ink)" }}>
          <Icon name={kindIcon(artifact.kind)} size={15} />
        </span>
        <span style={{ font: "500 11.5px 'IBM Plex Mono'", color: "var(--sub)" }}>{artifact.id}</span>
        {warn ? (
          <span style={{ display: "flex" }} title={warn}>
            <Icon name="warn" size={13} color="var(--warn)" title={warn} />
          </span>
        ) : null}
        <div style={{ flex: 1 }} />
        {artifact.kind === "test" ? (
          <TestResultBadge result={artifact.result} />
        ) : (
          <StatusBadge status={artifact.status} />
        )}
        <button onClick={onEdit} title="Open in editor" style={miniBtnStyle}>
          Edit
        </button>
        <button onClick={onBack} title="Back to full view" style={miniBtnStyle}>
          <Icon name="close" size={12} />
          Full view
        </button>
      </div>

      <div style={{ font: "600 15px/1.35 'IBM Plex Sans'", color: "var(--ink)", letterSpacing: "-.01em", marginBottom: 10, textWrap: "pretty" }}>
        {artifact.title}
      </div>

      {artifact.kind !== "test" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {artifact.kind === "requirement" ? <EarsBadge ears={artifact.ears} /> : null}
          <MoscowBadge moscow={artifact.moscow} />
        </div>
      )}

      {artifact.kind === "need" && <NeedExpanded need={artifact} />}
      {artifact.kind === "use-case" && <UseCaseExpanded uc={artifact} />}
      {artifact.kind === "requirement" && <RequirementExpanded req={artifact} />}
      {artifact.kind === "test" && <TestExpanded test={artifact} />}
    </div>
  );
}

function NeedExpanded({ need }: { need: Extract<SpineArtifact, { kind: "need" }> }) {
  return (
    <>
      {need.source ? (
        <ExpandedField label="Source">
          <span style={{ font: "400 12.5px 'IBM Plex Sans'", color: "var(--ink)" }}>{need.source}</span>
        </ExpandedField>
      ) : null}
      {need.tags.length ? (
        <ExpandedField label="Tags">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {need.tags.map((t) => (
              <span key={t} style={tagStyle}>
                {t}
              </span>
            ))}
          </div>
        </ExpandedField>
      ) : null}
      {need.body ? (
        <p style={{ margin: "2px 0 0", font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--sub)", textWrap: "pretty" }}>
          {need.body}
        </p>
      ) : null}
    </>
  );
}

function UseCaseExpanded({ uc }: { uc: Extract<SpineArtifact, { kind: "use-case" }> }) {
  return (
    <>
      {uc.actors.length ? (
        <ExpandedField label="Actors">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {uc.actors.map((a) => (
              <span key={a} style={{ ...tagStyle, borderRadius: 20, padding: "3px 10px" }}>
                {a}
              </span>
            ))}
          </div>
        </ExpandedField>
      ) : null}
      {uc.flow ? (
        <ExpandedField label="Flow">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              font: "500 11.5px 'IBM Plex Mono'",
              color: "var(--sub)",
              background: "rgba(var(--line),.05)",
              padding: "3px 8px",
              borderRadius: 6,
            }}
          >
            <Icon name="behavior" size={13} />
            {uc.flow}
          </span>
        </ExpandedField>
      ) : null}
    </>
  );
}

function RequirementExpanded({ req }: { req: Extract<SpineArtifact, { kind: "requirement" }> }) {
  return (
    <div style={{ background: "var(--code-bg)", borderRadius: 10, padding: "14px 15px" }}>
      <div style={{ font: "500 9px 'IBM Plex Mono'", letterSpacing: ".12em", textTransform: "uppercase", color: "oklch(0.72 0.07 258)", marginBottom: 9 }}>
        {EARS_LABEL[req.ears]} requirement
      </div>
      <div style={{ font: "400 13.5px/1.6 'IBM Plex Mono'", textWrap: "pretty" }}>
        {composeEars(req)
          .split(/(\s+)/)
          .map((t, i) => {
            const keyword = EARS_KEYWORDS.has(t.replace(/[.,;:]/g, ""));
            return (
              <span key={i} style={keyword ? { color: "oklch(0.83 0.13 88)", fontWeight: 500 } : { color: "#e9e9e6" }}>
                {t}
              </span>
            );
          })}
      </div>
    </div>
  );
}

function TestExpanded({ test }: { test: Test }) {
  return (
    <>
      {test.file ? (
        <ExpandedField label="File">
          <span style={{ font: "400 12px 'IBM Plex Mono'", color: "var(--ink)", wordBreak: "break-all" }}>
            {test.file}
          </span>
        </ExpandedField>
      ) : null}
      <ExpandedField label="Verifies">
        {test.trace.length === 0 ? (
          <span style={{ font: "400 12.5px 'IBM Plex Sans'", color: "var(--faint)" }}>
            No requirement.
          </span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {test.trace.map((id) => (
              <span key={id} style={{ ...tagStyle, borderRadius: 5 }}>
                {id}
              </span>
            ))}
          </div>
        )}
      </ExpandedField>
      {test.body ? (
        <p style={{ margin: "2px 0 0", font: "400 13px/1.55 'IBM Plex Sans'", color: "var(--sub)", textWrap: "pretty" }}>
          {test.body}
        </p>
      ) : null}
    </>
  );
}

function ExpandedField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ font: "500 9px 'IBM Plex Mono'", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ter)", marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const tagStyle = {
  font: "400 11px 'IBM Plex Mono'",
  color: "var(--sub)",
  background: "rgba(var(--line),.05)",
  padding: "2px 7px",
  borderRadius: 4,
  whiteSpace: "nowrap" as const,
};

const miniBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 9px",
  border: "1px solid rgba(var(--line),.14)",
  borderRadius: 6,
  background: "transparent",
  color: "var(--sub)",
  font: "500 11px 'IBM Plex Sans'",
  cursor: "pointer",
} as const;

function kindIcon(kind: ArtifactKind): IconName {
  return kind === "need"
    ? "need"
    : kind === "use-case"
      ? "use-case"
      : kind === "test"
        ? "test"
        : "requirement";
}
