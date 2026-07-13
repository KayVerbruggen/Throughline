import type { Artifact, Project } from "../types";
import { emptyProject } from "../types";
import type { StorageAdapter } from "./adapter";
import { seedProject } from "./seed";

// Bumped whenever the seed's shape changes so a stale cached project re-seeds
// rather than loading a value missing newer collections:
//   .v2 — Stakeholders became first-class
//   .v3 — Components + Flows (System Structure / Behavior)
const KEY = "throughline.project.v3";

/**
 * Browser fallback: keeps the whole project as JSON in localStorage, seeded
 * from the sample project on first run. Lets `vite dev` show a working UI with
 * no Tauri shell. (In this mode the plain-text file round-trip isn't exercised;
 * that path is the Tauri adapter's job.)
 */
export class BrowserStorage implements StorageAdapter {
  readonly kind = "browser" as const;

  isReady(): boolean {
    return true;
  }

  location(): string {
    return "Sample project (browser)";
  }

  private read(): Project {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Project;
    } catch {
      /* fall through to seed */
    }
    const seeded = seedProject();
    this.write(seeded);
    return seeded;
  }

  private write(project: Project): void {
    localStorage.setItem(KEY, JSON.stringify(project));
  }

  async load(): Promise<Project> {
    return this.read();
  }

  async save(artifact: Artifact): Promise<void> {
    const project = this.read();
    upsert(project, artifact);
    this.write(project);
  }

  async remove(artifact: Artifact): Promise<void> {
    const project = this.read();
    removeFrom(project, artifact);
    this.write(project);
  }

  async chooseProject(): Promise<boolean> {
    // Reset the sample project.
    this.write(seedProject());
    return true;
  }
}

function bucket(project: Project, kind: Artifact["kind"]): Artifact[] {
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

function upsert(project: Project, artifact: Artifact): void {
  const list = bucket(project, artifact.kind) as Artifact[];
  const i = list.findIndex((a) => a.id === artifact.id);
  if (i >= 0) list[i] = artifact;
  else list.push(artifact);
}

function removeFrom(project: Project, artifact: Artifact): void {
  const list = bucket(project, artifact.kind) as Artifact[];
  const i = list.findIndex((a) => a.id === artifact.id);
  if (i >= 0) list.splice(i, 1);
}

export { emptyProject };
