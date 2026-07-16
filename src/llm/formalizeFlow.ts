import { activityLabel, componentOfActivity, findActivity } from "../model/behavior";
import { analyzeEffect, analyzeGuard, componentHandle } from "../model/expr";
import { nextVariableId } from "../model/ids";
import { stepKind } from "../model/subflow";
import type { Activity, Artifact, Component, Flow, Project, Variable } from "../types";
import { describeComponentsForGuard, formatVarType } from "./context";
import { completeJson, type JsonResult } from "./json";
import type { CompletionRequest, LlmClient } from "./types";
import { augmentProject, parseNewVariables, type SuggestedVariable } from "./variables";

export type { SuggestedVariable };
export { formatVarType };

/** A guard the plan proposes for one alternate branch (already type-checked). */
export interface FormalizedGuard {
  altId: string;
  /** The branch's prose condition, resolved for display. */
  condition: string;
  guard: string;
}

/** Effects the plan proposes for one activity (already type-checked, non-empty). */
export interface FormalizedEffects {
  activityId: string;
  /** The activity's label, resolved for display. */
  label: string;
  effects: string[];
}

/**
 * A whole-flow formalization: one coherent set of new variables plus a guard for
 * every unformalized branch and effects for every unformalized activity. Every
 * expression is type-checked against the project augmented with `newVariables`
 * before the plan is offered, and `newVariables` is pruned to only those some
 * guard or effect actually references.
 */
export interface FormalizationPlan {
  newVariables: SuggestedVariable[];
  guards: FormalizedGuard[];
  effects: FormalizedEffects[];
  explanation?: string;
}

/** Branches and activities in a flow that don't yet carry a guard / effects. */
export interface FormalizationTargets {
  guards: { altId: string; condition: string }[];
  effects: { activityId: string; label: string; ownerTitle: string }[];
}

