// ---------------------------------------------------------------------------
// Structure-diagram layout.
//
// The structure view draws the component *hierarchy* (composition, authored via
// Component.parent) two ways, plus the derived flow *connections* on top:
//
//   • layoutTree   — a top-down tidy tree; parent→child drawn as directed links.
//   • layoutNested — blocks nested inside their parent block (a "page"-like view
//                    for UI-style composition); hierarchy is shown by containment.
//
// Connections (structureEdges — two components whose activities run back-to-back
// in a flow) are laid over either layout as distinct arcs. Both layouts are pure
// and deterministic: same project ⇒ same layout.
// ---------------------------------------------------------------------------

import { structureEdges } from "./behavior";
import { componentForest } from "./hierarchy";
import type { Project } from "../types";

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Depth in the hierarchy (0 = top-level), for styling/z-order. */
  depth: number;
  /** True when the component has children (a container in nested mode). */
  container: boolean;
  /** Title-bar height reserved at the top of a nested container (0 otherwise). */
  headerH: number;
}

/** A directed parent → child hierarchy link (tree mode). */
export interface HierEdge {
  parent: string;
  child: string;
  d: string;
}

/** A derived, undirected flow connection between two components. */
export interface ConnEdge {
  a: string;
  b: string;
  d: string;
  flows: string[];
}

export interface StructureLayout {
  nodes: LaidOutNode[];
  byId: Map<string, LaidOutNode>;
  hierEdges: HierEdge[];
  connEdges: ConnEdge[];
  width: number;
  height: number;
}

// --- shared: connection arcs ------------------------------------------------

/** A gently bowed arc between the centres of two placed nodes. */
function connPath(a: LaidOutNode, b: LaidOutNode): string {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // Bow perpendicular so two nodes with several links don't overlap perfectly.
  const bow = Math.min(38, len * 0.16);
  const cx = mx - (dy / len) * bow;
  const cy = my + (dx / len) * bow;
  return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
}

function buildConnEdges(project: Project, byId: Map<string, LaidOutNode>): ConnEdge[] {
  const out: ConnEdge[] = [];
  for (const e of structureEdges(project)) {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b) continue;
    out.push({ a: e.a, b: e.b, flows: e.flows, d: connPath(a, b) });
  }
  return out;
}

// --- tree layout ------------------------------------------------------------

const T_NODE_W = 236;
const T_NODE_H = 96;
const T_H_GAP = 28; // between sibling subtrees
const T_V_GAP = 56; // between levels
const T_PAD = 16;

/**
 * Arrowhead geometry, shared with the marker drawn in StructureView. The link
 * line stops at the arrowhead's BASE (`HIER_ARROW_LEN + HIER_ARROW_GAP` above
 * the child), so the arrow — not the curve — fills the last stretch into the
 * node. Keep these in sync with the <marker> sizing.
 */
export const HIER_ARROW_LEN = 9;
export const HIER_ARROW_GAP = 2;

/** Directed link from a parent's bottom-centre down to just above the child,
 *  ending at the base of the arrowhead so the arrow reads cleanly. */
