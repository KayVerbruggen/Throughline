import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { Artifact, ArtifactKind, Project } from "../types";
import { emptyProject } from "../types";
import type { StorageAdapter } from "./adapter";
import { filenameFor, parseArtifact, serializeArtifact } from "./serialize";

const DIR_KEY = "throughline.projectDir";

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

  constructor() {
    this.dir = localStorage.getItem(DIR_KEY);
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
        case "need":
          project.needs.push(artifact);
          break;
        case "use-case":
          project.useCases.push(artifact);
          break;
        case "requirement":
          project.requirements.push(artifact);
          break;
      }
    }
    sortById(project);
    return project;
  }

  async save(artifact: Artifact): Promise<void> {
    this.requireDir();
    await invoke("write_artifact", {
      projectDir: this.dir,
      kind: artifact.kind,
      filename: filenameFor(artifact),
      content: serializeArtifact(artifact),
    });
  }

  async remove(artifact: Artifact): Promise<void> {
    this.requireDir();
    await invoke("delete_artifact", {
      projectDir: this.dir,
      kind: artifact.kind,
      filename: filenameFor(artifact),
    });
  }

  async chooseProject(): Promise<boolean> {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose a Throughline project folder",
    });
    if (typeof picked !== "string") return false;
    this.dir = picked;
    localStorage.setItem(DIR_KEY, picked);
    await invoke("ensure_project", { projectDir: picked });
    return true;
  }

  private requireDir(): void {
    if (!this.dir) throw new Error("No project folder is open.");
  }
}

function sortById(project: Project): void {
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  project.needs.sort(byId);
  project.useCases.sort(byId);
  project.requirements.sort(byId);
}
