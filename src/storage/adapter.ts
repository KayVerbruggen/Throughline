import type { Artifact, Project } from "../types";

/**
 * Storage backend contract. The frontend talks only to this interface, so the
 * same views run against real files (Tauri) or a seeded in-memory/localStorage
 * project (browser) — matching the "same frontend, later deployable to the
 * browser" goal in the project notes.
 */
export interface StorageAdapter {
  readonly kind: "tauri" | "browser";

  /** Whether a project is currently open and ready to read/write. */
  isReady(): boolean;

  /** Human-readable label for where the project lives (or null if none). */
  location(): string | null;

  /** Load the entire project. */
  load(): Promise<Project>;

  /** Create or overwrite a single artifact file. */
  save(artifact: Artifact): Promise<void>;

  /** Delete a single artifact file. */
  remove(artifact: Artifact): Promise<void>;

  /**
   * Prompt the user to choose/create a project location (Tauri opens a folder
   * dialog; browser resets to the seeded sample). Resolves true when a project
   * is ready afterwards.
   */
  chooseProject(): Promise<boolean>;
}
