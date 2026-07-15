/**
 * The LLM foundation is deliberately narrow: one prompt in, one text out — no
 * chat history, no streaming, no tool use. Higher-level features (guard/effect
 * suggestion, prototype drafting, reverse-engineering) build their own prompts
 * and parse the result themselves, depending only on the `LlmClient` interface
 * so the transport and provider can change underneath them.
 */

/** A single-shot completion request. */
export interface CompletionRequest {
  /** System instruction framing the task (optional). */
  system?: string;
  /** The user prompt. */
  prompt: string;
  /** Upper bound on tokens generated. Defaults per-client when omitted. */
  maxTokens?: number;
  /** 0 = deterministic; suggestion features default low. Omitted = provider default. */
  temperature?: number;
}

/**
 * Result of a completion. Mirrors the `analyzeGuard` Result style used across
 * `model/`: never throws, so callers can surface failures inline in the UI.
 */
export type CompletionResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Provider-agnostic completion client. `createLlmClient()` picks an
 * implementation for the current runtime; features depend only on this
 * interface, never on a concrete provider or transport.
 */
export interface LlmClient {
  /** Whether a usable configuration (e.g. an API key) is present. */
  isConfigured(): boolean;
  /**
   * Run one completion. Never throws — transport, HTTP and parse failures all
   * come back as `{ ok: false, error }`.
   */
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
