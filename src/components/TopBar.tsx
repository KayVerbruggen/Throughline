import { useState } from "react";

import { authorArtifact, createLlmClient, type AuthorableKind, type AuthoredDraft } from "../llm";
import { useStore, type ViewId } from "../state/store";
import { Icon } from "./icons";
import { SettingsDialog } from "./SettingsDialog";

const TITLES: Record<ViewId, string> = {
  stakeholders: "Stakeholders",
  needs: "Needs",
  "use-cases": "Use Cases",
  requirements: "Requirements",
  structure: "System Structure",
  behavior: "System Behavior",
  decisions: "Design Decisions",
  glossary: "Glossary",
  tests: "Tests",
  traceability: "Traceability",
};

const NEW_LABEL: Partial<Record<ViewId, string>> = {
  stakeholders: "New Stakeholder",
  needs: "New Need",
  "use-cases": "New Use Case",
  requirements: "New Requirement",
  structure: "New Component",
  decisions: "New Decision",
  glossary: "New Term",
  tests: "New Test",
};

const AUTHOR_ACCENT = "oklch(0.52 0.11 62)";

const KIND_VIEW: Record<AuthorableKind, ViewId> = {
  stakeholder: "stakeholders",
  need: "needs",
  "use-case": "use-cases",
  requirement: "requirements",
  test: "tests",
  decision: "decisions",
  glossary: "glossary",
};

const KIND_LABEL: Record<AuthorableKind, string> = {
  stakeholder: "Stakeholder",
  need: "Need",
  "use-case": "Use Case",
  requirement: "Requirement",
  test: "Test",
  decision: "Decision",
  glossary: "Term",
};

// ---------------------------------------------------------------------------
// Natural-language authoring — a global "✨ Draft" box that turns a sentence
// into one structured artifact (see llm/authoring.ts): the model picks the kind
// and fills its slots, the draft is previewed with its trace links, and Create
// builds it (via createFromDraft) and navigates to it. A faster on-ramp than
// finding the right view and filling the form by hand.
// ---------------------------------------------------------------------------

