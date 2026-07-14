import { matchText } from "../../model/search";
import { useStore } from "../../state/store";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS = "84px minmax(160px,1fr) minmax(140px,220px) minmax(240px,2fr)";

export function GlossaryView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);
  const select = useStore((s) => s.select);

  const rows = project.glossary.filter((t) =>
    matchText(search, t.id, t.title, t.definition, t.aliases),
  );

  return (
    <ListContainer>
      <HeaderRow columns={COLS} labels={["ID", "Term", "Also known as", "Definition"]} />
      {rows.length === 0 ? (
        <EmptyState message={search ? "No terms match your search." : "No glossary terms yet."} />
      ) : (
        rows.map((t) => (
          <Row key={t.id} columns={COLS} onClick={() => select("glossary", t.id)}>
            <CellId id={t.id} />
            <CellTitle title={t.title} inferred={t.inferred} />
            <div
              style={{
                font: "400 12px 'IBM Plex Mono'",
                color: "var(--ter)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.aliases.join(", ")}
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
              {t.definition}
            </div>
          </Row>
        ))
      )}
    </ListContainer>
  );
}