/** Unique activity ids in flow order (main path, then each alternate's steps). */
function flowActivityIds(flow: Flow): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...flow.main, ...flow.alternates.flatMap((a) => a.steps)]) {
    // Skip empty slots and subflow invokes — only real activities are formalized
    // (a call's behaviour lives in the callee's own flow).
    if (stepKind(id) !== "activity" || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * What a "Formalize flow" pass would fill: branches with a condition but no
 * guard, and named activities with no effects. Skips items already formal (a
 * guard is never clobbered; an activity carrying effects — possibly from another
 * flow, since activities are shared — is left alone) and items with nothing to
 * work from (a blank condition, an unnamed activity). Used both to gate the UI
 * and to tell the model which items to fill.
 */
export function pendingFormalization(project: Project, flow: Flow): FormalizationTargets {
  const guards = flow.alternates
    .filter((a) => !a.guard && a.condition.trim())
    .map((a) => ({ altId: a.id, condition: a.condition.trim() }));

  const effects: FormalizationTargets["effects"] = [];
  for (const id of flowActivityIds(flow)) {
    const act = findActivity(project, id);
    if (!act || !act.label.trim()) continue;
    if (act.effects && act.effects.length) continue;
    const owner = componentOfActivity(project, id);
    effects.push({ activityId: id, label: act.label.trim(), ownerTitle: owner?.title ?? "" });
  }
  return { guards, effects };
}

const SYSTEM = `You formalize a whole behaviour flow at once: you write boolean *guards* for its alternate branches and state *effects* for its activities, over one coherent set of component state variables.

A guard is a boolean expression that holds exactly when a branch is taken. An effect is an assignment head.name := <expression> applied when an activity runs. Both draw on the same grammar:
- Reference a variable as handle.name (e.g. chamber.vesselCount). The handle is given for each component.
- Literals: integers, true/false, and bare enum members (e.g. open).
- Operators: comparisons == != < <= > >=, logic && || !, arithmetic + - * /, and parentheses.
- A guard must evaluate to a boolean. An effect assigns a value whose type matches the variable (a bool var takes a boolean, an int var an int, an enum var one of its members). Counting is an assignment to the same variable, e.g. chamber.vesselCount := chamber.vesselCount + 1.

Design ONE consistent vocabulary for the whole flow. Prefer variables that already exist. When you need new state, most naturally a component's *mode* (an enum of its named states, e.g. idle|filling|full, or open|closed), declare it ONCE in "newVariables" and reference it from every guard and effect that needs it — do not invent a second variable for the same state. Keep additions minimal and typed precisely. An activity that changes no state gets an empty effects list; a branch always needs a guard.

Return a JSON object of exactly this shape:
{
  "newVariables": [
    { "component": "<handle>", "name": "<identifier>", "type": {"kind":"enum","values":["open","closed"]}, "description": "<short gloss>" }
  ],
  "guards": [ { "altId": "<branch id>", "guard": "<expression>" } ],
  "effects": [ { "activityId": "<activity id>", "effects": ["<assignment>", "..."] } ],
  "explanation": "<one or two short sentences on the state model you chose>"
}
Variable "type" is one of: {"kind":"bool"}, {"kind":"int","min":<n>,"max":<n>} (bounds optional), or {"kind":"enum","values":["a","b",...]}. Use the exact ids given in brackets. Only include the branches and activities you were asked to fill; omit anything that already has a guard or effects. "newVariables" is [] when no new state is needed.`;

/** Describe the flow's activities and branches (with ids and current formal state) for the prompt. */
function describeFlow(project: Project, flow: Flow): string {
  const lines: string[] = [`Flow "${flow.title}" (${flow.id}).`, "", "Activities, in order — [id] \"label\" — owning component:"];
  for (const id of flowActivityIds(flow)) {
    const act = findActivity(project, id);
    if (!act) continue;
    const owner = componentOfActivity(project, id);
    let line = `- [${id}] "${act.label.trim() || "(unnamed)"}" — ${owner?.title ?? "no component"}`;
    if (act.effects?.length) line += `  (already has effects: ${act.effects.join("; ")})`;
    lines.push(line);
  }
  lines.push("", "Alternate branches — [id] \"condition\":");
  if (flow.alternates.length === 0) lines.push("- (none)");
  for (const a of flow.alternates) {
    let line = `- [${a.id}] "${a.condition.trim() || "(no condition)"}"`;
    if (a.guard) line += `  (already has guard: ${a.guard})`;
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Build the whole-flow formalization prompt. Pure and exported for unit tests.
 * Lists every activity and branch for context, then asks the model to fill just
 * the `targets` — the ones lacking a guard / effects.
 */
export function buildFormalizePrompt(
  project: Project,
  flow: Flow,
  targets: FormalizationTargets,
): { system: string; prompt: string } {
  const effectList = targets.effects.length
    ? targets.effects.map((e) => `- [${e.activityId}] "${e.label}"`).join("\n")
    : "- (none — every activity already has effects or is unnamed)";
  const guardList = targets.guards.length
    ? targets.guards.map((g) => `- [${g.altId}] "${g.condition}"`).join("\n")
    : "- (none — every branch already has a guard)";

  const prompt = `Components and their state variables:\n\n${describeComponentsForGuard(
    project,
  )}\n\n${describeFlow(project, flow)}\n\nFormalize this flow with one coherent state model.\n\nGive the effects (state changes) for each of these activities — use an empty list if it changes no state:\n${effectList}\n\nGive the guard for each of these branches — the condition that holds exactly when it is taken:\n${guardList}`;
  return { system: SYSTEM, prompt };
}

/**
 * Validate a raw whole-flow formalization against the project and flow. Throws a
 * specific, item-located message (which drives `completeJson`'s retry) when the
 * shape is wrong, an id is unknown, a variable is malformed, or any guard/effect
 * fails to type-check against the project augmented with the proposed variables.
 * Entries for items that are already formal are dropped rather than clobbered,
 * and `newVariables` is pruned to those actually referenced by a kept expression.
 */
export function validateFormalization(project: Project, flow: Flow, raw: unknown): FormalizationPlan {
  if (!raw || typeof raw !== "object") throw new Error("Expected a JSON object with guards/effects.");
  const obj = raw as { newVariables?: unknown; guards?: unknown; effects?: unknown; explanation?: unknown };

  const newVariables = parseNewVariables(project, obj.newVariables);
  const augmented = augmentProject(project, newVariables);

  // --- guards ---
  const rawGuards = obj.guards ?? [];
  if (!Array.isArray(rawGuards)) throw new Error('"guards" must be an array (use [] for none).');
  const guards: FormalizedGuard[] = [];
  for (const rg of rawGuards) {
    if (!rg || typeof rg !== "object") throw new Error("Each guard entry must be an object.");
    const g = rg as { altId?: unknown; guard?: unknown };
    if (typeof g.altId !== "string") throw new Error('Each guard entry needs an "altId".');
    const alt = flow.alternates.find((a) => a.id === g.altId);
    if (!alt) throw new Error(`Unknown branch id "${g.altId}".`);
    if (alt.guard) continue; // already formal — don't clobber
    if (typeof g.guard !== "string" || !g.guard.trim()) {
      throw new Error(`Branch "${g.altId}": "guard" must be a non-empty string.`);
    }
    const guard = g.guard.trim();
    const res = analyzeGuard(augmented, guard);
    if (!res.ok) throw new Error(`Branch "${g.altId}" guard "${guard}": ${res.message}`);
    guards.push({ altId: g.altId, condition: alt.condition, guard });
  }

  // --- effects ---
  const rawEffects = obj.effects ?? [];
  if (!Array.isArray(rawEffects)) throw new Error('"effects" must be an array (use [] for none).');
  const flowActIds = new Set(flowActivityIds(flow));
  const effects: FormalizedEffects[] = [];
  for (const re of rawEffects) {
    if (!re || typeof re !== "object") throw new Error("Each effect entry must be an object.");
    const e = re as { activityId?: unknown; effects?: unknown };
    if (typeof e.activityId !== "string") throw new Error('Each effect entry needs an "activityId".');
    if (!flowActIds.has(e.activityId)) throw new Error(`Unknown activity id "${e.activityId}" for this flow.`);
    const act = findActivity(project, e.activityId);
    if (act?.effects?.length) continue; // already formal
    if (!Array.isArray(e.effects)) throw new Error(`Activity "${e.activityId}": "effects" must be an array.`);
    const list: string[] = [];
    for (const raw2 of e.effects) {
      if (typeof raw2 !== "string" || !raw2.trim()) {
        throw new Error(`Activity "${e.activityId}": each effect must be a non-empty string.`);
      }
      const eff = raw2.trim();
      const res = analyzeEffect(augmented, eff);
      if (!res.ok) throw new Error(`Activity "${e.activityId}" effect "${eff}": ${res.message}`);
      list.push(eff);
    }
    if (list.length === 0) continue; // the model found no state change — nothing to apply
    effects.push({ activityId: e.activityId, label: activityLabel(project, e.activityId), effects: list });
  }

  const plan: FormalizationPlan = {
    newVariables: pruneUnusedVariables(project, newVariables, guards, effects),
    guards,
    effects,
  };
  if (typeof obj.explanation === "string" && obj.explanation.trim()) plan.explanation = obj.explanation.trim();
  return plan;
}

/**
 * Drop proposed variables no kept guard or effect references. Sound because any
 * expression that uses a variable must contain its `handle.name` token verbatim,
 * so an absent token means the variable is genuinely unreferenced — this only
 * ever prunes orphans the model over-proposed, never one that is actually used.
 */
function pruneUnusedVariables(
  project: Project,
  vars: SuggestedVariable[],
  guards: FormalizedGuard[],
  effects: FormalizedEffects[],
): SuggestedVariable[] {
  if (vars.length === 0) return vars;
  const exprs = [...guards.map((g) => g.guard), ...effects.flatMap((e) => e.effects)];
  return vars.filter((nv) => {
    const comp = project.components.find((c) => c.id === nv.componentId);
    const handle = comp ? componentHandle(comp.title) || comp.id : nv.componentId;
    const token = `${handle}.${nv.name}`;
    return exprs.some((x) => x.includes(token));
  });
}

/**
 * Formalize an entire flow in one call: guards for its unformalized branches and
 * effects for its unformalized activities, over one coherent state vocabulary.
 * Returns a fully type-checked `FormalizationPlan`, or an error after the model's
 * one self-correction attempt is exhausted.
 */
export function formalizeFlow(
  client: LlmClient,
  project: Project,
  flow: Flow,
): Promise<JsonResult<FormalizationPlan>> {
  const targets = pendingFormalization(project, flow);
  const { system, prompt } = buildFormalizePrompt(project, flow, targets);
  const req: CompletionRequest = { system, prompt, temperature: 0, maxTokens: 2000 };
  return completeJson(client, req, (raw) => validateFormalization(project, flow, raw));
}

// --- applying a plan --------------------------------------------------------

function replaceComponent(project: Project, updated: Component): Project {
  return { ...project, components: project.components.map((c) => (c.id === updated.id ? updated : c)) };
}

function replaceFlow(project: Project, updated: Flow): Project {
  return { ...project, flows: project.flows.map((f) => (f.id === updated.id ? updated : f)) };
}

function withEffects(activity: Activity, effects: string[]): Activity {
  const next: Activity = { ...activity };
  const cleaned = effects.map((e) => e.trim()).filter(Boolean);
  if (cleaned.length) next.effects = cleaned;
  else delete next.effects;
  return next;
}

/**
 * Apply a validated `FormalizationPlan` to the project, atomically: mint real ids
 * for the new variables and add them to their components, set the branch guards
 * on the flow, and set the effects on each activity's owning component. Threads a
 * single evolving project so a component touched by both a new variable and an
 * effect keeps both. Returns the new project and the artifacts that changed (the
 * flow plus every touched component), for the caller to persist. Pure.
 */
export function applyFormalization(
  project: Project,
  flowId: string,
  plan: FormalizationPlan,
): { project: Project; touched: Artifact[] } {
  let next = project;
  const touched = new Map<string, Artifact>();

  // 1. New variables — mint against the evolving project so ids stay unique.
  for (const nv of plan.newVariables) {
    const comp = next.components.find((c) => c.id === nv.componentId);
    if (!comp || comp.variables.some((v) => v.name === nv.name)) continue;
    const variable: Variable = { id: nextVariableId(next), name: nv.name, type: nv.type };
    if (nv.description) variable.description = nv.description;
    if (nv.initial) variable.initial = nv.initial;
    const updated: Component = { ...comp, variables: [...comp.variables, variable] };
    next = replaceComponent(next, updated);
    touched.set(updated.id, updated);
  }

  // 2. Branch guards on the flow.
  const flow = next.flows.find((f) => f.id === flowId);
  if (flow && plan.guards.length) {
    const byId = new Map(plan.guards.map((g) => [g.altId, g.guard]));
    const updated: Flow = {
      ...flow,
      alternates: flow.alternates.map((a) => (byId.has(a.id) ? { ...a, guard: byId.get(a.id) } : a)),
    };
    next = replaceFlow(next, updated);
    touched.set(updated.id, updated);
  }

  // 3. Effects on each activity's owning component (reading `next`, so new
  //    variables added in step 1 are preserved).
  for (const e of plan.effects) {
    const owner = next.components.find((c) => c.activities.some((a) => a.id === e.activityId));
    if (!owner) continue;
    const updated: Component = {
      ...owner,
      activities: owner.activities.map((a) => (a.id === e.activityId ? withEffects(a, e.effects) : a)),
    };
    next = replaceComponent(next, updated);
    touched.set(updated.id, updated);
  }

  return { project: next, touched: [...touched.values()] };
}
