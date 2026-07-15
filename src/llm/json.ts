import type { CompletionRequest, LlmClient } from "./types";

export type JsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const JSON_DIRECTIVE =
  "Respond with ONLY a single JSON value and nothing else — no explanation outside the JSON, no markdown code fences.";

/**
 * Ask the model for a JSON value and validate it before returning. Wraps
 * `complete`: it appends a JSON-only directive, extracts the JSON from the reply
 * (tolerating ```json fences and stray prose), parses it, and runs the caller's
 * `validate`. If extraction, parsing, or validation fails it retries once,
 * feeding the error back so the model can self-correct; a second failure resolves
 * to `{ ok: false }`.
 *
 * `validate` should throw an `Error` on bad input — its message is surfaced and,
 * on the first failure, sent back to the model — and return the typed value on
 * success. This is where callers fold in *semantic* checks (e.g. type-checking a
 * suggested guard), so those failures also drive the self-correction loop rather
 * than being reported raw.
 */
export async function completeJson<T>(
  client: LlmClient,
  request: CompletionRequest,
  validate: (raw: unknown) => T,
): Promise<JsonResult<T>> {
  const system = [request.system, JSON_DIRECTIVE].filter(Boolean).join("\n\n");
  let prompt = request.prompt;
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.complete({ ...request, system, prompt });
    // A transport/HTTP failure won't be fixed by re-prompting — surface it now.
    if (!res.ok) return { ok: false, error: res.error };

    try {
      const parsed = JSON.parse(extractJson(res.text)) as unknown;
      return { ok: true, value: validate(parsed) };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      prompt =
        `${request.prompt}\n\nYour previous reply could not be used: ${lastError}\n` +
        "Return only a single valid JSON value matching the requested shape.";
    }
  }
  return { ok: false, error: lastError || "The model did not return usable JSON." };
}

/**
 * Pull a JSON string out of a model reply. Tries a ```/```json fenced block
 * first, then the widest `{…}` or `[…]` span, then the whole trimmed text.
 * Parsing and validation are the caller's job (via `completeJson`).
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();

  const starts = [trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) return trimmed;
  const start = Math.min(...starts);
  const close = trimmed[start] === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(close);
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}