function hierPath(p: LaidOutNode, c: LaidOutNode): string {
  const x1 = p.x + p.w / 2;
  const y1 = p.y + p.h;
  const x2 = c.x + c.w / 2;
  const yBase = c.y - HIER_ARROW_GAP - HIER_ARROW_LEN;
  const my = (y1 + yBase) / 2;
  // Both the last control point and the end share x2 → vertical arrival, so the
  // downward-pointing arrowhead lines up with the curve.
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${yBase}`;
}

/** When `focusId` names an existing component, only that component and its
 *  descendants are laid out (it becomes the sole root); otherwise the whole
 *  forest is laid out. */
export function layoutTree(project: Project, focusId = ""): StructureLayout {
  const forest = componentForest(project);
  const { children } = forest;
  const roots = focusId && forest.children.has(focusId) ? [focusId] : forest.roots;
  const byId = new Map<string, LaidOutNode>();

  // First pass: measure each subtree's total width.
  const subtreeW = new Map<string, number>();
  const measure = (id: string): number => {
    const kids = children.get(id) ?? [];
    let w = T_NODE_W;
    if (kids.length) {
      const kidsW = kids.reduce((s, k) => s + measure(k), 0) + T_H_GAP * (kids.length - 1);
      w = Math.max(T_NODE_W, kidsW);
    }
    subtreeW.set(id, w);
    return w;
  };
  for (const r of roots) measure(r);

  // Second pass: place. `left` is the left edge of this node's subtree band.
  let maxDepth = 0;
  const place = (id: string, left: number, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    const w = subtreeW.get(id)!;
    const kids = children.get(id) ?? [];
    const y = T_PAD + depth * (T_NODE_H + T_V_GAP);
    let x: number;
    if (kids.length === 0) {
      x = left + (w - T_NODE_W) / 2;
    } else {
      let cursor = left;
      for (const k of kids) {
        place(k, cursor, depth + 1);
        cursor += subtreeW.get(k)! + T_H_GAP;
      }
      const first = byId.get(kids[0])!;
      const last = byId.get(kids[kids.length - 1])!;
      const centre = (first.x + first.w / 2 + (last.x + last.w / 2)) / 2;
      x = centre - T_NODE_W / 2;
    }
    byId.set(id, {
      id,
      x,
      y,
      w: T_NODE_W,
      h: T_NODE_H,
      depth,
      container: kids.length > 0,
      headerH: 0,
    });
  };

  let cursor = T_PAD;
  for (const r of roots) {
    place(r, cursor, 0);
    cursor += subtreeW.get(r)! + T_H_GAP;
  }

  const nodes = [...byId.values()];
  const hierEdges: HierEdge[] = [];
  for (const [id, kids] of children) {
    const p = byId.get(id);
    if (!p) continue;
    for (const k of kids) {
      const c = byId.get(k);
      if (c) hierEdges.push({ parent: id, child: k, d: hierPath(p, c) });
    }
  }

  const totalW = roots.reduce((s, r) => s + subtreeW.get(r)!, 0) + T_H_GAP * Math.max(0, roots.length - 1);
  const width = T_PAD * 2 + Math.max(T_NODE_W, totalW);
  const height = T_PAD * 2 + (maxDepth + 1) * T_NODE_H + maxDepth * T_V_GAP;
  return { nodes, byId, hierEdges, connEdges: buildConnEdges(project, byId), width, height };
}

// --- nested layout ----------------------------------------------------------

const N_LEAF_W = 236;
const N_LEAF_H = 96;
const N_HEADER_H = 42;
const N_INNER_PAD = 14;
const N_GAP = 13;
const N_PAD = 16;

interface Size {
  w: number;
  h: number;
}

/** Split children into rows of roughly √n per row for a balanced block. */
function rowsOf(kids: string[]): string[][] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(kids.length)));
  const rows: string[][] = [];
  for (let i = 0; i < kids.length; i += cols) rows.push(kids.slice(i, i + cols));
  return rows;
}

export function layoutNested(project: Project, focusId = ""): StructureLayout {
  const forest = componentForest(project);
  const { children } = forest;
  const roots = focusId && forest.children.has(focusId) ? [focusId] : forest.roots;
  const byId = new Map<string, LaidOutNode>();
  const size = new Map<string, Size>();

  const measure = (id: string): Size => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      const s = { w: N_LEAF_W, h: N_LEAF_H };
      size.set(id, s);
      return s;
    }
    const rows = rowsOf(kids);
    let innerW = 0;
    let innerH = 0;
    rows.forEach((row, ri) => {
      let rowW = 0;
      let rowH = 0;
      row.forEach((k, ci) => {
        const ks = measure(k);
        rowW += ks.w + (ci > 0 ? N_GAP : 0);
        rowH = Math.max(rowH, ks.h);
      });
      innerW = Math.max(innerW, rowW);
      innerH += rowH + (ri > 0 ? N_GAP : 0);
    });
    const s = {
      w: innerW + N_INNER_PAD * 2,
      h: N_HEADER_H + innerH + N_INNER_PAD * 2,
    };
    size.set(id, s);
    return s;
  };
  for (const r of roots) measure(r);

  const place = (id: string, x: number, y: number, depth: number) => {
    const s = size.get(id)!;
    const kids = children.get(id) ?? [];
    byId.set(id, {
      id,
      x,
      y,
      w: s.w,
      h: s.h,
      depth,
      container: kids.length > 0,
      headerH: kids.length > 0 ? N_HEADER_H : 0,
    });
    if (kids.length === 0) return;
    const rows = rowsOf(kids);
    let cursorY = y + N_HEADER_H + N_INNER_PAD;
    for (const row of rows) {
      let cursorX = x + N_INNER_PAD;
      let rowH = 0;
      for (const k of row) {
        const ks = size.get(k)!;
        place(k, cursorX, cursorY, depth + 1);
        cursorX += ks.w + N_GAP;
        rowH = Math.max(rowH, ks.h);
      }
      cursorY += rowH + N_GAP;
    }
  };

  let cursorX = N_PAD;
  let maxH = 0;
  for (const r of roots) {
    place(r, cursorX, N_PAD, 0);
    const s = size.get(r)!;
    cursorX += s.w + N_GAP;
    maxH = Math.max(maxH, s.h);
  }

  const nodes = [...byId.values()];
  const width = cursorX - N_GAP + N_PAD;
  const height = N_PAD * 2 + maxH;
  return {
    nodes,
    byId,
    hierEdges: [],
    connEdges: buildConnEdges(project, byId),
    width: Math.max(N_PAD * 2 + N_LEAF_W, width),
    height,
  };
}
