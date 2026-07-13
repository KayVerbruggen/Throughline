import { composeEars } from "../../model/ears";
import { matchText } from "../../model/search";
import { requirementWarning } from "../../model/trace";
import { useStore } from "../../state/store";
import { EarsBadge, MoscowBadge, OrphanChip, StatusBadge, TraceChip } from "../badges";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS = "98px minmax(200px,1fr) 118px 106px 128px minmax(130px,190px)";

export function RequirementsView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);
  const select = useStore((s) => s.select);

  const rows = project.requirements.filter((r) =>
    matchText(search, r.id, r.title, composeEars(r), r.trace),
  );

  return (
    <ListContainer>
      <HeaderRow
        columns={COLS}
        labels={["ID", "Title", "Status", "Priority", "EARS", "Traces to"]}
      />
      {rows.length === 0 ? (
        <EmptyState
          message={search ? "No requirements match your search." : "No requirements yet."}
        />
      ) : (
        rows.map((r) => {
          const warn = requirementWarning(r);
          return (
            <Row key={r.id} columns={COLS} onClick={() => select("requirement", r.id)}>
              <CellId id={r.id} warnMessage={warn?.message} />
              <CellTitle title={r.title} />
              <div>
                <StatusBadge status={r.status} />
              </div>
              <MoscowBadge moscow={r.moscow} />
              <div>
                <EarsBadge ears={r.ears} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {r.trace.map((id) => (
                  <TraceChip
                    key={id}
                    id={id}
                    onOpen={(e) => {
                      e.stopPropagation();
                      select("use-case", id);
                    }}
                  />
                ))}
                {warn ? <OrphanChip /> : null}
              </div>
            </Row>
          );
        })
      )}
    </ListContainer>
  );
}
