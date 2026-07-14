import { composeDecision } from "../../model/decision";
import { matchText } from "../../model/search";
import { useStore } from "../../state/store";
import { DecisionStatusBadge, TraceChip } from "../badges";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS = "84px minmax(180px,1fr) 112px minmax(220px,1.5fr) minmax(120px,180px)";

export function DecisionsView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);
  const select = useStore((s) => s.select);

  const rows = project.decisions.filter((d) =>
    matchText(search, d.id, d.title, composeDecision(d), d.trace),
  );

  return (
    <ListContainer>
      <HeaderRow columns={COLS} labels={["ID", "Title", "Status", "Statement", "Addresses"]} />
      {rows.length === 0 ? (
        <EmptyState
          message={search ? "No decisions match your search." : "No design decisions yet."}
        />
      ) : (
        rows.map((d) => (
          <Row key={d.id} columns={COLS} onClick={() => select("decision", d.id)}>
            <CellId id={d.id} />
            <CellTitle title={d.title} inferred={d.inferred} />
            <div>
              <DecisionStatusBadge status={d.status} />
            </div>
            <div
              style={{
                font: "400 12.5px/1.45 'IBM Plex Sans'",
                color: "var(--sub)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {composeDecision(d)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {d.trace.map((id) => (
                <TraceChip
                  key={id}
                  id={id}
                  onOpen={(e) => {
                    e.stopPropagation();
                    select("use-case", id);
                  }}
                />
              ))}
            </div>
          </Row>
        ))
      )}
    </ListContainer>
  );
}
