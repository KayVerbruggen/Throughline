import { useEffect } from "react";

import { DetailPanel } from "./components/detail/DetailPanel";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { BehaviorView } from "./components/views/BehaviorView";
import { NeedsView } from "./components/views/NeedsView";
import { RequirementsView } from "./components/views/RequirementsView";
import { StakeholdersView } from "./components/views/StakeholdersView";
import { StructureView } from "./components/views/StructureView";
import { TraceabilityView } from "./components/views/TraceabilityView";
import { UseCasesView } from "./components/views/UseCasesView";
import { useStore } from "./state/store";

export default function App() {
  const init = useStore((s) => s.init);
  const theme = useStore((s) => s.theme);
  const syncSystemTheme = useStore((s) => s.syncSystemTheme);
  const ready = useStore((s) => s.ready);
  const loading = useStore((s) => s.loading);
  const view = useStore((s) => s.view);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Follow OS light/dark changes until the user picks a theme explicitly.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => syncSystemTheme();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [syncSystemTheme]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        <TopBar />
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {loading ? (
            <Centered>Loading…</Centered>
          ) : !ready ? (
            <NoProject />
          ) : (
            <Content view={view} />
          )}
        </div>
      </main>
      <DetailPanel />
    </div>
  );
}

function Content({ view }: { view: ReturnType<typeof useStore.getState>["view"] }) {
  switch (view) {
    case "stakeholders":
      return <StakeholdersView />;
    case "needs":
      return <NeedsView />;
    case "use-cases":
      return <UseCasesView />;
    case "requirements":
      return <RequirementsView />;
    case "traceability":
      return <TraceabilityView />;
    case "structure":
      return <StructureView />;
    case "behavior":
      return <BehaviorView />;
  }
}

function NoProject() {
  const chooseProject = useStore((s) => s.chooseProject);
  return (
    <Centered>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ font: "600 18px 'IBM Plex Sans'", letterSpacing: "-.02em", marginBottom: 10 }}>
          No project open
        </div>
        <p style={{ margin: "0 0 20px", font: "400 13.5px/1.6 'IBM Plex Sans'", color: "var(--sub)" }}>
          Choose a folder to store this project's artifacts as plain-text files. The folder can live
          inside your own git repo.
        </p>
        <button
          onClick={() => void chooseProject()}
          style={{
            padding: "9px 16px",
            border: "none",
            borderRadius: 8,
            background: "var(--ink)",
            color: "var(--bg)",
            font: "500 13px 'IBM Plex Sans'",
            cursor: "pointer",
          }}
        >
          Open project folder…
        </button>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 40,
        color: "var(--ter)",
        font: "400 14px 'IBM Plex Sans'",
      }}
    >
      {children}
    </div>
  );
}
