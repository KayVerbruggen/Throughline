// ---------------------------------------------------------------------------
// Expression AST for the behaviour language.
//
// The language is deliberately tiny: boolean/integer/enum expressions over
// component state variables (referenced as `handle.name`). It is the shared
// substrate for branch guards now, and — in a later stage — activity effects
// and the flow simulator. Everything downstream (typecheck, evaluate) walks
// these nodes; nothing here does I/O.
// ---------------------------------------------------------------------------

export type BinOp =
  | "||"
  | "&&"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/";

export type Expr =
  | { t: "num"; value: number }
  | { t: "bool"; value: boolean }
  /** A bare identifier with no `.` — only valid as an enum member literal. */
  | { t: "member"; name: string }
  /** A reference to a component variable: `head.name` (e.g. `chamber.vesselCount`). */
  | { t: "ref"; head: string; name: string }
  | { t: "unary"; op: "!" | "-"; operand: Expr }
  | { t: "binary"; op: BinOp; left: Expr; right: Expr };

/**
 * An activity effect: `head.name := value`. Assignment is a *statement*, not an
 * expression (it has no value and can't nest), so it lives outside `Expr`. The
 * left side must resolve to a declared component variable; the right side is an
 * expression whose type must match it (see `typecheckAssignment`).
 */
export interface Assignment {
  target: { head: string; name: string };
  value: Expr;
}
