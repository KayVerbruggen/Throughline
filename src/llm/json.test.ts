import { describe, expect, it, vi } from "vitest";

import { completeJson, extractJson } from "./json";
import type { CompletionResult, LlmClient } from "./types";

/** A client that returns each queued reply in turn, recording the prompts it saw. */
function scriptedClient(replies: CompletionResult[]): LlmClient & { prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  return {
    prompts,
    isConfigured: () => true,
    complete: vi.fn(async (req) => {
      prompts.push(req.prompt);
      return replies[Math.min(i++, replies.length - 1)];
    }),
  };
}

describe("extractJson", () => {
  it("returns clean JSON unchanged", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("strips a ```json fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips a bare ``` fence", () => {
    expect(extractJson('```\n[1,2]\n```')).toBe("[1,2]");
  });

  it("pulls the object span out of surrounding prose", () => {
    expect(extractJson('Sure! Here it is: {"a":1} — hope that helps')).toBe('{"a":1}');
  });

  it("handles a top-level array", () => {
    expect(extractJson("prefix [1, 2, 3] suffix")).toBe("[1, 2, 3]");
  });
});

describe("completeJson", () => {
  it("parses and validates a good first reply", async () => {
    const client = scriptedClient([{ ok: true, text: '{"n":42}' }]);
    const r = await completeJson(client, { prompt: "give me n" }, (raw) => {
      const o = raw as { n: number };
      if (typeof o.n !== "number") throw new Error("n must be a number");
      return o.n;
    });
    expect(r).toEqual({ ok: true, value: 42 });
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it("retries once with the error fed back, then succeeds", async () => {
    const client = scriptedClient([
      { ok: true, text: "not json at all" },
      { ok: true, text: '{"n":7}' },
    ]);
    const r = await completeJson(client, { prompt: "give me n" }, (raw) => (raw as { n: number }).n);
    expect(r).toEqual({ ok: true, value: 7 });
    expect(client.complete).toHaveBeenCalledTimes(2);
    // The second prompt carries the failure so the model can self-correct.
    expect(client.prompts[1]).toContain("could not be used");
  });

  it("surfaces the validation message after two failures", async () => {
    const client = scriptedClient([
      { ok: true, text: '{"n":"x"}' },
      { ok: true, text: '{"n":"y"}' },
    ]);
    const r = await completeJson(client, { prompt: "give me n" }, (raw) => {
      if (typeof (raw as { n: unknown }).n !== "number") throw new Error("n must be a number");
      return (raw as { n: number }).n;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("n must be a number");
    expect(client.complete).toHaveBeenCalledTimes(2);
  });

  it("does not retry a transport failure", async () => {
    const client = scriptedClient([{ ok: false, error: "network down" }]);
    const r = await completeJson(client, { prompt: "x" }, (raw) => raw);
    expect(r).toEqual({ ok: false, error: "network down" });
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it("appends the JSON-only directive to the system prompt", async () => {
    const client = scriptedClient([{ ok: true, text: "{}" }]);
    const spy = client.complete as ReturnType<typeof vi.fn>;
    await completeJson(client, { prompt: "x", system: "You are terse." }, (raw) => raw);
    const sentSystem = spy.mock.calls[0][0].system as string;
    expect(sentSystem).toContain("You are terse.");
    expect(sentSystem).toContain("ONLY a single JSON value");
  });
});
