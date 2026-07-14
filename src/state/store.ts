import { create } from "zustand";

import { componentHandle, renameComponentHandle } from "../model/expr";
import { nextId } from "../model/ids";
import { createStorage, type StorageAdapter } from "../storage";
import {
  emptyProject,
  type Artifact,
  type ArtifactKind,
  type Project,
} from "../types";

export type ViewId =
  | "stakeholders"
  | "needs"
  | "use-cases"
  | "requirements"
  | "structure"
  | "behavior"
  | "decisions"
  | "glossary"
  | "tests"
  | "traceability";

export interface Selection {
  kind: ArtifactKind;
  id: string;
}

// --- persisted per-view display preferences ---------------------------------

export type StructureLayoutMode = "tree" | "nested";
export type StructureShowMode = "hierarchy" | "connections" | "both";
export type TraceColumnKind = "need" | "use-case" | "requirement" | "test";

/**
 * Display choices made in a view's toolbar (structure layout, traceability
 * filters). These are preferences, not project data, so they live in
 * localStorage like the theme rather than in the project files — they should
 * survive navigating away, reloading, and reopening the window.
 */
export interface ViewPrefs {
  structureLayout: StructureLayoutMode;
  structureShow: StructureShowMode;
  /** Which traceability columns are shown, in spine order. */
  traceColumns: TraceColumnKind[];
  /** Stakeholder id scoping the traceability grid, or null for all. */
  traceStakeholder: string | null;
}

const PREFS_KEY = "throughline.viewPrefs";

const DEFAULT_PREFS: ViewPrefs = {
  structureLayout: "tree",
  structureShow: "both",
  traceColumns: ["need", "use-case", "requirement", "test"],
  traceStakeholder: null,
};

function loadPrefs(): ViewPrefs {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PREFS_KEY) : null;
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    // Merge over defaults so a preference added in a later version still gets a
    // sane value when reading an older, partial blob.
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface AppState {
  storage: StorageAdapter;
  project: Project;
  ready: boolean;
  loading: boolean;
  view: ViewId;
  search: string;
  selection: Selection | null;
  /** Breadcrumb of selections navigated through inside the detail panel. */
  history: Selection[];
  theme: "light" | "dark";
  /** Persisted per-view display preferences (structure layout, trace filters). */
  prefs: ViewPrefs;

  init: () => Promise<void>;
  reload: () => Promise<void>;
  /** Open a different existing project folder, replacing the current one. */
  chooseProject: () => Promise<void>;
  /** Create and open a new, empty project (Tauri prompts for its location). */
  newProject: (name: string) => Promise<void>;

  setView: (view: ViewId) => void;
  setSearch: (search: string) => void;
  select: (kind: ArtifactKind, id: string) => void;
  /** Step back to the previously selected artifact in the panel breadcrumb. */
  back: () => void;
  closeDetail: () => void;
  toggleTheme: () => void;
  syncSystemTheme: () => void;
  /** Merge a patch into the persisted view preferences and write it through. */
  setPrefs: (patch: Partial<ViewPrefs>) => void;

  createArtifact: (kind: ArtifactKind) => Promise<void>;
  /**
   * Create a component nested under `parentId` ("" = top-level) and select it,
   * so the structure view can add components in place. Kept separate from
   * `createArtifact` since only components carry a parent.
   */
  addComponent: (parentId: string) => Promise<void>;
  updateSelected: (patch: Partial<Artifact>) => Promise<void>;
  deleteSelected: () => Promise<void>;

  /** Replace-or-insert any artifact and persist it (used by the flow editor). */
  upsertArtifact: (artifact: Artifact) => Promise<void>;
  /** Remove any artifact by kind + id and persist the deletion. */
  removeArtifact: (kind: ArtifactKind, id: string) => Promise<void>;
  /**
   * Ensure a Use Case has a Flow to edit: returns the existing linked flow, or
   * creates one (id taken from the UC's `flow` field when set) and links it.
   */
  ensureFlowForUseCase: (ucId: string) => Promise<string | null>;
}

const THEME_KEY = "throughline.theme";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** An explicit user choice (via the toggle) wins; otherwise follow the OS. */
function initialTheme(): "light" | "dark" {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
  if (saved === "light" || saved === "dark") return saved;
  return systemPrefersDark() ? "dark" : "light";
}

// --- immutable project helpers ----------------------------------------------

function bucketOf(project: Project, kind: ArtifactKind): Artifact[] {
  switch (kind) {
    case "stakeholder":
      return project.stakeholders;
    case "need":
      return project.needs;
    case "use-case":
      return project.useCases;
    case "requirement":
      return project.requirements;
    case "component":
      return project.components;
    case "flow":
      return project.flows;
    case "decision":
      return project.decisions;
    case "glossary":
      return project.glossary;
    case "test":
      return project.tests;
  }
}

function findArtifact(project: Project, sel: Selection): Artifact | null {
  return bucketOf(project, sel.kind).find((a) => a.id === sel.id) ?? null;
}

