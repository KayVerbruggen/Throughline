// ---------------------------------------------------------------------------
// Evaluator for the behaviour expression language (Stage 2).
//
// Runs a type-checked expression against a *valuation* — a snapshot of every
// component variable's current value — producing a concrete value, and applies
// an assignment (an activity effect) to produce the next valuation. This is the
// engine the flow interpreter walks a diagram with; it does no I/O and assumes
// the expression already type-checked (guards/effects are validated in the UI).
// ---------------------------------------------------------------------------

import type { Assignment, Expr } from "./ast";
import { resolveVariable } from "./resolve";
import { ExprError } from "./tokenize";
import type { Project } from "../../types";

/** A runtime value: a bool, an int, or an enum member (its bare name). */
export type Value = boolean | number | string;

/** Current value of every variable, keyed canonically by `componentId.name`
 *  (component *id*, not handle, so a rename can't split the state). */
export type Valuation = Map<string, Value>;

/** The canonical valuation key for a resolved component variable. */
export function valuationKey(componentId: string, varName: string): string {
  return `${componentId}.${varName}`;
}

/**
 * Evaluate an expression against a valuation. Throws ExprError on an unbound
 * reference or a malformed operation — the interpreter seeds every declared
 * variable first, so a well-formed model never hits those.
 */
export function evaluate(project: Project, expr: Expr, val: Valuation): Value {
  switch (expr.t) {
    case "num":
      return expr.value;
    case "bool":
      return expr.value;
    case "member":
      // A bare enum member evaluates to its own name; comparisons against an
      // enum-typed reference are plain string equality.
      return expr.name;
    case "ref": {
      const resolved = resolveVariable(project, expr.head, expr.name);
      if (!resolved) throw new ExprError(`Unknown variable "${expr.head}.${expr.name}"`, 0);
      const key = valuationKey(resolved.component.id, resolved.variable.name);
      const v = val.get(key);
      if (v === undefined) throw new ExprError(`"${expr.head}.${expr.name}" has no value`, 0);
      return v;
    }
    case "unary": {
      const inner = evaluate(project, expr.operand, val);
      if (expr.op === "!") return !(inner as boolean);
      return -(inner as number);
    }
    case "binary":
      return evalBinary(project, expr, val);
  }
}

function evalBinary(project: Project, expr: Extract<Expr, { t: "binary" }>, val: Valuation): Value {
  const op = expr.op;

  // Logical operators short-circuit.
  if (op === "&&") return (evaluate(project, expr.left, val) as boolean) && (evaluate(project, expr.right, val) as boolean);
  if (op === "||") return (evaluate(project, expr.left, val) as boolean) || (evaluate(project, expr.right, val) as boolean);

  const l = evaluate(project, expr.left, val);
  const r = evaluate(project, expr.right, val);

  switch (op) {
    // Equality works for bool/int (===) and enum/member (string ===) alike.
    case "==":
      return l === r;
    case "!=":
      return l !== r;
    case "<":
      return (l as number) < (r as number);
    case "<=":
      return (l as number) <= (r as number);
    case ">":
      return (l as number) > (r as number);
    case ">=":
      return (l as number) >= (r as number);
    case "+":
      return (l as number) + (r as number);
    case "-":
      return (l as number) - (r as number);
    case "*":
      return (l as number) * (r as number);
    case "/":
      // Integer division, truncated toward zero; division by zero yields 0
      // rather than NaN so a stepping run never produces a poisoned value.
      return (r as number) === 0 ? 0 : Math.trunc((l as number) / (r as number));
  }
}

/**
 * Apply an assignment (an activity effect) to a valuation, returning a new
 * valuation with the target variable updated. Immutable so callers can keep a
 * history of steps.
 */
export function applyAssignment(project: Project, assign: Assignment, val: Valuation): Valuation {
  const resolved = resolveVariable(project, assign.target.head, assign.target.name);
  if (!resolved) {
    throw new ExprError(`Unknown variable "${assign.target.head}.${assign.target.name}"`, 0);
  }
  const value = evaluate(project, assign.value, val);
  const next = new Map(val);
  next.set(valuationKey(resolved.component.id, resolved.variable.name), value);
  return next;
}
