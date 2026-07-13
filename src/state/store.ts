import { create } from "zustand";

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
  | "traceability";

export interface Selection {
  kind: ArtifactKind;
  id: string;
}

interface AppState {
  storage: StorageAdapter;
  project: Project;
  ready: boolean;
  loading: boolean;
  view: ViewId;
  search: string;
  selection: Selection | null;
  theme: "light" | "dark";

  init: () => Promise<void>;
  reload: () => Promise<void>;
  chooseProject: () => Promise<void>;

  setView: (view: ViewId) => void;
  setSearch: (search: string) => void;
  select: (kind: ArtifactKind, id: string) => void;
  closeDetail: () => void;
  toggleTheme: () => void;
  syncSystemTheme: () => void;

  createArtifact: (kind: ArtifactKind) => Promise<void>;
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
        description: "",
        activities: [],
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

  return {
    storage: createStorage(),
    project: emptyProject(),
    ready: false,
    loading: true,
    view: "needs",
    search: "",
    selection: null,
    theme: initialTheme(),

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
      set({ loading: true });
      const project = await storage.load();
      set({ project, ready: true, loading: false });
      void beginWatching();
    },

    setView: (view) => set({ view, selection: null, search: "" }),
    setSearch: (search) => set({ search }),
    select: (kind, id) => set({ selection: { kind, id } }),
    closeDetail: () => set({ selection: null }),

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

    createArtifact: async (kind) => {
      const { project, storage } = get();
      const artifact = newArtifact(project, kind);
      const next = withBucket(project, kind, [...bucketOf(project, kind), artifact]);
      set({ project: next, selection: { kind, id: artifact.id } });
      await storage.save(artifact);
    },

    updateSelected: async (patch) => {
      const { project, selection, storage } = get();
      if (!selection) return;
      const current = findArtifact(project, selection);
      if (!current) return;
      const updated = { ...current, ...patch } as Artifact;
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
      set({ project: next, selection: clearSel ? null : selection });
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
