import { useState } from "react";

import { useStore, type ViewId } from "../state/store";
import { Icon } from "./icons";

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

export function TopBar() {
  const view = useStore((s) => s.view);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const createArtifact = useStore((s) => s.createArtifact);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const project = useStore((s) => s.project);

  const [searchFocus, setSearchFocus] = useState(false);
  const [newHover, setNewHover] = useState(false);

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
    </header>
  );
}
