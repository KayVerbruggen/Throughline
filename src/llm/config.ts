/**
 * LLM configuration (API key + model choice).
 *
 * Kept deliberately separate from the storage adapter and the project buckets:
 * a project is a folder of `.md` files living in the user's git repo, and the
 * API key must NEVER land there. It lives in `localStorage` instead, which is
 * scoped to the app's webview profile (app-scoped, not project-scoped) in both
 * `vite dev` and the Tauri shell — so switching or sharing projects never
 * exposes it. Future hardening: move the key to the OS keychain via a Tauri
 * command so it never reaches the renderer at all; callers keep using
 * `loadLlmConfig`/`createLlmClient` unchanged.
 */

export interface LlmConfig {
  /** Anthropic API key, or "" when unconfigured. */
  apiKey: string;
  /** Model id, e.g. "claude-sonnet-5". */
  model: string;
}

const CONFIG_KEY = "throughline.llm";

/** Fast, capable default for in-app suggestions; overridable in settings. */
export const DEFAULT_MODEL = "claude-sonnet-5";

export function emptyLlmConfig(): LlmConfig {
  return { apiKey: "", model: DEFAULT_MODEL };
}

export function loadLlmConfig(): LlmConfig {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CONFIG_KEY) : null;
    if (!raw) return emptyLlmConfig();
    const parsed = JSON.parse(raw) as Partial<LlmConfig>;
    // Merge over defaults so a field added in a later version still gets a
    // sane value when reading an older, partial blob.
    return { ...emptyLlmConfig(), ...parsed };
  } catch {
    return emptyLlmConfig();
  }
}

export function saveLlmConfig(config: LlmConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage failures (private mode, quota) — config stays in-memory.
  }
}
