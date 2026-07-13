import { matchText } from "../../model/search";
import { useStore } from "../../state/store";
import { StakeholderTypeBadge } from "../badges";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS = "98px minmax(200px,1fr) 118px 1fr";

export function StakeholdersView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);
  const select = useStore((s) => s.select);

  const rows = project.stakeholders.filter((s) => matchText(search, s.id, s.title, s.body));

  return (
    <ListContainer>
      <HeaderRow columns={COLS} labels={["ID", "Title", "Type", "Description"]} />
      {rows.length === 0 ? (
        <EmptyState
          message={search ? "No stakeholders match your search." : "No stakeholders yet."}
        />
      ) : (
        rows.map((s) => (
          <Row key={s.id} columns={COLS} onClick={() => select("stakeholder", s.id)}>
            <CellId id={s.id} />
            <CellTitle title={s.title} />
            <div>
              <StakeholderTypeBadge type={s.type} />
            </div>
            <div
              style={{
                font: "400 12.5px/1.4 'IBM Plex Sans'",
                color: "var(--sub)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.body}
            </div>
          </Row>
        ))
      )}
    </ListContainer>
  );
}
