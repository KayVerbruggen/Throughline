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
   * Prompt the user to open an *existing* project location (Tauri opens a folder
   * dialog; browser resets to the seeded sample). Resolves true when a project
   * is ready afterwards.
   */
  chooseProject(): Promise<boolean>;

  /**
   * Create a brand-new, empty project. Tauri prompts for a parent location and
   * creates a `name` subfolder there (scaffolding the per-kind folders); the
   * browser fallback starts a fresh empty in-memory project. Resolves true when
   * the new project is ready afterwards, false if the user cancelled.
   */
  createProject(name: string): Promise<boolean>;

  /**
   * Watch the project's files for changes made outside the app — a manual edit
   * in an editor, an LLM rewriting a file, a git checkout — and call
   * `onExternalChange` when they happen, so the caller can reload. Changes the
   * app writes itself are filtered out and don't fire the callback. Resolves to
   * a function that stops watching.
   *
   * Optional: backends without a real filesystem (the browser fallback) omit it.
   */
  watch?(onExternalChange: () => void): Promise<() => void>;
}
