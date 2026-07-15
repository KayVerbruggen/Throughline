import type { Project } from "../types";
import { completeJson, type JsonResult } from "./json";
import { allArtifactIds, describeProject } from "./projectContext";
import type { CompletionRequest, LlmClient } from "./types";

export type Severity = "high" | "medium" | "low";

/**
 * One judgement-level issue the critic raises about the model. `refs` are the ids
 * of the artifacts it concerns (resolved to real ones during validation, so they
 * drive jump-links); empty when the finding is about the project as a whole.
 */
export interface Finding {
  severity: Severity;
  /** Short kebab-ish slug, e.g. "untestable", "missing-decision", "undefined-term". */
  category: string;
  title: string;
  detail: string;
  refs: string[];
}

const SYSTEM = `You are a requirements-engineering critic reviewing a systems model built from stakeholders, needs, use cases, EARS requirements, tests, components (with behaviour), design decisions, and a glossary.

Find substantive, judgement-level problems a mechanical checker cannot — the kind a careful reviewer would raise. Good findings include:
- a requirement that is vague, ambiguous, or not verifiable/testable as written;
- two requirements (or a requirement and a use case's behaviour) that conflict or overlap;
- a need that no use case meaningfully addresses, or a use case that doesn't actually serve the need it traces to;
- a load-bearing component or behaviour with no design decision recording why it is the way it is;
- a domain term used in the artifacts' text but missing (or vaguely defined) in the glossary;
- a requirement with no test, where the risk makes that a real gap (not merely the mechanical absence);
- duplicated or redundant artifacts, or a missing artifact the others imply should exist.

Guidance:
- Point to concrete artifacts by id. Prefer a handful of high-value findings over many trivial ones.
- Don't just restate mechanical coverage counts unless the gap genuinely matters. Judgement, not bookkeeping.
- If the model is in good shape, it is fine to return few or no findings.

Return a JSON object of exactly this shape:
{
  "findings": [
    {
      "severity": "high" | "medium" | "low",
      "category": "<short slug, e.g. untestable, conflict, missing-decision, undefined-term, gap>",
      "title": "<one concise line>",
      "detail": "<1-3 sentences: what's wrong and, if useful, how to resolve it>",
      "refs": ["<artifact id>", "..."]
    }
  ]
}
"refs" lists the ids the finding is about (for navigation); use [] when it concerns the project as a whole. Return {"findings": []} when you have nothing substantive to raise.`;

/** Build the critique prompt. Pure and exported for unit tests. */
export function buildCritiquePrompt(project: Project): { system: string; prompt: string } {
  const prompt = `Review this model and report your findings.\n\n${describeProject(project)}`;
  return { system: SYSTEM, prompt };
}

/**
 * Validate a raw critique object into a list of `Finding`s. Throws (driving
 * `completeJson`'s retry) when the shape is wrong; otherwise it is lenient, since
 * findings are advisory: an unrecognised severity falls back to "medium", a
 * missing category to "general", and references to ids that don't exist are
 * dropped so every remaining ref resolves to a real artifact for jump-links.
 */
export function validateCritique(project: Project, raw: unknown): Finding[] {
  if (!raw || typeof raw !== "object") throw new Error('Expected a JSON object with a "findings" array.');
  const arr = (raw as { findings?: unknown }).findings;
  if (!Array.isArray(arr)) throw new Error('"findings" must be an array (use [] for none).');

  const ids = allArtifactIds(project);
  const out: Finding[] = [];
  for (const rf of arr) {
    if (!rf || typeof rf !== "object") throw new Error("Each finding must be an object.");
    const f = rf as { severity?: unknown; category?: unknown; title?: unknown; detail?: unknown; refs?: unknown };

    const title = typeof f.title === "string" ? f.title.trim() : "";
    if (!title) throw new Error('Each finding needs a non-empty "title".');

    const severity: Severity = f.severity === "high" || f.severity === "low" ? f.severity : "medium";
    const category = typeof f.category === "string" && f.category.trim() ? f.category.trim() : "general";
    const detail = typeof f.detail === "string" ? f.detail.trim() : "";
    const refs = Array.isArray(f.refs)
      ? f.refs.filter((x): x is string => typeof x === "string" && ids.has(x))
      : [];

    out.push({ severity, category, title, detail, refs });
  }
  return out;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Run a read-only critique of the whole project. Returns findings ordered by
 * severity (high first), or an error after the model's one self-correction
 * attempt is exhausted.
 */
export async function critiqueProject(client: LlmClient, project: Project): Promise<JsonResult<Finding[]>> {
  const { system, prompt } = buildCritiquePrompt(project);
  const req: CompletionRequest = { system, prompt, temperature: 0, maxTokens: 1600 };
  const r = await completeJson(client, req, (raw) => validateCritique(project, raw));
  if (!r.ok) return r;
  const sorted = [...r.value].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return { ok: true, value: sorted };
}