function withBucket(project: Project, kind: ArtifactKind, list: Artifact[]): Project {
  switch (kind) {
    case "stakeholder":
      return { ...project, stakeholders: list as Project["stakeholders"] };
    case "need":
      return { ...project, needs: list as Project["needs"] };
    case "use-case":
      return { ...project, useCases: list as Project["useCases"] };
    case "requirement":
      return { ...project, requirements: list as Project["requirements"] };
    case "component":
      return { ...project, components: list as Project["components"] };
    case "flow":
      return { ...project, flows: list as Project["flows"] };
    case "decision":
      return { ...project, decisions: list as Project["decisions"] };
    case "glossary":
      return { ...project, glossary: list as Project["glossary"] };
    case "test":
      return { ...project, tests: list as Project["tests"] };
  }
}

function replaceArtifact(project: Project, updated: Artifact): Project {
  const list = bucketOf(project, updated.kind).map((a) => (a.id === updated.id ? updated : a));
  return withBucket(project, updated.kind, list);
}

function newArtifact(project: Project, kind: ArtifactKind): Artifact {
  const id = nextId(project, kind);
  const created = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case "stakeholder":
      return {
        kind,
        id,
        title: "Untitled stakeholder",
        type: "primary",
        body: "",
        created,
      };
    case "need":
      return {
        kind,
        id,
        title: "Untitled need",
        status: "draft",
        moscow: "should",
        stakeholder: "",
        tags: [],
        body: "",
        created,
      };
    case "use-case":
      return {
        kind,
        id,
        title: "Untitled use case",
        status: "draft",
        moscow: "should",
        trace: [],
        actors: [],
        stories: [],
        preconditions: [],
        // Every use case links to a flow; default to a matching flow id
        // (e.g. UC-007 -> FL-007) that behaviour modelling will later fill in.
        flow: id.replace(/^UC-/, "FL-"),
        created,
      };
    case "requirement":
      return {
        kind,
        id,
        title: "Untitled requirement",
        status: "draft",
        moscow: "should",
        trace: [],
        format: "EARS",
        ears: "ubiquitous",
        condition: "",
        subject: "system",
        action: "",
        object: "",
        constraint: "",
        created,
      };
    case "component":
      return {
        kind,
        id,
        title: "Untitled component",
        parent: "",
        description: "",
        activities: [],
        variables: [],
        decisions: [],
        created,
      };
    case "flow":
      return {
        kind,
        id,
        title: "Untitled flow",
        main: [],
        alternates: [],
        created,
      };
    case "decision":
      return {
        kind,
        id,
        title: "Untitled decision",
        status: "proposed",
        trace: [],
        context: "",
        concern: "",
        decision: "",
        alternatives: "",
        criterion: "",
        downside: "",
        created,
      };
    case "glossary":
      return {
        kind,
        id,
        title: "Untitled term",
        aliases: [],
        definition: "",
        created,
      };
    case "test":
      return {
        kind,
        id,
        title: "Untitled test",
        trace: [],
        file: "",
        result: "unknown",
        body: "",
        created,
      };
  }
}

// Active file-watch teardown, kept at module scope so repeated init() calls
// (React StrictMode mounts effects twice in dev) replace rather than stack
// watchers.
let stopWatching: (() => void) | null = null;

