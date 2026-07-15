import { analyzeGuard, resolveComponent } from "../model/expr";
import type { Project, VarType } from "../types";
import { describeComponentsForGuard, formatVarType } from "./context";
import { completeJson, type JsonResult } from "./json";
import type { CompletionRequest, LlmClient } from "./types";

/**
 * A new component variable the suggested guard needs but the model doesn't have
 * yet. `componentId` is already resolved from the model's handle. No `id` — the
 * apply step mints a real `VAR-…` id; validation only needs the name and type.
 */
export interface SuggestedVariable {
  componentId: string;
  name: string;
  type: VarType;
  description?: string;
  initial?: string;
}

export interface GuardSuggestion {
  /** The proposed guard, already type-checked against the project + `newVariables`. */
  guard: string;
  /** Variables to create so the guard type-checks (empty when it uses only existing state). */
  newVariables: SuggestedVariable[];
  /** One-line rationale, if the model gave one. */
  explanation?: string;
}

const SYSTEM = `You help author boolean *guards* for alternate branches in a behaviour model.

A guard is a boolean expression over components' state variables. The grammar:
- Reference a variable as handle.name (e.g. chamber.vesselCount). The handle is given for each component.
- Literals: integers (0, 12), booleans (true, false), and enum members written bare (e.g. open).
- Operators: comparisons == != < <= > >=, logic && || !, arithmetic + - * /, and parentheses.
- Compare an enum variable to a member by name, e.g. upstreamGate.state == open.
- The whole expression must evaluate to a boolean.

Prefer the variables that already exist. Only propose a NEW variable when the condition genuinely cannot be
expressed with the listed ones. Keep additions minimal and typed precisely: bool for yes/no state, enum for a
fixed set of named states (list the members), int for counts or levels (add min/max when known). A new variable
must be added to whichever component naturally owns that state; reference it by that component's handle.

Return a JSON object of exactly this shape:
{
  "guard": "<expression>",
  "newVariables": [
    { "component": "<handle>", "name": "<identifier>", "type": {"kind":"bool"}, "description": "<short gloss>" }
  ],
  "explanation": "<one short sentence>"
}
Variable "type" is one of: {"kind":"bool"}, {"kind":"int","min":<n>,"max":<n>} (bounds optional),
or {"kind":"enum","values":["a","b",...]}. "newVariables" must be [] when the guard needs no new state.
"description" and "initial" are optional; "explanation" is optional.`;

