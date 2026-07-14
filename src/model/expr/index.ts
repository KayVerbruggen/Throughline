// ---------------------------------------------------------------------------
// Public API of the behaviour expression language.
//
// The core is pure (no I/O, no React) so it can be exercised in isolation. Its
// first consumer is branch-guard authoring in the Behavior view; later stages
// (activity effects, the flow simulator) build on the same parse + typecheck.
// ---------------------------------------------------------------------------

import type { Assignment, Expr } from "./ast";
import { parse, parseAssignment } from "./parse";
import { ExprError } from "./tokenize";
import { typecheckAssignment, typecheckGuard } from "./typecheck";
import type { Project } from "../../types";

export type { Assignment, Expr, BinOp } from "./ast";
export { ExprError } from "./tokenize";
export {
  evaluate,
  applyAssignment,
  valuationKey,
  type Value,
  type Valuation,
} from "./evaluate";
export {
  componentHandle,
  rewriteHandleRef,
  renameComponentHandle,
  resolveComponent,
  resolveVariable,
  variableRefs,
  guardCandidates,
  type GuardCandidate,
} from "./resolve";

export type GuardResult =
  | { ok: true; ast: Expr }
  | { ok: false; message: string };

/**
 * Parse and type-check a guard expression against the project's declared
 * variables. The single entry point the UI needs: on failure it returns a
 * ready-to-show message rather than throwing.
 */
export function analyzeGuard(project: Project, source: string): GuardResult {
  try {
    const ast = parse(source);
    typecheckGuard(project, ast);
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ExprError) return { ok: false, message: e.message };
    return { ok: false, message: e instanceof Error ? e.message : "Invalid expression" };
  }
}

export type EffectResult =
  | { ok: true; assign: Assignment }
  | { ok: false; message: string };

/**
 * Parse and type-check an activity effect (`head.name := value`) against the
 * project's declared variables. The companion to `analyzeGuard` for the effect
 * fields: on failure it returns a ready-to-show message rather than throwing.
 */
export function analyzeEffect(project: Project, source: string): EffectResult {
  try {
    const assign = parseAssignment(source);
    typecheckAssignment(project, assign);
    return { ok: true, assign };
  } catch (e) {
    if (e instanceof ExprError) return { ok: false, message: e.message };
    return { ok: false, message: e instanceof Error ? e.message : "Invalid effect" };
  }
}
