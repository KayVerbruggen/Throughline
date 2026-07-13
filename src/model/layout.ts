// ---------------------------------------------------------------------------
// Structure-diagram layout.
//
// Components are laid out in columns (layers) following the direction of flow,
// then reordered within each column by a barycenter sweep — the standard
// Sugiyama crossing-reduction heuristic — so connection lines overlap as little
// as possible. Pure and deterministic: same project ⇒ same layout.
// ---------------------------------------------------------------------------

import { directedComponentEdges, structureEdges } from "./behavior";
import type { Component, Project } from "../types";

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidOutEdge {
  a: string;
  b: string;
  d: string;
  flows: string[];
}

export interface StructureLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

const NODE_W = 194;
const NODE_H = 88;
const COL_GAP = 92;
const ROW_GAP = 26;
const PAD = 12;

/** Longest-path layering over the directed edges, with cycles broken by DFS. */
function assignLayers(ids: string[], directed: [string, string][]): Map<string, number> {
  const idSet = new Set(ids);
  const edges = directed.filter(([a, b]) => idSet.has(a) && idSet.has(b));

  // Break cycles: drop edges that point back to a node still on the DFS stack.
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const [a, b] of edges) adj.get(a)!.push(b);

  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on-stack, 2 done
  const acyclic: [string, string][] = [];
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u)!) {
      const s = state.get(v) ?? 0;
      if (s === 1) continue; // back edge — skip to keep the graph acyclic
      acyclic.push([u, v]);
      if (s === 0) dfs(v);
    }
    state.set(u, 2);
  };
  for (const id of ids) if ((state.get(id) ?? 0) === 0) dfs(id);

  // Longest-path layering on the acyclic edge set.
  const incoming = new Map<string, string[]>();
  const outAdj = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, []);
    outAdj.set(id, []);
  }
  for (const [a, b] of acyclic) {
    incoming.get(b)!.push(a);
    outAdj.get(a)!.push(b);
  }

  const layer = new Map<string, number>();
  const indeg = new Map<string, number>(ids.map((id) => [id, incoming.get(id)!.length]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  for (const id of queue) layer.set(id, 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of outAdj.get(u)!) {
      layer.set(v, Math.max(layer.get(v) ?? 0, (layer.get(u) ?? 0) + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  for (const id of ids) if (!layer.has(id)) layer.set(id, 0);
  return layer;
}

/** Order nodes within each column to reduce crossings (barycenter sweeps). */
function orderWithinLayers(
  columns: string[][],
  neighbours: Map<string, string[]>,
): void {
  const indexIn = (col: string[]) => {
    const m = new Map<string, number>();
    col.forEach((id, i) => m.set(id, i));
    return m;
  };

  for (let iter = 0; iter < 6; iter++) {
    const downward = iter % 2 === 0;
    const order = downward
      ? [...columns.keys()]
      : [...columns.keys()].reverse();
    for (const ci of order) {
      const posMaps = columns.map(indexIn);
      const col = columns[ci];
      const bary = new Map<string, number>();
      col.forEach((id, i) => {
        const ns = neighbours.get(id) ?? [];
        const positions: number[] = [];
        for (const n of ns) {
          for (let li = 0; li < columns.length; li++) {
            if (li === ci) continue;
            const p = posMaps[li].get(n);
            if (p != null) positions.push(p);
          }
        }
        bary.set(id, positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : i);
      });
      col.sort((x, y) => (bary.get(x)! - bary.get(y)!) || 0);
    }
  }
}

function edgePath(a: LaidOutNode, b: LaidOutNode): string {
  // Anchor on the sides facing each other so lines leave/enter cleanly.
  const aRight = a.x + a.w;
  const bRight = b.x + b.w;
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  let x1: number, x2: number;
  if (a.x + a.w <= b.x) {
    x1 = aRight;
    x2 = b.x;
  } else if (b.x + b.w <= a.x) {
    x1 = a.x;
    x2 = bRight;
  } else {
    // Same/overlapping column: bow out to the right.
    x1 = aRight;
    x2 = bRight;
    const bow = 34;
    const cx = Math.max(x1, x2) + bow;
    return `M ${x1} ${ay} C ${cx} ${ay}, ${cx} ${by}, ${x2} ${by}`;
  }
  const dx = (x2 - x1) / 2;
  return `M ${x1} ${ay} C ${x1 + dx} ${ay}, ${x2 - dx} ${by}, ${x2} ${by}`;
}

export function layoutStructure(project: Project): StructureLayout {
  const components: Component[] = project.components;
  const ids = components.map((c) => c.id);
  const undirected = structureEdges(project).filter(
    (e) => ids.includes(e.a) && ids.includes(e.b),
  );
  const directed = directedComponentEdges(project);

  const layer = assignLayers(ids, directed);

  // Neighbours (undirected) drive the crossing-reduction sweeps.
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of undirected) {
    neighbours.get(e.a)!.push(e.b);
    neighbours.get(e.b)!.push(e.a);
  }

  const maxLayer = ids.reduce((m, id) => Math.max(m, layer.get(id) ?? 0), 0);
  const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  // Stable initial order (by id) keeps layout deterministic before sweeps.
  for (const id of [...ids].sort()) columns[layer.get(id) ?? 0].push(id);
  orderWithinLayers(columns, neighbours);

  // Assign coordinates; vertically centre each column against the tallest one.
  const colHeights = columns.map((col) => col.length * NODE_H + Math.max(0, col.length - 1) * ROW_GAP);
  const maxColHeight = Math.max(0, ...colHeights);
  const pos = new Map<string, LaidOutNode>();
  columns.forEach((col, ci) => {
    const x = PAD + ci * (NODE_W + COL_GAP);
    const yStart = PAD + (maxColHeight - colHeights[ci]) / 2;
    col.forEach((id, ri) => {
      pos.set(id, { id, x, y: yStart + ri * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H });
    });
  });

  const nodes = ids.map((id) => pos.get(id)!);
  const edges: LaidOutEdge[] = undirected.map((e) => ({
    a: e.a,
    b: e.b,
    flows: e.flows,
    d: edgePath(pos.get(e.a)!, pos.get(e.b)!),
  }));

  const width = PAD * 2 + (maxLayer + 1) * NODE_W + maxLayer * COL_GAP;
  const height = PAD * 2 + maxColHeight;
  return { nodes, edges, width, height };
}
