import { matchText } from "../../model/search";
import { groupNeedsByStakeholder } from "../../model/stakeholders";
import { needWarning } from "../../model/trace";
import { useStore } from "../../state/store";
import type { Need } from "../../types";
import { MoscowBadge, StakeholderTypeBadge, StatusBadge } from "../badges";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS = "98px minmax(200px,1fr) 118px 106px 218px 148px";

export function NeedsView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);

  const filtered = project.needs.filter((n) => matchText(search, n.id, n.title, n.source, n.tags));
  // Only groups that actually contain matching needs are shown.
  const groups = groupNeedsByStakeholder(project, filtered).filter((g) => g.needs.length > 0);

  return (
    <ListContainer>
      <HeaderRow columns={COLS} labels={["ID", "Title", "Status", "Priority", "Source", "Tags"]} />
      {filtered.length === 0 ? (
        <EmptyState message={search ? "No needs match your search." : "No needs yet."} />
      ) : (
        groups.map((g) => (
          <div key={g.stakeholder?.id ?? "__unassigned__"}>
            <GroupHeader
              name={g.stakeholder?.title ?? "Unassigned"}
              type={g.stakeholder?.type ?? null}
              count={g.needs.length}
            />
            {g.needs.map((n) => (
              <NeedRow key={n.id} need={n} />
            ))}
          </div>
        ))
      )}
    </ListContainer>
  );
}

function GroupHeader({
  name,
  type,
  count,
}: {
  name: string;
  type: "primary" | "secondary" | null;
  count: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 14px 8px" }}>
      <span style={{ font: "600 12.5px 'IBM Plex Sans'", color: "var(--ink)" }}>{name}</span>
      {type ? <StakeholderTypeBadge type={type} /> : null}
      <span style={{ font: "400 11.5px 'IBM Plex Mono'", color: "var(--faint)" }}>{count}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(var(--line),.08)" }} />
    </div>
  );
}

function NeedRow({ need }: { need: Need }) {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const warn = needWarning(project, need);

  return (
    <Row columns={COLS} onClick={() => select("need", need.id)}>
      <CellId id={need.id} warnMessage={warn?.message} />
      <CellTitle title={need.title} />
      <div>
        <StatusBadge status={need.status} />
      </div>
      <MoscowBadge moscow={need.moscow} />
      <div
        style={{
          font: "400 12.5px 'IBM Plex Sans'",
          color: "var(--sub)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {need.source ?? ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, overflow: "hidden" }}>
        {need.tags.map((t) => (
          <span
            key={t}
            style={{
              font: "400 11px 'IBM Plex Mono'",
              color: "var(--sub)",
              background: "rgba(var(--line),.05)",
              padding: "2px 6px",
              borderRadius: 4,
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </Row>
  );
}
