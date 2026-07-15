import { afterEach, describe, expect, it, vi } from "vitest";

import { AnthropicClient } from "./anthropic";
import type { LlmConfig } from "./config";

const CONFIGURED: LlmConfig = { apiKey: "sk-test-123", model: "claude-sonnet-5" };
const UNCONFIGURED: LlmConfig = { apiKey: "", model: "claude-sonnet-5" };

/** A minimal `fetch` Response stand-in carrying JSON. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response;
}

/** One text content block, the successful Messages API shape we read. */
function textCompletion(text: string) {
  return jsonResponse({ content: [{ type: "text", text }] });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AnthropicClient.isConfigured", () => {
  it("is true only when a non-blank api key is present", () => {
    expect(new AnthropicClient(() => CONFIGURED).isConfigured()).toBe(true);
    expect(new AnthropicClient(() => UNCONFIGURED).isConfigured()).toBe(false);
    expect(new AnthropicClient(() => ({ apiKey: "   ", model: "m" })).isConfigured()).toBe(false);
  });
});

describe("AnthropicClient.complete", () => {
  it("returns an error and never calls the network when unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new AnthropicClient(() => UNCONFIGURED);

    const result = await client.complete({ prompt: "hi" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/api key/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the Messages API with the required headers and body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(textCompletion("ok"));
    const client = new AnthropicClient(() => CONFIGURED);

    await client.complete({ prompt: "Suggest a guard", system: "You are terse", temperature: 0, maxTokens: 256 });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test-123");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: "claude-sonnet-5",
      max_tokens: 256,
      temperature: 0,
      system: "You are terse",
      messages: [{ role: "user", content: "Suggest a guard" }],
    });
  });

  it("omits optional fields when not supplied", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(textCompletion("ok"));
    await new AnthropicClient(() => CONFIGURED).complete({ prompt: "hi" });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBeGreaterThan(0); // client default
    expect("temperature" in body).toBe(false);
    expect("system" in body).toBe(false);
  });

  it("concatenates text content blocks and trims", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        content: [
          { type: "text", text: "  chamber." },
          { type: "text", text: "open == true  " },
        ],
      }),
    );
    const result = await new AnthropicClient(() => CONFIGURED).complete({ prompt: "x" });
    expect(result).toEqual({ ok: true, text: "chamber.open == true" });
  });

  it("reports the status and message on an HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { message: "invalid x-api-key" } }, { ok: false, status: 401 }),
    );
    const result = await new AnthropicClient(() => CONFIGURED).complete({ prompt: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("401");
      expect(result.error).toContain("invalid x-api-key");
    }
  });

  it("reports a network failure instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const result = await new AnthropicClient(() => CONFIGURED).complete({ prompt: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/network error.*offline/i);
  });

  it("reports an empty completion rather than returning blank text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ content: [] }));
    const result = await new AnthropicClient(() => CONFIGURED).complete({ prompt: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty/i);
  });
});
