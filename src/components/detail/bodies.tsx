import { EARS_PATTERNS, type EarsPattern, type Need, type Requirement, type UseCase } from "../../types";
import { EARS_LABEL } from "../badges";
import { Icon } from "../icons";
import { FieldLabel, Section, Select, TextArea, TextInput } from "./fields";

type Update<T> = (patch: Partial<T>) => void;

// --- Need -------------------------------------------------------------------

export function NeedBody({ need, update }: { need: Need; update: Update<Need> }) {
  return (
    <>
      <Section>
        <FieldLabel>Source</FieldLabel>
        <TextInput
          value={need.source ?? ""}
          placeholder="e.g. Customer interview, Acme Corp"
          onChange={(v) => update({ source: v })}
        />
      </Section>
      <Section mb={22}>
        <FieldLabel hint="(comma separated)">Tags</FieldLabel>
        <TextInput
          mono
          value={need.tags.join(", ")}
          placeholder="reliability, driver-ux"
          onChange={(v) =>
            update({ tags: v.split(",").map((t) => t.trim()).filter(Boolean) })
          }
        />
      </Section>
      <Section mb={0}>
        <FieldLabel>Description</FieldLabel>
        <TextArea value={need.body} rows={7} onChange={(v) => update({ body: v })} />
      </Section>
    </>
  );
}

// --- Use Case (display-only in this slice, except top fields) ---------------