/** Build the guard-suggestion prompt. Pure and exported so it can be unit-tested. */
export function buildGuardPrompt(
  project: Project,
  condition: string,
  ownerTitle?: string,
): { system: string; prompt: string } {
  const owner = ownerTitle ? `\nThe branch belongs to the "${ownerTitle}" step's flow.` : "";
  const prompt = `Components and their state variables:\n\n${describeComponentsForGuard(project)}\n\nWrite the guard that holds exactly when this branch is taken:\n\n"${condition}"${owner}`;
  return { system: SYSTEM, prompt };
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse and validate the model's variable `type`, throwing a usable message on any problem. */
function parseVarType(raw: unknown, where: string): VarType {
  if (!raw || typeof raw !== "object") throw new Error(`${where}: "type" is missing`);
  const t = raw as { kind?: unknown; min?: unknown; max?: unknown; values?: unknown };
  if (t.kind === "bool") return { kind: "bool" };
  if (t.kind === "int") {
    const out: VarType = { kind: "int" };
    if (typeof t.min === "number") out.min = t.min;
    if (typeof t.max === "number") out.max = t.max;
    return out;
  }
  if (t.kind === "enum") {
    if (!Array.isArray(t.values) || t.values.length === 0 || !t.values.every((v) => typeof v === "string")) {
      throw new Error(`${where}: enum "type" needs a non-empty list of string values`);
    }
    return { kind: "enum", values: t.values as string[] };
  }
  throw new Error(`${where}: "type.kind" must be "bool", "int", or "enum"`);
}

/**
 * Validate a raw guard-suggestion object against the project and return a
 * resolved `GuardSuggestion`. Throws (with a message the model can act on) when
 * the shape is wrong, a proposed variable is malformed, a handle doesn't resolve,
 * or the guard fails to type-check against the project augmented with the new
 * variables. Passed to `completeJson`, so every failure here drives its retry.
 */
export function validateGuardSuggestion(project: Project, raw: unknown): GuardSuggestion {
  if (!raw || typeof raw !== "object") throw new Error('Expected a JSON object with a "guard" field.');
  const obj = raw as { guard?: unknown; newVariables?: unknown; explanation?: unknown };

  if (typeof obj.guard !== "string" || obj.guard.trim() === "") {
    throw new Error('"guard" must be a non-empty string.');
  }
  const guard = obj.guard.trim();

  const rawVars = obj.newVariables ?? [];
  if (!Array.isArray(rawVars)) throw new Error('"newVariables" must be an array (use [] for none).');

  const newVariables: SuggestedVariable[] = [];
  for (const rv of rawVars) {
    if (!rv || typeof rv !== "object") throw new Error("Each new variable must be an object.");
    const v = rv as { component?: unknown; name?: unknown; type?: unknown; description?: unknown; initial?: unknown };

    if (typeof v.component !== "string") throw new Error('Each new variable needs a "component" handle.');
    const component = resolveComponent(project, v.component);
    if (!component) throw new Error(`Unknown component handle "${v.component}".`);

    if (typeof v.name !== "string" || !IDENT.test(v.name)) {
      throw new Error(`Invalid variable name ${JSON.stringify(v.name)} — use a plain identifier.`);
    }
    // If the component already has this variable, it isn't new — drop it and let
    // the guard type-check against the existing declaration.
    if (component.variables.some((existing) => existing.name === v.name)) continue;

    const type = parseVarType(v.type, `variable "${v.name}"`);
    const sv: SuggestedVariable = { componentId: component.id, name: v.name, type };
    if (typeof v.description === "string" && v.description.trim()) sv.description = v.description.trim();
    if (typeof v.initial === "string" && v.initial.trim()) sv.initial = v.initial.trim();
    newVariables.push(sv);
  }

  // Type-check the guard against the project *including* the proposed variables.
  const augmented = augmentProject(project, newVariables);
  const result = analyzeGuard(augmented, guard);
  if (!result.ok) throw new Error(result.message);

  const suggestion: GuardSuggestion = { guard, newVariables };
  if (typeof obj.explanation === "string" && obj.explanation.trim()) {
    suggestion.explanation = obj.explanation.trim();
  }
  return suggestion;
}

/** Clone the project with the proposed variables added (placeholder ids) for type-checking. */
function augmentProject(project: Project, vars: SuggestedVariable[]): Project {
  if (vars.length === 0) return project;
  const components = project.components.map((c) => {
    const mine = vars.filter((v) => v.componentId === c.id);
    if (mine.length === 0) return c;
    const added = mine.map((v, i) => ({ id: `VAR-NEW-${i}`, name: v.name, type: v.type }));
    return { ...c, variables: [...c.variables, ...added] };
  });
  return { ...project, components };
}

/**
 * Suggest a guard for an alternate branch from its human-readable `condition`.
 * Returns a type-checked `GuardSuggestion` (possibly proposing new variables),
 * or an error after the model's one self-correction attempt is exhausted.
 */
export function suggestGuard(
  client: LlmClient,
  project: Project,
  condition: string,
  ownerTitle?: string,
): Promise<JsonResult<GuardSuggestion>> {
  const { system, prompt } = buildGuardPrompt(project, condition, ownerTitle);
  const req: CompletionRequest = { system, prompt, temperature: 0, maxTokens: 600 };
  return completeJson(client, req, (raw) => validateGuardSuggestion(project, raw));
}

// Re-exported so callers building UI hints can reuse the same type formatting.
export { formatVarType };
