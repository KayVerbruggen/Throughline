import { AnthropicClient } from "./anthropic";
import type { LlmClient } from "./types";

export type { CompletionRequest, CompletionResult, LlmClient } from "./types";
export { completeJson, extractJson, type JsonResult } from "./json";
export type { LlmConfig } from "./config";
export { DEFAULT_MODEL, MODEL_OPTIONS, emptyLlmConfig, loadLlmConfig, saveLlmConfig } from "./config";

/**
 * Pick the LLM client for the current runtime. Today both `vite dev` and the
 * Tauri shell use the same direct-fetch Anthropic client — the Tauri webview
 * can reach the API with the direct-browser-access header just like a browser.
 * A future Tauri build can swap in a client that proxies through Rust to keep
 * the key out of the renderer; callers depend only on `LlmClient`, so nothing
 * downstream changes.
 */
export function createLlmClient(): LlmClient {
  return new AnthropicClient();
}