export function UseCaseBody({
  uc,
  onOpenNeed,
}: {
  uc: UseCase;
  onOpenNeed: (id: string) => void;
}) {
  return (
    <>
      <Section>
        <FieldLabel>Traces to</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {uc.trace.length === 0 ? (
            <Muted>Covers no need yet.</Muted>
          ) : (
            uc.trace.map((id) => (
              <Chip key={id} id={id} icon="need" onClick={() => onOpenNeed(id)} />
            ))
          )}
        </div>
      </Section>

      <Section>
        <FieldLabel>Actors</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {uc.actors.map((a) => (
            <span
              key={a}
              style={{
                font: "400 12.5px 'IBM Plex Sans'",
                color: "var(--ink)",
                background: "rgba(var(--line),.05)",
                padding: "4px 11px",
                borderRadius: 20,
              }}
            >
              {a}
            </span>
          ))}
        </div>
      </Section>

      {uc.preconditions.length > 0 && (
        <Section>
          <FieldLabel>Preconditions</FieldLabel>
          {uc.preconditions.map((p, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 9,
                padding: "5px 0",
                font: "400 13px/1.5 'IBM Plex Sans'",
                color: "var(--ink)",
              }}
            >
              <span style={{ color: "var(--faint)" }}>—</span>
              <span>{p}</span>
            </div>
          ))}
        </Section>
      )}

      {uc.mainFlow.length > 0 && (
        <Section>
          <FieldLabel>Main flow</FieldLabel>
          {uc.mainFlow.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                padding: "9px 0",
                borderBottom: "1px solid rgba(var(--line),.05)",
              }}
            >
              <span
                style={{
                  flex: "none",
                  width: 23,
                  height: 23,
                  borderRadius: 6,
                  background: "var(--accent-bg)",
                  color: "var(--accent-ink)",
                  font: "500 12px 'IBM Plex Mono'",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              <span style={{ font: "400 13.5px/1.5 'IBM Plex Sans'", color: "var(--ink)" }}>{s}</span>
            </div>
          ))}
        </Section>
      )}

      {uc.altFlows.length > 0 && (
        <Section mb={22}>
          <FieldLabel>Alternate flows</FieldLabel>
          {uc.altFlows.map((a, i) => (
            <div
              key={i}
              style={{
                padding: "10px 13px",
                border: "1px solid rgba(var(--line),.09)",
                borderLeft: "2px solid oklch(0.62 0.13 70)",
                borderRadius: "0 8px 8px 0",
                marginBottom: 8,
                background: "var(--surface2)",
              }}
            >
              {a.step > 0 && (
                <div
                  style={{
                    font: "500 10.5px 'IBM Plex Mono'",
                    letterSpacing: ".05em",
                    color: "oklch(0.52 0.11 62)",
                    marginBottom: 4,
                  }}
                >
                  AT STEP {a.step}
                </div>
              )}
              <div style={{ font: "400 13px/1.5 'IBM Plex Sans'", color: "var(--ink)" }}>{a.text}</div>
            </div>
          ))}
        </Section>
      )}

      {uc.stories.length > 0 && (
        <Section mb={0}>
          <FieldLabel>User stories</FieldLabel>
          {uc.stories.map((st) => (
            <div
              key={st.id}
              style={{
                border: "1px solid rgba(var(--line),.09)",
                borderRadius: 10,
                padding: "13px 14px",
                marginBottom: 9,
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "56px 1fr",
                  gap: "7px 12px",
                  alignItems: "baseline",
                }}
              >
                <StoryLabel>As a</StoryLabel>
                <span style={{ font: "500 13px 'IBM Plex Sans'", color: "var(--ink)" }}>{st.as_a}</span>
                <StoryLabel>I want</StoryLabel>
                <span style={{ font: "400 13px/1.45 'IBM Plex Sans'", color: "var(--ink)" }}>
                  {st.i_want}
                </span>
                <StoryLabel>so that</StoryLabel>
                <span style={{ font: "400 13px/1.45 'IBM Plex Sans'", color: "var(--sub)" }}>
                  {st.so_that}
                </span>
              </div>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

// --- Requirement ------------------------------------------------------------

const EARS_KEYWORDS = new Set(["WHEN", "WHILE", "IF", "THEN", "WHERE", "SHALL", "shall", "AND", "OR"]);

function earsParts(text: string) {
  return String(text || "")
    .split(/(\s+)/)
    .map((t, i) => {
      const bare = t.replace(/[.,;:]/g, "");
      return { i, t, keyword: EARS_KEYWORDS.has(bare) };
    });
}

export function RequirementBody({
  req,
  update,
  onOpenUseCase,
}: {
  req: Requirement;
  update: Update<Requirement>;
  onOpenUseCase: (id: string) => void;
}) {
  const orphan = req.trace.length === 0;
  return (
    <>
      <Section mb={18}>
        <FieldLabel>EARS pattern</FieldLabel>
        <Select<EarsPattern>
          value={req.ears}
          onChange={(v) => update({ ears: v })}
          options={EARS_PATTERNS.map((p) => ({ value: p, label: EARS_LABEL[p] }))}
        />
      </Section>

      <div style={{ background: "var(--code-bg)", borderRadius: 11, padding: 19, marginBottom: 16 }}>
        <div
          style={{
            font: "500 9.5px 'IBM Plex Mono'",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "oklch(0.72 0.07 258)",
            marginBottom: 11,
          }}
        >
          {EARS_LABEL[req.ears]} requirement
        </div>
        <div style={{ font: "400 16.5px/1.62 'IBM Plex Mono'", textWrap: "pretty" }}>
          {earsParts(req.body).map((p) => (
            <span
              key={p.i}
              style={
                p.keyword
                  ? { color: "oklch(0.83 0.13 88)", fontWeight: 500 }
                  : { color: "#e9e9e6" }
              }
            >
              {p.t}
            </span>
          ))}
        </div>
      </div>

      <Section mb={22}>
        <FieldLabel hint="(EARS syntax)">Statement</FieldLabel>
        <TextArea mono value={req.body} rows={4} onChange={(v) => update({ body: v })} />
      </Section>

      <Section mb={0}>
        <FieldLabel>Traces to</FieldLabel>
        {!orphan ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {req.trace.map((id) => (
              <Chip key={id} id={id} icon="use-case" onClick={() => onOpenUseCase(id)} />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              border: "1px solid var(--warn-border)",
              background: "var(--warn-bg)",
              borderRadius: 9,
              font: "400 12.5px/1.5 'IBM Plex Sans'",
              color: "var(--warn-ink)",
            }}
          >
            <span style={{ display: "flex" }}>
              <Icon name="warn" size={15} color="var(--warn-ink)" />
            </span>
            Not linked to any use case. Trace this requirement to keep the chain intact.
          </div>
        )}
      </Section>
    </>
  );
}

// --- small shared bits ------------------------------------------------------

function StoryLabel({ children }: { children: string }) {
  return (
    <span
      style={{
        font: "500 9.5px 'IBM Plex Mono'",
        letterSpacing: ".05em",
        textTransform: "uppercase",
        color: "var(--ter)",
      }}
    >
      {children}
    </span>
  );
}

function Muted({ children }: { children: string }) {
  return <span style={{ font: "400 12.5px 'IBM Plex Sans'", color: "var(--faint)" }}>{children}</span>;
}

function Chip({ id, icon, onClick }: { id: string; icon: "need" | "use-case"; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: "500 11.5px 'IBM Plex Mono'",
        color: "var(--accent-ink)",
        background: "var(--accent-bg)",
        padding: "4px 9px",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex" }}>
        <Icon name={icon} size={12} color="var(--accent-ink)" />
      </span>
      {id}
    </span>
  );
}
