import type { CompletionRequest, CompletionResult, LlmClient } from "./types";
import { loadLlmConfig, type LlmConfig } from "./config";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

/** Shape of the bits of the Messages API response we read. */
interface AnthropicResponse {
  content?: { type: string; text?: string }[];
}

/**
 * Direct-fetch Anthropic client. Talks to the Messages API straight from the
 * renderer, opting in with `anthropic-dangerous-direct-browser-access` (the API
 * has no CORS headers otherwise, to discourage leaking keys into public web
 * pages). That's acceptable here — a desktop app calling with the user's own
 * key — and is the simplest path that works in both `vite dev` and the Tauri
 * webview. The eventual hardening is a Tauri command that proxies the call in
 * Rust so the key never reaches the renderer; callers depend only on
 * `LlmClient` and won't change.
 */
export class AnthropicClient implements LlmClient {
  // Config is read through a getter (not captured at construction) so a key
  // entered in settings takes effect on the next call without rebuilding the
  // client. Injectable for tests.
  constructor(private readonly getConfig: () => LlmConfig = loadLlmConfig) {}

  isConfigured(): boolean {
    return this.getConfig().apiKey.trim().length > 0;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const config = this.getConfig();
    const apiKey = config.apiKey.trim();
    if (!apiKey) return { ok: false, error: "No Anthropic API key configured." };

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(request.temperature != null ? { temperature: request.temperature } : {}),
          ...(request.system ? { system: request.system } : {}),
          messages: [{ role: "user", content: request.prompt }],
        }),
      });
    } catch (e) {
      return { ok: false, error: `Network error contacting Anthropic: ${errText(e)}` };
    }

    if (!response.ok) {
      const detail = await errorDetail(response);
      return { ok: false, error: `Anthropic API error ${response.status}${detail ? `: ${detail}` : ""}` };
    }

    let data: AnthropicResponse;
    try {
      data = (await response.json()) as AnthropicResponse;
    } catch (e) {
      return { ok: false, error: `Could not parse Anthropic response: ${errText(e)}` };
    }

    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return { ok: false, error: "Anthropic returned an empty completion." };
    return { ok: true, text };
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Pull a human-readable message out of an error response, tolerating any body. */
async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? "";
  } catch {
    return "";
  }
}
