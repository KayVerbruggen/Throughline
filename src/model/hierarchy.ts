// ---------------------------------------------------------------------------
// Component hierarchy (composition tree).
//
// A component names its parent in `Component.parent` ("" = top-level). This is
// the one authored structural relationship — see the note on `Component.parent`
// in types.ts. Everything here reads that field defensively: unknown, self, or
// cyclic parents collapse to top-level so the result is always a proper forest,
// no matter what a hand-edited file contains.
// ---------------------------------------------------------------------------

import type { Component, Project } from "../types";

/**
 * The effective parent id of every component, with unknown / self / cyclic
 * parents resolved to "" (top-level). Used everywhere instead of the raw
 * `parent` field so a bad file can never produce an infinite loop.
 */
export function effectiveParents(components: Component[]): Map<string, string> {
  const byId = new Map(components.map((c) => [c.id, c]));
  const out = new Map<string, string>();
  for (const c of components) {
    const p = c.parent;
    if (!p || p === c.id || !byId.has(p)) {
      out.set(c.id, "");
      continue;
    }
    // Walk up from the parent; if we loop back to c the chain is cyclic.
    const seen = new Set<string>([c.id]);
    let cur: string | undefined = p;
    let cyclic = false;
    while (cur) {
      if (seen.has(cur)) {
        cyclic = true;
        break;
      }
      seen.add(cur);
      cur = byId.get(cur)?.parent || undefined;
      if (cur && !byId.has(cur)) cur = undefined;
    }
    out.set(c.id, cyclic ? "" : p);
  }
  return out;
}

export interface ComponentForest {
  /** Top-level component ids, in stable (id) order. */
  roots: string[];
  /** Child ids for every component id, in stable (id) order. */
  children: Map<string, string[]>;
  /** Resolved parent id per component ("" = root). */
  parent: Map<string, string>;
}

/** Build the component forest (roots + children), stable and cycle-safe. */
export function componentForest(project: Project): ComponentForest {
  const components = [...project.components].sort((a, b) => a.id.localeCompare(b.id));
  const parent = effectiveParents(components);
  const children = new Map<string, string[]>();
  for (const c of components) children.set(c.id, []);
  const roots: string[] = [];
  for (const c of components) {
    const p = parent.get(c.id) ?? "";
    if (p && children.has(p)) children.get(p)!.push(c.id);
    else roots.push(c.id);
  }
  return { roots, children, parent };
}

/**
 * The chain of component ids from the top-level ancestor down to `id`
 * inclusive, e.g. `["C-002", "C-005"]`. Empty when `id` is "" or unknown. Used
 * to render the drill-down breadcrumb (Root › … › focus).
 */
export function ancestorChain(project: Project, id: string): string[] {
  if (!id || !project.components.some((c) => c.id === id)) return [];
  const parent = effectiveParents(project.components);
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur = id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift(cur);
    cur = parent.get(cur) || "";
  }
  return chain;
}

/**
 * All descendants of `id` (excluding `id` itself). Used by the parent picker to
 * forbid choosing a component's own descendant, which would create a cycle.
 */
export function descendantIds(project: Project, id: string): Set<string> {
  const { children } = componentForest(project);
  const out = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return out;
}
