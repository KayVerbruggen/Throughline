// ---------------------------------------------------------------------------
// Type-checker for the behaviour expression language.
//
// Resolves every reference against declared component variables and enforces a
// small set of rules, so a guard the model accepts is one it can later evaluate
// without surprises. Reports the first error with a human-readable message.
// ---------------------------------------------------------------------------

import type { Assignment, Expr } from "./ast";
import { ExprError } from "./tokenize";
import { resolveVariable } from "./resolve";
import type { Project, VarType } from "../../types";

// Internal type descriptors. `member` is a bare identifier (an enum member
// literal) whose owning enum isn't known until it meets a ref in a comparison.
type Ty =
  | { k: "bool" }
  | { k: "int" }
  | { k: "enum"; values: string[] }
  | { k: "member"; name: string };

function fromVarType(t: VarType): Ty {
  if (t.kind === "int") return { k: "int" };
  if (t.kind === "enum") return { k: "enum", values: t.values };
  return { k: "bool" };
}

function label(t: Ty): string {
  switch (t.k) {
    case "bool":
      return "bool";
    case "int":
      return "int";
    case "enum":
      return `enum(${t.values.join(" | ")})`;
    case "member":
      return `"${t.name}"`;
  }
}

/** True when `==`/`!=` may compare the two operand types. */
function comparable(a: Ty, b: Ty): boolean {
  if (a.k === "bool" && b.k === "bool") return true;
  if (a.k === "int" && b.k === "int") return true;
  if (a.k === "enum" && b.k === "enum") return sameEnum(a.values, b.values);
  if (a.k === "enum" && b.k === "member") return a.values.includes(b.name);
  if (a.k === "member" && b.k === "enum") return b.values.includes(a.name);
  // Two bare members can't be compared — neither side pins an enum.
  return false;
}

function sameEnum(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

class Checker {
  constructor(private readonly project: Project) {}

  check(e: Expr): Ty {
    switch (e.t) {
      case "num":
        return { k: "int" };
      case "bool":
        return { k: "bool" };
      case "member":
        return { k: "member", name: e.name };
      case "ref": {
        const resolved = resolveVariable(this.project, e.head, e.name);
        if (!resolved) {
          throw new ExprError(`Unknown variable "${e.head}.${e.name}"`, 0);
        }
        return fromVarType(resolved.variable.type);
      }
      case "unary":
        return this.checkUnary(e);
      case "binary":
        return this.checkBinary(e);
    }
  }

  private checkUnary(e: Extract<Expr, { t: "unary" }>): Ty {
    const inner = this.check(e.operand);
    if (e.op === "!") {
      if (inner.k !== "bool") throw new ExprError(`"!" needs a bool, got ${label(inner)}`, 0);
      return { k: "bool" };
    }
    // unary minus
    if (inner.k !== "int") throw new ExprError(`"-" needs an int, got ${label(inner)}`, 0);
    return { k: "int" };
  }

  private checkBinary(e: Extract<Expr, { t: "binary" }>): Ty {
    const op = e.op;

    if (op === "&&" || op === "||") {
      const l = this.check(e.left);
      const r = this.check(e.right);
      if (l.k !== "bool" || r.k !== "bool") {
        throw new ExprError(`"${op}" needs bool operands, got ${label(l)} and ${label(r)}`, 0);
      }
      return { k: "bool" };
    }

    if (op === "==" || op === "!=") {
      const l = this.check(e.left);
      const r = this.check(e.right);
      if (!comparable(l, r)) {
        throw new ExprError(`Cannot compare ${label(l)} with ${label(r)}`, 0);
      }
      return { k: "bool" };
    }

    if (op === "<" || op === "<=" || op === ">" || op === ">=") {
      const l = this.check(e.left);
      const r = this.check(e.right);
      if (l.k !== "int" || r.k !== "int") {
        throw new ExprError(`"${op}" needs int operands, got ${label(l)} and ${label(r)}`, 0);
      }
      return { k: "bool" };
    }

    // arithmetic: + - * /
    const l = this.check(e.left);
    const r = this.check(e.right);
    if (l.k !== "int" || r.k !== "int") {
      throw new ExprError(`"${op}" needs int operands, got ${label(l)} and ${label(r)}`, 0);
    }
    return { k: "int" };
  }
}

/**
 * Type-check an already-parsed guard. A guard must resolve to `bool`.
 * Returns the top-level type; throws ExprError on any violation.
 */
export function typecheckGuard(project: Project, ast: Expr): void {
  const ty = new Checker(project).check(ast);
  if (ty.k !== "bool") {
    throw new ExprError(`A guard must be a bool expression, but this is ${label(ty)}`, 0);
  }
}

/**
 * Type-check an activity effect (`head.name := value`): the target must be a
 * declared variable and the assigned value's type must match it. Assignability
 * is exactly comparability — an int takes an int, a bool a bool, an enum takes
 * the same enum or one of its bare members (`gate.state := open`).
 */
export function typecheckAssignment(project: Project, assign: Assignment): void {
  const resolved = resolveVariable(project, assign.target.head, assign.target.name);
  if (!resolved) {
    throw new ExprError(`Unknown variable "${assign.target.head}.${assign.target.name}"`, 0);
  }
  const targetTy = fromVarType(resolved.variable.type);
  const valueTy = new Checker(project).check(assign.value);
  if (!comparable(targetTy, valueTy)) {
    throw new ExprError(
      `Cannot assign ${label(valueTy)} to ${assign.target.head}.${assign.target.name} (${label(targetTy)})`,
      0,
    );
  }
}
