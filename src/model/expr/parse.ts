// ---------------------------------------------------------------------------
// Precedence-climbing parser for the behaviour expression language.
//
// Grammar (loosest to tightest binding):
//   or      := and   ("||" and)*
//   and     := eq    ("&&" eq)*
//   eq      := rel    (("==" | "!=") rel)*
//   rel     := add    (("<" | "<=" | ">" | ">=") add)*
//   add     := mul    (("+" | "-") mul)*
//   mul     := unary  (("*" | "/") unary)*
//   unary   := ("!" | "-") unary | primary
//   primary := number | "true" | "false" | ident ("." ident)? | "(" or ")"
// ---------------------------------------------------------------------------

import type { Assignment, BinOp, Expr } from "./ast";
import { ExprError, tokenize, type Token } from "./tokenize";

// Binary operators grouped by precedence level, tightest last.
const LEVELS: BinOp[][] = [
  ["||"],
  ["&&"],
  ["==", "!="],
  ["<", "<=", ">", ">="],
  ["+", "-"],
  ["*", "/"],
];

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i];
  }
  private next(): Token {
    return this.tokens[this.i++];
  }

  parse(): Expr {
    const expr = this.parseLevel(0);
    this.expectEof();
    return expr;
  }

  /** `head.name := expr` — the form of an activity effect. */
  parseAssignment(): Assignment {
    const headTok = this.next();
    if (headTok.type !== "ident") {
      throw new ExprError("An effect must assign to a component variable, e.g. gate.state := open", headTok.pos);
    }
    if (this.peek().type !== "dot") {
      throw new ExprError(`Expected "." — assign to a component variable like gate.state`, this.peek().pos);
    }
    this.next(); // consume "."
    const nameTok = this.next();
    if (nameTok.type !== "ident") {
      throw new ExprError('Expected a variable name after "."', nameTok.pos);
    }
    const opTok = this.next();
    if (opTok.type !== "op" || opTok.text !== ":=") {
      throw new ExprError('Expected ":=" (assignment)', opTok.pos);
    }
    const value = this.parseLevel(0);
    this.expectEof();
    return { target: { head: headTok.text, name: nameTok.text }, value };
  }

  private expectEof(): void {
    const tok = this.peek();
    if (tok.type !== "eof") {
      throw new ExprError(`Unexpected "${tok.text || "end of input"}"`, tok.pos);
    }
  }

  private parseLevel(level: number): Expr {
    if (level >= LEVELS.length) return this.parseUnary();
    let left = this.parseLevel(level + 1);
    for (;;) {
      const tok = this.peek();
      if (tok.type === "op" && (LEVELS[level] as string[]).includes(tok.text)) {
        this.next();
        const right = this.parseLevel(level + 1);
        left = { t: "binary", op: tok.text as BinOp, left, right };
      } else {
        return left;
      }
    }
  }

  private parseUnary(): Expr {
    const tok = this.peek();
    if (tok.type === "op" && (tok.text === "!" || tok.text === "-")) {
      this.next();
      return { t: "unary", op: tok.text, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const tok = this.next();

    if (tok.type === "num") {
      return { t: "num", value: Number(tok.text) };
    }

    if (tok.type === "lparen") {
      const inner = this.parseLevel(0);
      const close = this.next();
      if (close.type !== "rparen") {
        throw new ExprError('Expected ")"', close.pos);
      }
      return inner;
    }

    if (tok.type === "ident") {
      if (tok.text === "true" || tok.text === "false") {
        return { t: "bool", value: tok.text === "true" };
      }
      // `head.name` reference, or a bare enum-member identifier.
      if (this.peek().type === "dot") {
        this.next();
        const nameTok = this.next();
        if (nameTok.type !== "ident") {
          throw new ExprError("Expected a variable name after \".\"", nameTok.pos);
        }
        return { t: "ref", head: tok.text, name: nameTok.text };
      }
      return { t: "member", name: tok.text };
    }

    throw new ExprError(`Unexpected "${tok.text || "end of input"}"`, tok.pos);
  }
}

/** Parse source into an AST, or throw ExprError on a syntax error. */
export function parse(src: string): Expr {
  return new Parser(tokenize(src)).parse();
}

/** Parse an activity effect (`head.name := expr`), or throw ExprError. */
export function parseAssignment(src: string): Assignment {
  return new Parser(tokenize(src)).parseAssignment();
}
