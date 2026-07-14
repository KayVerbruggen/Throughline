// ---------------------------------------------------------------------------
// Resolving expression references to model variables.
//
// A reference `head.name` names a component variable. `head` is the component's
// derived *handle* — a camelCase form of its title, so "Chamber" is `chamber`
// and "EVSE Controller" is `evseController`. The handle is shown in the
// component editor so authors know what to type. (An identifier-safe component
// id is also accepted as a fallback, but the usual `C-001` form contains a
// hyphen — read as the minus operator — so handles are the practical surface.)
// ---------------------------------------------------------------------------

import type { Component, Flow, Project, Variable } from "../../types";

/** camelCase handle derived from a component title, used in expressions. */
export function componentHandle(title: string): string {
  const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite every `oldHandle.<name>` reference in a single guard/effect string to
 * use `newHandle`, leaving the rest untouched. The head is matched only when it
 * is a whole identifier immediately followed by `.`, so a variable name or an
 * unrelated substring is never rewritten.
 */
export function rewriteHandleRef(text: string, oldHandle: string, newHandle: string): string {
  if (!oldHandle || !newHandle || oldHandle === newHandle) return text;
  const re = new RegExp(`(?<![A-Za-z0-9_.])${escapeRegExp(oldHandle)}(?=\\.)`, "g");
  return text.replace(re, newHandle);
}

/**
 * A component's title-handle is what every guard, precondition and effect that
 * references its state is written in terms of. Renaming the component changes
 * the handle and would silently orphan all of them (the accepted downside of the
 * handle-not-id choice). This rewrites those references across the whole project,
 * returning the updated project plus exactly the components and flows whose text
 * changed, so the caller can persist just those files.
 */
export function renameComponentHandle(
  project: Project,
  oldHandle: string,
  newHandle: string,
): { project: Project; touched: (Component | Flow)[] } {
  const touched: (Component | Flow)[] = [];
  if (!oldHandle || !newHandle || oldHandle === newHandle) return { project, touched };

  const components = project.components.map((c) => {
    let changed = false;
    const activities = c.activities.map((a) => {
      const pre = a.pre != null ? rewriteHandleRef(a.pre, oldHandle, newHandle) : a.pre;
      const effects =
        a.effects != null ? a.effects.map((e) => rewriteHandleRef(e, oldHandle, newHandle)) : a.effects;
      const preChanged = pre !== a.pre;
      const effChanged = !!a.effects && effects!.some((e, i) => e !== a.effects![i]);
      if (!preChanged && !effChanged) return a;
      changed = true;
      return { ...a, pre, effects };
    });
    if (!changed) return c;
    const nc = { ...c, activities };
    touched.push(nc);
    return nc;
  });

  const flows = project.flows.map((f) => {
    let changed = false;
    const alternates = f.alternates.map((alt) => {
      if (!alt.guard) return alt;
      const guard = rewriteHandleRef(alt.guard, oldHandle, newHandle);
      if (guard === alt.guard) return alt;
      changed = true;
      return { ...alt, guard };
    });
    if (!changed) return f;
    const nf = { ...f, alternates };
    touched.push(nf);
    return nf;
  });

  return { project: { ...project, components, flows }, touched };
}

/** The component a reference head names (by id or handle), case-insensitively. */
export function resolveComponent(project: Project, head: string): Component | null {
  const h = head.toLowerCase();
  return (
    project.components.find(
      (c) => c.id.toLowerCase() === h || componentHandle(c.title).toLowerCase() === h,
    ) ?? null
  );
}

export interface ResolvedRef {
  component: Component;
  variable: Variable;
}

/** Resolve `head.name` to its component + variable, or null if either is unknown. */
export function resolveVariable(project: Project, head: string, name: string): ResolvedRef | null {
  const component = resolveComponent(project, head);
  if (!component) return null;
  const variable = component.variables.find((v) => v.name === name);
  return variable ? { component, variable } : null;
}

/** Every valid `handle.name` reference in the project, for hints / autocomplete. */
export function variableRefs(project: Project): { ref: string; typeLabel: string }[] {
  const out: { ref: string; typeLabel: string }[] = [];
  for (const c of project.components) {
    const handle = componentHandle(c.title) || c.id;
    for (const v of c.variables) {
      const typeLabel =
        v.type.kind === "enum" ? `enum(${v.type.values.join(" | ")})` : v.type.kind;
      out.push({ ref: `${handle}.${v.name}`, typeLabel });
    }
  }
  return out;
}

export interface GuardCandidate {
  /** The text inserted when this candidate is chosen. */
  text: string;
  kind: "ref" | "bool" | "enum";
  /** Secondary hint shown alongside (a type, or the owning variable). */
  detail: string;
}

/**
 * Everything a guard author might type: component-variable references, the
 * boolean literals, and every enum member value. Ordered refs-first since those
 * are what you usually start an expression with.
 */
export function guardCandidates(project: Project): GuardCandidate[] {
  const refs: GuardCandidate[] = [];
  const members: GuardCandidate[] = [];
  for (const c of project.components) {
    const handle = componentHandle(c.title) || c.id;
    for (const v of c.variables) {
      const typeLabel =
        v.type.kind === "enum" ? `enum(${v.type.values.join(" | ")})` : v.type.kind;
      refs.push({ text: `${handle}.${v.name}`, kind: "ref", detail: typeLabel });
      if (v.type.kind === "enum") {
        for (const val of v.type.values) {
          members.push({ text: val, kind: "enum", detail: `${handle}.${v.name}` });
        }
      }
    }
  }
  return [
    ...refs,
    { text: "true", kind: "bool", detail: "bool" },
    { text: "false", kind: "bool", detail: "bool" },
    ...members,
  ];
}
