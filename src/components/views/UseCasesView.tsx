import { matchText } from "../../model/search";
import { useCaseWarning } from "../../model/trace";
import { useStore } from "../../state/store";
import { MoscowBadge, StatusBadge, TraceChip } from "../badges";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS = "98px minmax(220px,1fr) 118px 106px minmax(150px,220px)";

export function UseCasesView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);
  const select = useStore((s) => s.select);

  const rows = project.useCases.filter((u) =>
    matchText(search, u.id, u.title, u.trace, u.actors),
  );

  return (
    <ListContainer>
      <HeaderRow columns={COLS} labels={["ID", "Title", "Status", "Priority", "Traces to"]} />
      {rows.length === 0 ? (
        <EmptyState message={search ? "No use cases match your search." : "No use cases yet."} />
      ) : (
        rows.map((u) => {
          const warn = useCaseWarning(u);
          return (
            <Row key={u.id} columns={COLS} onClick={() => select("use-case", u.id)}>
              <CellId id={u.id} warnMessage={warn?.message} />
              <CellTitle title={u.title} inferred={u.inferred} />
              <div>
                <StatusBadge status={u.status} />
              </div>
              <MoscowBadge moscow={u.moscow} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {u.trace.map((id) => (
                  <TraceChip
                    key={id}
                    id={id}
                    onOpen={(e) => {
                      e.stopPropagation();
                      select("need", id);
                    }}
                  />
                ))}
              </div>
            </Row>
          );
        })
      )}
    </ListContainer>
  );
}