export const useStore = create<AppState>((set, get) => {
  /**
   * Start watching the open project's files so external edits (a manual change,
   * an LLM rewriting a file, a git checkout) reload the project automatically.
   * A no-op on backends without file watching (the browser fallback).
   */
  const beginWatching = async () => {
    const { storage } = get();
    if (!storage.watch) return;
    stopWatching?.();
    stopWatching = null;
    stopWatching = await storage.watch(() => {
      void get().reload();
    });
  };

  /**
   * Load the just-opened project and reset any UI state tied to the previous
   * one — a stale selection would point at an artifact that no longer exists.
   * Shared by `chooseProject` (open existing) and `newProject` (create new).
   */
  const openLoaded = async () => {
    const { storage } = get();
    set({ loading: true });
    const project = await storage.load();
    set({
      project,
      ready: true,
      loading: false,
      selection: null,
      history: [],
      search: "",
    });
    void beginWatching();
  };

  return {
    storage: createStorage(),
    project: emptyProject(),
    ready: false,
    loading: true,
    view: "needs",
    search: "",
    selection: null,
    history: [],
    theme: initialTheme(),
    prefs: loadPrefs(),

    init: async () => {
      const { storage } = get();
      if (storage.isReady()) {
        set({ loading: true });
        const project = await storage.load();
        set({ project, ready: true, loading: false });
        void beginWatching();
      } else {
        set({ ready: false, loading: false });
      }
    },

    reload: async () => {
      const { storage } = get();
      if (!storage.isReady()) return;
      const project = await storage.load();
      set({ project });
    },

    chooseProject: async () => {
      const { storage } = get();
      const ok = await storage.chooseProject();
      if (!ok) return;
      await openLoaded();
    },

    newProject: async (name) => {
      const { storage } = get();
      const ok = await storage.createProject(name);
      if (!ok) return;
      await openLoaded();
    },

    setView: (view) => set({ view, selection: null, search: "", history: [] }),
    setSearch: (search) => set({ search }),
    select: (kind, id) => {
      const { selection, history } = get();
      // Navigating from one artifact to another (e.g. a tagged use case) pushes
      // the current one onto the breadcrumb so a Back button can return to it.
      const isSame = selection && selection.kind === kind && selection.id === id;
      const nextHistory = selection && !isSame ? [...history, selection] : history;
      set({ selection: { kind, id }, history: nextHistory });
    },
    back: () => {
      const { history } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      set({ selection: prev, history: history.slice(0, -1) });
    },
    closeDetail: () => set({ selection: null, history: [] }),

    toggleTheme: () => {
      const theme = get().theme === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, theme);
      set({ theme });
    },

    syncSystemTheme: () => {
      // Follow the OS only while the user hasn't made an explicit choice.
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return;
      set({ theme: systemPrefersDark() ? "dark" : "light" });
    },

    setPrefs: (patch) => {
      const prefs = { ...get().prefs, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch {
        // Ignore storage failures (private mode, quota) — prefs stay in-memory.
      }
      set({ prefs });
    },

    createArtifact: async (kind) => {
      const { project, storage } = get();
      const artifact = newArtifact(project, kind);
      const next = withBucket(project, kind, [...bucketOf(project, kind), artifact]);
      set({ project: next, selection: { kind, id: artifact.id } });
      await storage.save(artifact);
    },

    addComponent: async (parentId) => {
      const { project, storage } = get();
      const base = newArtifact(project, "component");
      const component = { ...base, parent: parentId } as Artifact;
      const next = withBucket(project, "component", [...project.components, component]);
      set({ project: next, selection: { kind: "component", id: component.id }, history: [] });
      await storage.save(component);
    },

    updateSelected: async (patch) => {
      const { project, selection, storage } = get();
      if (!selection) return;
      const current = findArtifact(project, selection);
      if (!current) return;
      const updated = { ...current, ...patch } as Artifact;

      // Renaming a component changes its title-handle, which every guard,
      // precondition and effect that references its state is written in terms
      // of. Rewrite those references so the rename can't silently orphan them,
      // then persist the renamed component plus each artifact that was touched.
      if (
        updated.kind === "component" &&
        current.kind === "component" &&
        typeof patch.title === "string" &&
        patch.title !== current.title
      ) {
        const oldHandle = componentHandle(current.title);
        const newHandle = componentHandle(updated.title);
        const withTitle = replaceArtifact(project, updated);
        const { project: next, touched } = renameComponentHandle(withTitle, oldHandle, newHandle);
        set({ project: next });

        const finalComponent = next.components.find((c) => c.id === updated.id) ?? updated;
        const toSave: Artifact[] = [finalComponent];
        for (const a of touched) {
          if (a.kind === "component" && a.id === finalComponent.id) continue;
          toSave.push(a);
        }
        for (const a of toSave) await storage.save(a);
        return;
      }

      set({ project: replaceArtifact(project, updated) });
      await storage.save(updated);
    },

    deleteSelected: async () => {
      const { selection, removeArtifact } = get();
      if (!selection) return;
      await removeArtifact(selection.kind, selection.id);
    },

    upsertArtifact: async (artifact) => {
      const { project, storage } = get();
      const list = bucketOf(project, artifact.kind);
      const exists = list.some((a) => a.id === artifact.id);
      const nextList = exists
        ? list.map((a) => (a.id === artifact.id ? artifact : a))
        : [...list, artifact];
      set({ project: withBucket(project, artifact.kind, nextList) });
      await storage.save(artifact);
    },

    removeArtifact: async (kind, id) => {
      const { project, storage, selection } = get();
      const current = bucketOf(project, kind).find((a) => a.id === id);
      if (!current) return;
      const nextList = bucketOf(project, kind).filter((a) => a.id !== id);
      const next = withBucket(project, kind, nextList);
      const clearSel = selection && selection.kind === kind && selection.id === id;
      if (clearSel) set({ project: next, selection: null, history: [] });
      else set({ project: next, selection: selection });
      await storage.remove(current);
    },

    ensureFlowForUseCase: async (ucId) => {
      const { project, storage } = get();
      const uc = project.useCases.find((u) => u.id === ucId);
      if (!uc) return null;
      const existing = uc.flow ? project.flows.find((f) => f.id === uc.flow) : undefined;
      if (existing) return existing.id;

      const flowId = uc.flow || nextId(project, "flow");
      const created = new Date().toISOString().slice(0, 10);
      const flow = {
        kind: "flow" as const,
        id: flowId,
        title: uc.title,
        main: [],
        alternates: [],
        created,
      };
      let next = withBucket(project, "flow", [...project.flows, flow]);
      // Link the UC to this flow if it wasn't already pointing at it.
      let ucToSave: typeof uc | null = null;
      if (uc.flow !== flowId) {
        ucToSave = { ...uc, flow: flowId };
        next = replaceArtifact(next, ucToSave);
      }
      set({ project: next });
      await storage.save(flow);
      if (ucToSave) await storage.save(ucToSave);
      return flowId;
    },
  };
});
