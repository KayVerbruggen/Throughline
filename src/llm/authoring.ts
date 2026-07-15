import { composeDecision } from "../model/decision";
import { composeEars } from "../model/ears";
import type {
  EarsPattern,
  Moscow,
  Project,
  StakeholderType,
} from "../types";
import { EARS_PATTERNS } from "../types";
import { completeJson, type JsonResult } from "./json";
import { describeProject } from "./projectContext";
import type { CompletionRequest, LlmClient } from "./types";

/**
 * A validated artifact draft produced from a natural-language request. A
 * discriminated union keyed by `kind`, each arm carrying exactly the structured
 * slots that kind needs — so the store can build a real artifact by overlaying
 * these onto a blank of the same kind. Trace/stakeholder references are already
 * resolved to real ids; `unresolved` records any the model named that didn't
 * match, for the UI to surface. `preview` is the composed human sentence.
 */
export type AuthoredDraft =
  | { kind: "stakeholder"; title: string; type: StakeholderType; body: string; preview: string; unresolved: string[]; explanation?: string }
  | { kind: "need"; title: string; moscow: Moscow; stakeholder: string; tags: string[]; body: string; preview: string; unresolved: string[]; explanation?: string }
  | { kind: "use-case"; title: string; moscow: Moscow; trace: string[]; actors: string[]; preview: string; unresolved: string[]; explanation?: string }
  | {
      kind: "requirement";
      moscow: Moscow;
      ears: EarsPattern;
      condition: string;
      subject: string;
      action: string;
      object: string;
      constraint: string;
      trace: string[];
      preview: string;
      unresolved: string[];
      explanation?: string;
    }
  | { kind: "test"; title: string; file: string; body: string; trace: string[]; preview: string; unresolved: string[]; explanation?: string }
  | {
      kind: "decision";
      title: string;
      context: string;
      concern: string;
      decision: string;
      alternatives: string;
      criterion: string;
      downside: string;
      trace: string[];
      preview: string;
      unresolved: string[];
      explanation?: string;
    }
  | { kind: "glossary"; title: string; aliases: string[]; definition: string; preview: string; unresolved: string[]; explanation?: string };

export type AuthorableKind = AuthoredDraft["kind"];

export const AUTHORABLE_KINDS: AuthorableKind[] = [
  "stakeholder",
  "need",
  "use-case",
  "requirement",
  "test",
  "decision",
  "glossary",
];

/** Which spine kind a child traces up to (for resolving the model's `trace` refs). */
const TRACE_PARENT: Partial<Record<AuthorableKind, "need" | "use-case" | "requirement">> = {
  "use-case": "need",
  requirement: "use-case",
  decision: "use-case",
  test: "requirement",
};

const SYSTEM = `You turn a short natural-language request into ONE structured artifact for a systems-engineering model. Pick the single most appropriate kind and fill its fields; another artifact can be authored in a later request.

Kinds and their fields:
- "stakeholder": { title, type: "primary"|"secondary", body }
- "need": { title, moscow: "must"|"should"|"could"|"wont", stakeholder (a stakeholder's id or name, optional), tags (string[]), body }
- "use-case": { title, moscow, trace (ids or names of the needs it serves), actors (string[]) }
- "requirement": an EARS statement — { ears, condition, subject, action, object, constraint, moscow, trace (ids/names of the use cases it refines) }.
    ears is one of: "ubiquitous" (no condition), "event-driven" (WHEN <condition>), "state-driven" (WHILE <condition>), "unwanted-behavior" (IF <condition> THEN), "optional" (WHERE <condition>), "complex". The statement reads: [keyword <condition>,] the <subject> shall <action> <object> <constraint>. Put the trigger/state in "condition", the actor in "subject", the verb phrase in "action", and any timing/limit in "constraint".
- "test": { title, file (path, optional), body (what it checks), trace (ids/names of the requirements it verifies) }
- "decision": a Y-statement — { title, context, concern, decision, alternatives (optional), criterion, downside (optional), trace (ids/names of the use cases it addresses) }. Reads: In the <context>, facing <concern>, we decided <decision> and not <alternatives> to achieve <criterion>, accepting <downside>.
- "glossary": { title (the term), aliases (string[]), definition }

Reference existing artifacts by their id (preferred) or exact title. Only fill fields you can support from the request; leave others as "" or []. Do not invent trace links that aren't implied.

Return a JSON object of exactly this shape:
{ "kind": "<one of the kinds>", "fields": { ...the fields for that kind... }, "explanation": "<one short sentence on what you created>" }`;

/** Build the authoring prompt. Pure and exported for unit tests. */
export function buildAuthoringPrompt(project: Project, request: string): { system: string; prompt: string } {
  const prompt = `Existing artifacts you can reference:\n\n${describeProject(
    project,
  )}\n\n---\n\nRequest: "${request.trim()}"\n\nDraft the one artifact that best fulfils it.`;
  return { system: SYSTEM, prompt };
}

// --- field helpers ----------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

function moscow(v: unknown): Moscow {
  return v === "must" || v === "could" || v === "wont" ? v : "should";
}

/** Resolve one reference (an id or a title) to an existing artifact id of `parent`, or null. */
function resolveRef(project: Project, ref: string, parent: "need" | "use-case" | "requirement"): string | null {
  const list =
    parent === "need" ? project.needs : parent === "use-case" ? project.useCases : project.requirements;
  const byId = list.find((a) => a.id.toLowerCase() === ref.toLowerCase());
  if (byId) return byId.id;
  const byTitle = list.find((a) => a.title.trim().toLowerCase() === ref.trim().toLowerCase());
  return byTitle ? byTitle.id : null;
}

