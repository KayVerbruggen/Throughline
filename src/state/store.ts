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

  createArtifact: (kind: ArtifactKind) => Promise<void>;
  updateSelected: (patch: Partial<Artifact>) => Promise<void>;
  deleteSelected: () => Promise<void>;
}

const THEME_KEY = "throughline.theme";

function initialTheme(): "light" | "dark" {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

// --- immutable project helpers ----------------------------------------------

function findArtifact(project: Project, sel: Selection): Artifact | null {
  const list =
    sel.kind === "need"
      ? project.needs
      : sel.kind === "use-case"
        ? project.useCases
        : project.requirements;
  return (list as Artifact[]).find((a) => a.id === sel.id) ?? null;
}

function replaceArtifact(project: Project, updated: Artifact): Project {
  const swap = <T extends Artifact>(list: T[]) =>
    list.map((a) => (a.id === updated.id ? (updated as T) : a));
  switch (updated.kind) {
    case "need":
      return { ...project, needs: swap(project.needs) };
    case "use-case":
      return { ...project, useCases: swap(project.useCases) };
    case "requirement":
      return { ...project, requirements: swap(project.requirements) };
  }
}

function newArtifact(project: Project, kind: ArtifactKind): Artifact {
  const id = nextId(project, kind);
  const created = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case "need":
      return {
        kind,
        id,
        title: "Untitled need",
        status: "draft",
        moscow: "should",
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
        mainFlow: [],
        altFlows: [],
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
        body: "",
        created,
      };
  }
}

export const useStore = create<AppState>((set, get) => ({
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

  createArtifact: async (kind) => {
    const { project, storage } = get();
    const artifact = newArtifact(project, kind);
    const next = { ...project };
    if (kind === "need") next.needs = [...project.needs, artifact as never];
    else if (kind === "use-case") next.useCases = [...project.useCases, artifact as never];
    else next.requirements = [...project.requirements, artifact as never];
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
    const { project, selection, storage } = get();
    if (!selection) return;
    const current = findArtifact(project, selection);
    if (!current) return;
    const next = { ...project };
    if (selection.kind === "need") next.needs = project.needs.filter((a) => a.id !== selection.id);
    else if (selection.kind === "use-case")
      next.useCases = project.useCases.filter((a) => a.id !== selection.id);
    else next.requirements = project.requirements.filter((a) => a.id !== selection.id);
    set({ project: next, selection: null });
    await storage.remove(current);
  },
}));
