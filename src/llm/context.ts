import { componentHandle } from "../model/expr";
import type { Project, VarType } from "../types";

/** Human-readable type label used in prompts (matches the guard grammar's surface). */
export function formatVarType(t: VarType): string {
  if (t.kind === "bool") return "bool";
  if (t.kind === "enum") return `enum {${t.values.join(", ")}}`;
  // int, with optional bounds
  const bounds: string[] = [];
  if (t.min != null) bounds.push(`min ${t.min}`);
  if (t.max != null) bounds.push(`max ${t.max}`);
  return bounds.length ? `int (${bounds.join(", ")})` : "int";
}

/**
 * Describe every component and its state variables for a guard/effect prompt:
 * the handle to reference it by, each variable's name, type and gloss. This is
 * the shared context an expression-authoring suggestion needs — a guard may
 * reference any component's variables, so all are listed.
 */
export function describeComponentsForGuard(project: Project): string {
  if (project.components.length === 0) return "(the project has no components yet)";
  const lines: string[] = [];
  for (const c of project.components) {
    const handle = componentHandle(c.title) || c.id;
    lines.push(`- "${c.title}" (handle: ${handle})`);
    if (c.variables.length === 0) {
      lines.push("    (no state variables yet)");
      continue;
    }
    for (const v of c.variables) {
      const gloss = v.description ? `  — ${v.description}` : "";
      lines.push(`    ${v.name}: ${formatVarType(v.type)}${gloss}`);
    }
  }
  return lines.join("\n");
}