/** Split the model's `trace` refs into resolved ids (of the child's parent kind) and unresolved names. */
function resolveTrace(project: Project, kind: AuthorableKind, raw: unknown): { trace: string[]; unresolved: string[] } {
  const parent = TRACE_PARENT[kind];
  if (!parent) return { trace: [], unresolved: [] };
  const trace: string[] = [];
  const unresolved: string[] = [];
  for (const ref of strArray(raw)) {
    const id = resolveRef(project, ref, parent);
    if (id) {
      if (!trace.includes(id)) trace.push(id);
    } else {
      unresolved.push(ref);
    }
  }
  return { trace, unresolved };
}

/**
 * Validate a raw authoring reply into a typed `AuthoredDraft`. Throws (driving
 * `completeJson`'s retry) when the kind is unsupported or a required text slot is
 * empty; otherwise normalizes each field, resolves trace/stakeholder references
 * against the project, and composes the preview sentence.
 */
export function validateAuthoring(project: Project, raw: unknown): AuthoredDraft {
  if (!raw || typeof raw !== "object") throw new Error('Expected a JSON object with "kind" and "fields".');
  const obj = raw as { kind?: unknown; fields?: unknown; explanation?: unknown };
  const kind = obj.kind;
  if (typeof kind !== "string" || !AUTHORABLE_KINDS.includes(kind as AuthorableKind)) {
    throw new Error(`"kind" must be one of: ${AUTHORABLE_KINDS.join(", ")}.`);
  }
  const f = (obj.fields && typeof obj.fields === "object" ? obj.fields : {}) as Record<string, unknown>;
  const explanation = str(obj.explanation) || undefined;
  const requireTitle = (): string => {
    const t = str(f.title);
    if (!t) throw new Error(`A ${kind} needs a "title".`);
    return t;
  };

  switch (kind as AuthorableKind) {
    case "stakeholder": {
      const title = requireTitle();
      const type: StakeholderType = f.type === "secondary" ? "secondary" : "primary";
      return { kind: "stakeholder", title, type, body: str(f.body), preview: title, unresolved: [], explanation };
    }
    case "need": {
      const title = requireTitle();
      // Resolve an optional stakeholder reference by id or name.
      let stakeholder = "";
      const ref = str(f.stakeholder);
      if (ref) {
        const s =
          project.stakeholders.find((x) => x.id.toLowerCase() === ref.toLowerCase()) ??
          project.stakeholders.find((x) => x.title.trim().toLowerCase() === ref.toLowerCase());
        if (s) stakeholder = s.id;
      }
      const unresolved = ref && !stakeholder ? [ref] : [];
      return { kind: "need", title, moscow: moscow(f.moscow), stakeholder, tags: strArray(f.tags), body: str(f.body), preview: title, unresolved, explanation };
    }
    case "use-case": {
      const title = requireTitle();
      const { trace, unresolved } = resolveTrace(project, "use-case", f.trace);
      return { kind: "use-case", title, moscow: moscow(f.moscow), trace, actors: strArray(f.actors), preview: title, unresolved, explanation };
    }
    case "requirement": {
      const ears: EarsPattern = EARS_PATTERNS.includes(f.ears as EarsPattern) ? (f.ears as EarsPattern) : "ubiquitous";
      const subject = str(f.subject) || "system";
      const action = str(f.action);
      if (!action) throw new Error('A requirement needs an "action" (what the subject shall do).');
      const object = str(f.object);
      const constraint = str(f.constraint);
      const condition = str(f.condition);
      const { trace, unresolved } = resolveTrace(project, "requirement", f.trace);
      const preview = composeEars({ ears, condition, subject, action, object, constraint } as Parameters<typeof composeEars>[0]);
      return { kind: "requirement", moscow: moscow(f.moscow), ears, condition, subject, action, object, constraint, trace, preview, unresolved, explanation };
    }
    case "test": {
      const title = requireTitle();
      const { trace, unresolved } = resolveTrace(project, "test", f.trace);
      return { kind: "test", title, file: str(f.file), body: str(f.body), trace, preview: title, unresolved, explanation };
    }
    case "decision": {
      const title = requireTitle();
      const decision = str(f.decision);
      if (!decision) throw new Error('A decision needs a "decision" (the choice made).');
      const context = str(f.context);
      const concern = str(f.concern);
      const alternatives = str(f.alternatives);
      const criterion = str(f.criterion);
      const downside = str(f.downside);
      const { trace, unresolved } = resolveTrace(project, "decision", f.trace);
      const preview = composeDecision({ context, concern, decision, alternatives, criterion, downside });
      return { kind: "decision", title, context, concern, decision, alternatives, criterion, downside, trace, preview, unresolved, explanation };
    }
    case "glossary": {
      const title = requireTitle();
      const definition = str(f.definition);
      if (!definition) throw new Error('A glossary term needs a "definition".');
      return { kind: "glossary", title, aliases: strArray(f.aliases), definition, preview: title, unresolved: [], explanation };
    }
  }
}

/**
 * Draft one artifact from a natural-language request. Returns a validated,
 * ready-to-create `AuthoredDraft` (with references resolved and a preview), or an
 * error after the model's one self-correction attempt is exhausted.
 */
export function authorArtifact(
  client: LlmClient,
  project: Project,
  request: string,
): Promise<JsonResult<AuthoredDraft>> {
  const { system, prompt } = buildAuthoringPrompt(project, request);
  const req: CompletionRequest = { system, prompt, temperature: 0, maxTokens: 900 };
  return completeJson(client, req, (raw) => validateAuthoring(project, raw));
}
