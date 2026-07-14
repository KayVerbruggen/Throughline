import { matchText } from "../../model/search";
import { useStore } from "../../state/store";
import { TestResultBadge, TraceChip } from "../badges";
import { CellId, CellTitle, EmptyState, HeaderRow, ListContainer, Row } from "../list";

const COLS =
  "76px minmax(150px,1fr) 84px minmax(120px,180px) minmax(160px,1.4fr) minmax(160px,1.4fr)";

export function TestsView() {
  const project = useStore((s) => s.project);
  const search = useStore((s) => s.search);
  const select = useStore((s) => s.select);

  const rows = project.tests.filter((t) =>
    matchText(search, t.id, t.title, t.body, t.file, t.trace),
  );

  return (
    <ListContainer>
      <HeaderRow
        columns={COLS}
        labels={["ID", "Title", "Result", "Covers", "File", "Description"]}
      />
      {rows.length === 0 ? (
        <EmptyState
          message={
            search
              ? "No tests match your search."
              : "No tests yet. A test verifies a requirement — add one with “New Test”."
          }
        />
      ) : (
        rows.map((t) => (
          <Row key={t.id} columns={COLS} onClick={() => select("test", t.id)}>
            <CellId id={t.id} warnMessage={t.trace.length === 0 ? "Verifies no requirement" : undefined} />
            <CellTitle title={t.title} inferred={t.inferred} />
            <div>
              <TestResultBadge result={t.result} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {t.trace.length === 0 ? (
                <span style={{ font: "400 12px 'IBM Plex Sans'", color: "var(--faint)" }}>—</span>
              ) : (
                t.trace.map((id) => (
                  <TraceChip
                    key={id}
                    id={id}
                    onOpen={(e) => {
                      e.stopPropagation();
                      select("requirement", id);
                    }}
                  />
                ))
              )}
            </div>
            <div
              style={{
                font: "400 11.5px 'IBM Plex Mono'",
                color: "var(--ter)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={t.file}
            >
              {t.file || <span style={{ color: "var(--faint)" }}>—</span>}
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
              {t.body}
            </div>
          </Row>
        ))
      )}
    </ListContainer>
  );
}
