import type { StorageAdapter } from "./adapter";
import { BrowserStorage } from "./browserStorage";
import { TauriStorage } from "./tauriStorage";

export type { StorageAdapter } from "./adapter";

/** True when running inside the Tauri shell (v2 injects this global). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Pick the appropriate storage backend for the current runtime. */
export function createStorage(): StorageAdapter {
  return isTauri() ? new TauriStorage() : new BrowserStorage();
}
