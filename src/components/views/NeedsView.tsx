import { matchText } from "../../model/search";
import { needWarning } from "../../model/trace";
import { useStore } from "../../state/store";
import { MoscowBadge, StatusBadge } from "../badges";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS = "98px minmax(200px,1fr) 118px 106px 218px 148px";

export function NeedsView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);
  const select = useStore((s) => s.select);

  const rows = project.needs.filter((n) => matchText(search, n.id, n.title, n.source, n.tags));

  return (
    <ListContainer>
      <HeaderRow columns={COLS} labels={["ID", "Title", "Status", "Priority", "Source", "Tags"]} />
      {rows.length === 0 ? (
        <EmptyState message={search ? "No needs match your search." : "No needs yet."} />
      ) : (
        rows.map((n) => {
          const warn = needWarning(project, n);
          return (
            <Row key={n.id} columns={COLS} onClick={() => select("need", n.id)}>
              <CellId id={n.id} warnMessage={warn?.message} />
              <CellTitle title={n.title} />
              <div>
                <StatusBadge status={n.status} />
              </div>
              <MoscowBadge moscow={n.moscow} />
              <div
                style={{
                  font: "400 12.5px 'IBM Plex Sans'",
                  color: "var(--sub)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {n.source ?? ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, overflow: "hidden" }}>
                {n.tags.map((t) => (
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
        })
      )}
    </ListContainer>
  );
}
