// ---------------------------------------------------------------------------
// Tokenizer for the behaviour expression language.
// ---------------------------------------------------------------------------

export type TokenType =
  | "num"
  | "ident"
  | "op"
  | "lparen"
  | "rparen"
  | "dot"
  | "eof";

export interface Token {
  type: TokenType;
  /** Literal text (operator symbol, identifier, or number text). */
  text: string;
  /** Start index in the source, for error reporting. */
  pos: number;
}

/** Thrown on an illegal character; caught at the parse boundary. */
export class ExprError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message);
    this.name = "ExprError";
  }
}

// Multi-character operators must be tried before their single-char prefixes.
// `:=` is the assignment operator used in activity effects; the lone `:` is not
// a token, so a stray colon reports as an unexpected character.
const MULTI = ["&&", "||", "==", "!=", "<=", ">=", ":="];
const SINGLE = new Set(["!", "<", ">", "+", "-", "*", "/"]);

function isIdentStart(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}
function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}
function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (c === "(") {
      tokens.push({ type: "lparen", text: c, pos: i++ });
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", text: c, pos: i++ });
      continue;
    }
    if (c === ".") {
      tokens.push({ type: "dot", text: c, pos: i++ });
      continue;
    }

    const two = src.slice(i, i + 2);
    if (MULTI.includes(two)) {
      tokens.push({ type: "op", text: two, pos: i });
      i += 2;
      continue;
    }
    if (SINGLE.has(c)) {
      tokens.push({ type: "op", text: c, pos: i++ });
      continue;
    }

    if (isDigit(c)) {
      const start = i;
      while (i < n && (isDigit(src[i]) || src[i] === ".")) i++;
      const text = src.slice(start, i);
      // A trailing/interior second dot is malformed (we tokenize `.` separately,
      // so a number never legitimately contains one — reject "1.2.3" style).
      if ((text.match(/\./g) ?? []).length > 1) {
        throw new ExprError(`Malformed number "${text}"`, start);
      }
      tokens.push({ type: "num", text, pos: start });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(src[i])) i++;
      tokens.push({ type: "ident", text: src.slice(start, i), pos: start });
      continue;
    }

    throw new ExprError(`Unexpected character "${c}"`, i);
  }

  tokens.push({ type: "eof", text: "", pos: n });
  return tokens;
}