function AuthorArtifact() {
  const project = useStore((s) => s.project);
  const createFromDraft = useStore((s) => s.createFromDraft);
  const setView = useStore((s) => s.setView);
  const select = useStore((s) => s.select);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AuthoredDraft | null>(null);

  const reset = () => {
    setText("");
    setError(null);
    setDraft(null);
    setBusy(false);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const run = async () => {
    const request = text.trim();
    if (!request) return;
    setError(null);
    setDraft(null);
    const client = createLlmClient();
    if (!client.isConfigured()) {
      setError("Add an Anthropic API key in Settings (the gear) to draft from text.");
      return;
    }
    setBusy(true);
    const r = await authorArtifact(client, project, request);
    setBusy(false);
    if (r.ok) setDraft(r.value);
    else setError(r.error);
  };

  const create = async () => {
    if (!draft) return;
    const kind = draft.kind; // the narrow authorable kind (has a view)
    const { id } = await createFromDraft(draft);
    close();
    // createFromDraft selects the artifact; switching the view clears that, so
    // re-select after navigating to land on the new artifact in its own view.
    setView(KIND_VIEW[kind]);
    select(kind, id);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        title="Draft an artifact from a sentence"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          height: 34,
          padding: "0 12px",
          border: `1px solid ${open ? AUTHOR_ACCENT : "rgba(var(--line),.11)"}`,
          borderRadius: 8,
          background: "var(--surface)",
          color: open ? AUTHOR_ACCENT : "var(--sub)",
          font: "500 13px 'IBM Plex Sans'",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ✨ Draft
      </button>

      {open ? (
        <>
          {/* Click-away backdrop. */}
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute",
              top: 42,
              right: 0,
              width: 400,
              maxWidth: "90vw",
              zIndex: 41,
              border: "1px solid rgba(var(--line),.14)",
              borderRadius: 12,
              background: "var(--surface)",
              boxShadow: "0 14px 40px rgba(0,0,0,.22)",
              padding: 14,
            }}
          >
            <div style={{ font: "600 11px 'IBM Plex Mono'", letterSpacing: ".06em", textTransform: "uppercase", color: AUTHOR_ACCENT, marginBottom: 8 }}>
              Draft from text
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run();
              }}
              autoFocus
              rows={3}
              placeholder="Describe an artifact — e.g. “a requirement that the lock equalises within 90 seconds, for the filling use case”"
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                padding: "9px 10px",
                border: "1px solid rgba(var(--line),.14)",
                borderRadius: 8,
                background: "var(--surface2)",
                color: "var(--ink)",
                font: "400 13px/1.5 'IBM Plex Sans'",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => void run()}
                disabled={busy || !text.trim()}
                style={{
                  padding: "6px 13px",
                  border: "none",
                  borderRadius: 7,
                  background: busy || !text.trim() ? "var(--surface2)" : AUTHOR_ACCENT,
                  color: busy || !text.trim() ? "var(--faint)" : "#fff",
                  font: "500 12px 'IBM Plex Sans'",
                  cursor: busy || !text.trim() ? "default" : "pointer",
                }}
              >
                {busy ? "Drafting…" : "Draft"}
              </button>
              <span style={{ font: "400 10.5px 'IBM Plex Mono'", color: "var(--faint)" }}>⌘↵</span>
            </div>

            {error ? (
              <div style={{ marginTop: 8, font: "400 11.5px/1.45 'IBM Plex Sans'", color: "var(--warn-ink)" }}>{error}</div>
            ) : null}

            {draft ? (
              <div style={{ marginTop: 12, borderTop: "1px solid rgba(var(--line),.1)", paddingTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      font: "600 9.5px 'IBM Plex Mono'",
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      color: AUTHOR_ACCENT,
                      background: "var(--accent-bg)",
                      padding: "2px 7px",
                      borderRadius: 4,
                    }}
                  >
                    {KIND_LABEL[draft.kind]}
                  </span>
                </div>

                <div style={{ font: "400 13px/1.5 'IBM Plex Sans'", color: "var(--ink)", marginBottom: draft.explanation ? 4 : 0 }}>
                  {draft.preview}
                </div>
                {draft.explanation ? (
                  <div style={{ font: "400 11.5px/1.5 'IBM Plex Sans'", color: "var(--sub)" }}>{draft.explanation}</div>
                ) : null}

                {"trace" in draft && draft.trace.length ? (
                  <div style={{ marginTop: 8, font: "400 11px 'IBM Plex Mono'", color: "var(--sub)" }}>
                    traces to {draft.trace.join(", ")}
                  </div>
                ) : null}
                {"stakeholder" in draft && draft.stakeholder ? (
                  <div style={{ marginTop: 8, font: "400 11px 'IBM Plex Mono'", color: "var(--sub)" }}>
                    stakeholder {draft.stakeholder}
                  </div>
                ) : null}
                {draft.unresolved.length ? (
                  <div style={{ marginTop: 6, font: "400 11px/1.45 'IBM Plex Sans'", color: "var(--warn-ink)" }}>
                    Couldn't link: {draft.unresolved.join(", ")} — create it will still be added without those links.
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => void create()}
                    style={{
                      padding: "7px 14px",
                      border: "none",
                      borderRadius: 7,
                      background: "var(--ink)",
                      color: "var(--bg)",
                      font: "500 12px 'IBM Plex Sans'",
                      cursor: "pointer",
                    }}
                  >
                    Create {KIND_LABEL[draft.kind]}
                  </button>
                  <button
                    onClick={() => setDraft(null)}
                    style={{
                      padding: "7px 14px",
                      border: "1px solid rgba(var(--line),.14)",
                      borderRadius: 7,
                      background: "transparent",
                      color: "var(--sub)",
                      font: "500 12px 'IBM Plex Sans'",
                      cursor: "pointer",
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function TopBar() {
  const view = useStore((s) => s.view);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const createArtifact = useStore((s) => s.createArtifact);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const project = useStore((s) => s.project);
  const llmConfigured = useStore((s) => s.llm.apiKey.trim().length > 0);

  const [searchFocus, setSearchFocus] = useState(false);
  const [newHover, setNewHover] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const count =
    view === "stakeholders"
      ? project.stakeholders.length
      : view === "needs"
        ? project.needs.length
        : view === "use-cases"
          ? project.useCases.length
          : view === "requirements"
            ? project.requirements.length
            : view === "structure"
              ? project.components.length
              : view === "decisions"
                ? project.decisions.length
                : view === "glossary"
                  ? project.glossary.length
                  : view === "tests"
                    ? project.tests.length
                    : null;

  const newLabel = NEW_LABEL[view];

  const onNew = () => {
    if (view === "stakeholders") createArtifact("stakeholder");
    else if (view === "needs") createArtifact("need");
    else if (view === "use-cases") createArtifact("use-case");
    else if (view === "requirements") createArtifact("requirement");
    else if (view === "structure") createArtifact("component");
    else if (view === "decisions") createArtifact("decision");
    else if (view === "glossary") createArtifact("glossary");
    else if (view === "tests") createArtifact("test");
  };

  return (
    <header
      style={{
        height: 61,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 26px",
        borderBottom: "1px solid rgba(var(--line),.08)",
        background: "var(--bg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 11, minWidth: 0 }}>
        <h1 style={{ margin: 0, font: "600 18px 'IBM Plex Sans'", letterSpacing: "-.025em" }}>
          {TITLES[view]}
        </h1>
        {count != null ? (
          <span style={{ font: "400 13px 'IBM Plex Mono'", color: "var(--ter)" }}>{count}</span>
        ) : null}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ position: "relative" }}>
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          style={{
            width: 196,
            padding: "7px 10px 7px 30px",
            border: `1px solid ${searchFocus ? "oklch(0.6 0.12 258)" : "rgba(var(--line),.11)"}`,
            borderRadius: 8,
            background: "var(--surface)",
            font: "400 13px 'IBM Plex Sans'",
            outline: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 9,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            color: "var(--ter)",
          }}
        >
          <Icon name="search" size={15} />
        </span>
      </div>

      <button
        onClick={() => setSettingsOpen(true)}
        title="Settings"
        style={{
          position: "relative",
          width: 34,
          height: 34,
          flex: "none",
          border: "1px solid rgba(var(--line),.11)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--sub)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="settings" size={16} />
        {!llmConfigured ? (
          <span
            title="No AI key configured"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "oklch(0.68 0.16 55)",
            }}
          />
        ) : null}
      </button>

      <button
        onClick={toggleTheme}
        title={theme === "light" ? "Switch to dark" : "Switch to light"}
        style={{
          width: 34,
          height: 34,
          flex: "none",
          border: "1px solid rgba(var(--line),.11)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--sub)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
      </button>

      <AuthorArtifact />

      {newLabel ? (
        <button
          onClick={onNew}
          onMouseEnter={() => setNewHover(true)}
          onMouseLeave={() => setNewHover(false)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 13px",
            border: "none",
            borderRadius: 8,
            background: newHover ? "var(--ink-hover)" : "var(--ink)",
            color: "var(--bg)",
            font: "500 13px 'IBM Plex Sans'",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ display: "flex" }}>
            <Icon name="plus" size={15} />
          </span>
          {newLabel}
        </button>
      ) : null}

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
