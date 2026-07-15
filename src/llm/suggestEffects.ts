import { analyzeEffect } from "../model/expr";
import type { Project } from "../types";
import { describeComponentsForGuard, formatVarType } from "./context";
import { completeJson, type JsonResult } from "./json";
import type { CompletionRequest, LlmClient } from "./types";
import { augmentProject, parseNewVariables, type SuggestedVariable } from "./variables";

export type { SuggestedVariable };

export interface EffectSuggestion {
  /** The proposed effects, each already type-checked against the project + `newVariables`. */
  effects: string[];
  /** Variables to create so the effects type-check (empty when they use only existing state). */
  newVariables: SuggestedVariable[];
  /** One-line rationale, if the model gave one. */
  explanation?: string;
}

const SYSTEM = `You help author state *effects* for an activity in a behaviour model.

An effect is an assignment that updates a component's state variable when the activity runs. The grammar:
- Write an assignment as handle.name := <expression> (e.g. upstreamGate.state := open). The handle is given for each component.
- The right-hand side is an expression over variables: references handle.name, integer/boolean literals, bare enum members (e.g. open), operators == != < <= > >= && || ! + - * / and parentheses.
- The assigned value's type must match the variable: a bool variable takes a boolean, an int variable an int expression, an enum variable one of its members (e.g. upstreamGate.state := open) or another enum-typed variable.
- Counting up or down is an assignment to the same variable, e.g. chamber.vesselCount := chamber.vesselCount + 1.

An activity may make zero, one, or several state changes — list every one it makes. Return [] when the activity changes no state (it is simply a named step), rather than inventing an effect.

Prefer variables that already exist. Only propose a NEW variable when a change genuinely cannot target an existing one — most commonly a component's *mode*: an enum of the named states it moves between (e.g. open|closed, or idle|filling|full). Keep additions minimal and typed precisely: bool for yes/no state, enum for a fixed set of named states (list the members), int for counts or levels (add min/max when known). A new variable must be added to whichever component naturally owns that state; reference it by that component's handle.

Return a JSON object of exactly this shape:
{
  "effects": ["upstreamGate.state := open"],
  "newVariables": [
    { "component": "<handle>", "name": "<identifier>", "type": {"kind":"enum","values":["open","closed"]}, "description": "<short gloss>" }
  ],
  "explanation": "<one short sentence>"
}
Variable "type" is one of: {"kind":"bool"}, {"kind":"int","min":<n>,"max":<n>} (bounds optional),
or {"kind":"enum","values":["a","b",...]}. "newVariables" must be [] when the effects need no new state.
"effects" must be [] when the activity changes no state. "description" and "initial" are optional; "explanation" is optional.`;

/** Build the effect-suggestion prompt. Pure and exported so it can be unit-tested. */
export function buildEffectPrompt(
  project: Project,
  label: string,
  ownerTitle?: string,
  flowTitle?: string,
): { system: string; prompt: string } {
  const performer = ownerTitle ? ` performed by the "${ownerTitle}" component` : "";
  const inFlow = flowTitle ? `, in the "${flowTitle}" flow` : "";
  const prompt = `Components and their state variables:\n\n${describeComponentsForGuard(project)}\n\nThe activity "${label}"${performer}${inFlow} runs.\nList its effects — the state changes it makes when it runs (use [] if it changes no state):`;
  return { system: SYSTEM, prompt };
}

/**
 * Validate a raw effect-suggestion object against the project and return a
 * resolved `EffectSuggestion`. Throws (with a message the model can act on) when
 * the shape is wrong, a proposed variable is malformed, a handle doesn't resolve,
 * or any effect fails to type-check against the project augmented with the new
 * variables. Passed to `completeJson`, so every failure here drives its retry.
 */
export function validateEffectSuggestion(project: Project, raw: unknown): EffectSuggestion {
  if (!raw || typeof raw !== "object") throw new Error('Expected a JSON object with an "effects" field.');
  const obj = raw as { effects?: unknown; newVariables?: unknown; explanation?: unknown };

  if (!Array.isArray(obj.effects)) throw new Error('"effects" must be an array (use [] for none).');
  const effects: string[] = [];
  for (const e of obj.effects) {
    if (typeof e !== "string" || e.trim() === "") throw new Error("Each effect must be a non-empty string.");
    effects.push(e.trim());
  }

  const newVariables = parseNewVariables(project, obj.newVariables);

  // Type-check every effect against the project *including* the proposed variables.
  const augmented = augmentProject(project, newVariables);
  for (const eff of effects) {
    const result = analyzeEffect(augmented, eff);
    if (!result.ok) throw new Error(`Effect "${eff}": ${result.message}`);
  }

  const suggestion: EffectSuggestion = { effects, newVariables };
  if (typeof obj.explanation === "string" && obj.explanation.trim()) {
    suggestion.explanation = obj.explanation.trim();
  }
  return suggestion;
}

/**
 * Suggest state effects for an activity from its human-readable `label`.
 * Returns a type-checked `EffectSuggestion` (possibly proposing new variables,
 * possibly empty when the activity changes no state), or an error after the
 * model's one self-correction attempt is exhausted.
 */
export function suggestEffects(
  client: LlmClient,
  project: Project,
  label: string,
  ownerTitle?: string,
  flowTitle?: string,
): Promise<JsonResult<EffectSuggestion>> {
  const { system, prompt } = buildEffectPrompt(project, label, ownerTitle, flowTitle);
  const req: CompletionRequest = { system, prompt, temperature: 0, maxTokens: 700 };
  return completeJson(client, req, (raw) => validateEffectSuggestion(project, raw));
}

// Re-exported so callers building UI hints can reuse the same type formatting.
export { formatVarType };
