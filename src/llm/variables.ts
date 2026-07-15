import { resolveComponent } from "../model/expr";
import type { Project, VarType } from "../types";

/**
 * A new component variable a suggestion needs but the model doesn't have yet.
 * `componentId` is already resolved from the model's handle. No `id` — the apply
 * step mints a real `VAR-…` id; validation only needs the name and type. Shared
 * by every expression-authoring suggestion (guards, effects) that may propose
 * state the project doesn't declare yet.
 */
export interface SuggestedVariable {
  componentId: string;
  name: string;
  type: VarType;
  description?: string;
  initial?: string;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse and validate the model's variable `type`, throwing a usable message on any problem. */
export function parseVarType(raw: unknown, where: string): VarType {
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
 * Parse and validate the model's `newVariables` array against the project,
 * returning resolved `SuggestedVariable`s. Throws (with a message the model can
 * act on) when the shape is wrong, a handle doesn't resolve, or a name is
 * malformed — so every failure drives `completeJson`'s self-correction retry.
 * A proposal for a variable the component already declares is dropped (not new),
 * letting the expression type-check against the existing declaration instead.
 */
export function parseNewVariables(project: Project, raw: unknown): SuggestedVariable[] {
  const rawVars = raw ?? [];
  if (!Array.isArray(rawVars)) throw new Error('"newVariables" must be an array (use [] for none).');

  const out: SuggestedVariable[] = [];
  for (const rv of rawVars) {
    if (!rv || typeof rv !== "object") throw new Error("Each new variable must be an object.");
    const v = rv as { component?: unknown; name?: unknown; type?: unknown; description?: unknown; initial?: unknown };

    if (typeof v.component !== "string") throw new Error('Each new variable needs a "component" handle.');
    const component = resolveComponent(project, v.component);
    if (!component) throw new Error(`Unknown component handle "${v.component}".`);

    if (typeof v.name !== "string" || !IDENT.test(v.name)) {
      throw new Error(`Invalid variable name ${JSON.stringify(v.name)} — use a plain identifier.`);
    }
    // Already declared? Then it isn't new — drop it and let the expression
    // type-check against the existing declaration.
    if (component.variables.some((existing) => existing.name === v.name)) continue;

    const type = parseVarType(v.type, `variable "${v.name}"`);
    const sv: SuggestedVariable = { componentId: component.id, name: v.name, type };
    if (typeof v.description === "string" && v.description.trim()) sv.description = v.description.trim();
    if (typeof v.initial === "string" && v.initial.trim()) sv.initial = v.initial.trim();
    out.push(sv);
  }
  return out;
}

/** Clone the project with the proposed variables added (placeholder ids) for type-checking. */
export function augmentProject(project: Project, vars: SuggestedVariable[]): Project {
  if (vars.length === 0) return project;
  const components = project.components.map((c) => {
    const mine = vars.filter((v) => v.componentId === c.id);
    if (mine.length === 0) return c;
    const added = mine.map((v, i) => ({ id: `VAR-NEW-${i}`, name: v.name, type: v.type }));
    return { ...c, variables: [...c.variables, ...added] };
  });
  return { ...project, components };
}
