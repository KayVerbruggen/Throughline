import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import type { Artifact, ArtifactKind, Project } from "../types";
import { emptyProject } from "../types";
import type { StorageAdapter } from "./adapter";
import { filenameFor, parseArtifact, serializeArtifact } from "./serialize";

const DIR_KEY = "throughline.projectDir";

/** Rust event carrying the basenames of `.md` files that changed on disk. */
const CHANGE_EVENT = "project-files-changed";

/**
 * How long a file the app just wrote keeps ignoring watcher echoes. Must clear
 * the watcher's 300 ms debounce plus write latency; during continuous inline
 * editing each keystroke's save refreshes the window, so the app's own writes
 * never trigger a reload that would clobber what the user is typing.
 */
const SELF_WRITE_TTL_MS = 2000;

interface ArtifactFile {
  kind: string;
  filename: string;
  content: string;
}

/**
 * Real file storage: the project is a directory of `.md` files (source of
 * truth), read and written through Rust commands. YAML/markdown mapping lives
 * entirely on this (TS) side; Rust only moves raw text.
 */
export class TauriStorage implements StorageAdapter {
  readonly kind = "tauri" as const;
  private dir: string | null;

  /**
   * Filenames this adapter wrote recently, each mapped to when its watcher echo
   * should stop being ignored. Lets `watch` tell the app's own saves apart from
   * genuinely external edits.
   */
  private recentWrites = new Map<string, number>();

  constructor() {
    this.dir = localStorage.getItem(DIR_KEY);
  }

  /** Remember a filename we just wrote, so its watcher echo is ignored. */
  private markSelfWrite(filename: string): void {
    this.recentWrites.set(filename, Date.now() + SELF_WRITE_TTL_MS);
  }

  isReady(): boolean {
    return this.dir != null;
  }

  location(): string | null {
    return this.dir;
  }

  async load(): Promise<Project> {
    if (!this.dir) return emptyProject();
    await invoke("ensure_project", { projectDir: this.dir });
    const files = await invoke<ArtifactFile[]>("read_project", { projectDir: this.dir });

    const project = emptyProject();
    for (const f of files) {
      const kind = f.kind as ArtifactKind;
      const artifact = parseArtifact(kind, f.filename, f.content);
      switch (artifact.kind) {
        case "stakeholder":
          project.stakeholders.push(artifact);
          break;
        case "need":
          project.needs.push(artifact);
          break;
        case "use-case":
          project.useCases.push(artifact);
          break;
        case "requirement":
          project.requirements.push(artifact);
          break;
        case "component":
          project.components.push(artifact);
          break;
        case "flow":
          project.flows.push(artifact);
          break;
        case "decision":
          project.decisions.push(artifact);
          break;
        case "glossary":
          project.glossary.push(artifact);
          break;
        case "test":
          project.tests.push(artifact);
          break;
      }
    }
    sortById(project);
    return project;
  }

  async save(artifact: Artifact): Promise<void> {
    this.requireDir();
    const filename = filenameFor(artifact);
    this.markSelfWrite(filename);
    await invoke("write_artifact", {
      projectDir: this.dir,
      kind: artifact.kind,
      filename,
      content: serializeArtifact(artifact),
    });
  }

  async remove(artifact: Artifact): Promise<void> {
    this.requireDir();
    const filename = filenameFor(artifact);
    this.markSelfWrite(filename);
    await invoke("delete_artifact", {
      projectDir: this.dir,
      kind: artifact.kind,
      filename,
    });
  }

  async watch(onExternalChange: () => void): Promise<() => void> {
    if (!this.dir) return () => {};
    await invoke("watch_project", { projectDir: this.dir });
    const unlisten = await listen<string[]>(CHANGE_EVENT, (event) => {
      const now = Date.now();
      // Was every changed file one we just wrote? If so it's our own echo.
      const external = (event.payload ?? []).some((name) => {
        const until = this.recentWrites.get(name);
        return until == null || until < now;
      });
      // Drop expired self-write markers so the map can't grow without bound.
      for (const [name, until] of this.recentWrites) {
        if (until < now) this.recentWrites.delete(name);
      }
      if (external) onExternalChange();
    });
    return unlisten;
  }

  async chooseProject(): Promise<boolean> {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Open a Throughline project folder",
    });
    if (typeof picked !== "string") return false;
    this.setDir(picked);
    await invoke("ensure_project", { projectDir: picked });
    return true;
  }

  async createProject(name: string): Promise<boolean> {
    const folder = sanitizeFolderName(name);
    if (!folder) return false;
    const parent = await open({
      directory: true,
      multiple: false,
      title: `Choose where to create "${folder}"`,
    });
    if (typeof parent !== "string") return false;
    const sep = parent.includes("\\") ? "\\" : "/";
    const dir = parent.replace(/[\\/]+$/, "") + sep + folder;
    this.setDir(dir);
    // ensure_project uses create_dir_all, so this also creates `dir` itself.
    await invoke("ensure_project", { projectDir: dir });
    return true;
  }

  private setDir(dir: string): void {
    this.dir = dir;
    localStorage.setItem(DIR_KEY, dir);
  }

  private requireDir(): void {
    if (!this.dir) throw new Error("No project folder is open.");
  }
}

/**
 * Reduce a user-typed project name to a safe single folder name: drop path
 * separators and characters Windows/POSIX reject, collapse whitespace. Returns
 * "" when nothing usable is left (the caller then aborts).
 */
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .trim();
}

function sortById(project: Project): void {
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  project.stakeholders.sort(byId);
  project.needs.sort(byId);
  project.useCases.sort(byId);
  project.requirements.sort(byId);
  project.components.sort(byId);
  project.flows.sort(byId);
  project.decisions.sort(byId);
  project.glossary.sort(byId);
  project.tests.sort(byId);
}
