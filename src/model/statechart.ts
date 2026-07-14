// ---------------------------------------------------------------------------
// State-chart derivation (Stage 3, first cut).
//
// A flow's control-points ARE a state machine already: the ordered `main`
// steps plus each alternate's branch (`after` / `guard` / `steps` / `rejoin`)
// describe exactly when control moves from one activity to the next. This
// module turns a Flow into a directed graph — Start → activities → End, with
// branch edges carrying the Stage-0 guards — and lays it out for rendering.
//
// The point of this being the FIRST executable-looking payoff is that it needs
// *only* guards: no activity effects are read here at all. An activity with no
// effects is a perfectly good node; the chart shows *that* control flows and
// *when* a branch is guarded, which is the whole answer to "can I get a chart
// without writing state assignments first" — yes. (Stage 2's simulator is the
// thing that later reads effects to evaluate those guards over real state.)
//
// Everything here is pure and deterministic: same project + flow ⇒ same chart.
// ---------------------------------------------------------------------------

import { componentOfActivity } from "./behavior";
import type { Flow, Project } from "../types";

export type ChartNodeKind = "start" | "end" | "activity";

export interface ChartNode {
  /** Synthetic, position-based id (e.g. "start", "m2", "AP-1#0"). Position —
   *  not activity id — so the same activity appearing twice stays two nodes. */
  id: string;
  kind: ChartNodeKind;
  /** Display label: the activity label, or "Start" / "End". */
  label: string;
  /** Owning component id, for colour/selection (activity nodes only). */
  componentId?: string;
  /** The underlying activity id (activity nodes only). */
  activityId?: string;
  /** Vertical rank (0 = Start); ties are separated by `lane`. */
  rank: number;
  /** Horizontal lane: 0 = the main spine, ≥1 = an alternate's column. */
  lane: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ChartEdgeKind = "seq" | "branch" | "rejoin";

export interface ChartEdge {
  from: string;
  to: string;
  kind: ChartEdgeKind;
  /** Guard (preferred) or prose condition shown on a branch edge. */
  label?: string;
  /** True when the guard formalises the label; false when it's prose only. */
  formal: boolean;
  /** True when the edge points to an equal/earlier rank (drawn as an up-loop). */
  back: boolean;
  /** SVG path between the two node borders. */
  d: string;
  /** Anchor for the edge label, when it has one. */
  labelX: number;
  labelY: number;
}

export interface StateChart {
  nodes: ChartNode[];
  edges: ChartEdge[];
  byId: Map<string, ChartNode>;
  width: number;
  height: number;
  /** True when there's nothing to draw (no main steps and no branches). */
  empty: boolean;
}

// --- geometry ---------------------------------------------------------------

const NODE_W = 200;
const NODE_H = 48;
const CAP_W = 108; // Start / End pill width
const CAP_H = 34;
const ROW = 82; // vertical distance between successive ranks
const LANE_W = 250; // horizontal distance between lanes
const PAD = 28;

/** Arrowhead sizing — kept in sync with the <marker> drawn in StateChartView. */
export const CHART_ARROW_LEN = 9;
export const CHART_ARROW_GAP = 2;

const mainCx = PAD + NODE_W / 2;

function laneX(lane: number, w: number): number {
  // Centre every node on its lane's spine so caps (narrow) and activities
  // (wide) line up vertically.
  const centre = mainCx + lane * LANE_W;
  return centre - w / 2;
}

// --- derivation -------------------------------------------------------------

interface RawEdge {
  from: string;
  to: string;
  kind: ChartEdgeKind;
  label?: string;
  formal: boolean;
}

/**
 * Build the state chart for a single flow. Alternates whose `after` falls
 * outside the main path are skipped (they can't be anchored to a branch point)
 * — the Behaviour view already surfaces those as "unattached", so dropping them
 * here keeps the graph well-formed rather than inventing an origin for them.
 */
export function deriveStateChart(project: Project, flow: Flow): StateChart {
  const nodes: ChartNode[] = [];
  const rawEdges: RawEdge[] = [];
  const inMainRange = (n: number) => n >= 0 && n < flow.main.length;

  const empty = flow.main.length === 0 && !flow.alternates.some((a) => inMainRange(a.after));
  if (empty) {
    return { nodes: [], edges: [], byId: new Map(), width: PAD * 2, height: PAD * 2, empty: true };
  }

  // Node ids. Start and End frame the machine; main steps and alternate steps
  // each get a position-based id so a repeated activity stays distinct.
  const START = "start";
  const END = "end";
  const mainId = (i: number) => `m${i}`;
  const altId = (altKey: string, j: number) => `${altKey}#${j}`;

  // --- ranks (vertical position) --------------------------------------------
  // Start at 0; main step i at i+1; End just past the last main step. An
  // alternate's steps descend from just below their branch point.
  const rankOf = new Map<string, number>();
  rankOf.set(START, 0);
  flow.main.forEach((_, i) => rankOf.set(mainId(i), i + 1));
  const endRank = flow.main.length + 1;
  rankOf.set(END, endRank);

  // --- nodes: start + main spine + end --------------------------------------
  const addNode = (n: Omit<ChartNode, "x" | "y">): ChartNode => {
    const node: ChartNode = { ...n, x: laneX(n.lane, n.w), y: PAD + n.rank * ROW };
    nodes.push(node);
    return node;
  };

  addNode({ id: START, kind: "start", label: "Start", rank: 0, lane: 0, w: CAP_W, h: CAP_H });
  flow.main.forEach((actId, i) => {
    const owner = componentOfActivity(project, actId);
    const activity = owner?.activities.find((a) => a.id === actId) ?? null;
    addNode({
      id: mainId(i),
      kind: "activity",
      label: activity?.label || "(unnamed)",
      componentId: owner?.id,
      activityId: actId,
      rank: i + 1,
      lane: 0,
      w: NODE_W,
      h: NODE_H,
    });
  });
  addNode({ id: END, kind: "end", label: "End", rank: endRank, lane: 0, w: CAP_W, h: CAP_H });

  // --- main sequential edges ------------------------------------------------
  // Start → first step → … → last step → End (or Start → End for an empty
  // main path that still carries branches off step -1, which can't happen since
  // those are out of range and skipped — so an empty main is already `empty`).
  if (flow.main.length > 0) {
    rawEdges.push({ from: START, to: mainId(0), kind: "seq", formal: false });
    for (let i = 0; i < flow.main.length - 1; i++) {
      rawEdges.push({ from: mainId(i), to: mainId(i + 1), kind: "seq", formal: false });
    }
    rawEdges.push({ from: mainId(flow.main.length - 1), to: END, kind: "seq", formal: false });
  }

  // --- alternates: branch edge, internal steps, rejoin ----------------------
  // Each alternate lays out in its own lane (assigned after we know vertical
  // spans, below). Its steps are ranked descending from the branch point.
  interface AltPlacement {
    key: string;
    stepIds: string[];
    startRank: number;
    endRank: number;
  }
  const placements: AltPlacement[] = [];

  flow.alternates.forEach((alt) => {
    if (!inMainRange(alt.after)) return;
    const branchRank = alt.after + 1; // rank of the main node we branch from
    const label = alt.guard || alt.condition || undefined;
    const formal = !!alt.guard;
    const target = inMainRange(alt.rejoin) ? mainId(alt.rejoin) : END;

    const stepIds = alt.steps.map((_, j) => altId(alt.id, j));

    if (stepIds.length === 0) {
      // A guard-only branch: one labelled edge from the branch point straight
      // to the rejoin target (or End). Nothing to place in a lane.
      rawEdges.push({ from: mainId(alt.after), to: target, kind: "branch", label, formal });
      return;
    }

    // Branch edge into the first alternate step carries the guard label.
    rawEdges.push({ from: mainId(alt.after), to: stepIds[0], kind: "branch", label, formal });

    alt.steps.forEach((actId, j) => {
      const owner = componentOfActivity(project, actId);
      const activity = owner?.activities.find((a) => a.id === actId) ?? null;
      const rank = branchRank + 1 + j;
      rankOf.set(stepIds[j], rank);
      addNode({
        id: stepIds[j],
        kind: "activity",
        label: activity?.label || "(unnamed)",
        componentId: owner?.id,
        activityId: actId,
        rank,
        lane: 0, // real lane assigned below
        w: NODE_W,
        h: NODE_H,
      });
      if (j < alt.steps.length - 1) {
        rawEdges.push({ from: stepIds[j], to: stepIds[j + 1], kind: "seq", formal: false });
      }
    });

    // Rejoin edge from the last step back into the main flow (or to End).
    rawEdges.push({ from: stepIds[stepIds.length - 1], to: target, kind: "rejoin", formal: false });

    const targetRank = rankOf.get(target) ?? endRank;
    const stepRanks = stepIds.map((id) => rankOf.get(id)!);
    placements.push({
      key: alt.id,
      stepIds,
      startRank: Math.min(branchRank, targetRank, ...stepRanks),
      endRank: Math.max(branchRank, targetRank, ...stepRanks),
    });
  });

  // --- lane packing ---------------------------------------------------------
  // Give each alternate the lowest lane (≥1) whose vertical span is free, so
  // non-overlapping branches share a column instead of fanning ever wider.
  const laneEnds: number[] = []; // laneEnds[k] = last endRank occupying lane k+1
  const laneOfKey = new Map<string, number>();
  for (const p of placements) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= p.startRank) lane++;
    laneEnds[lane] = p.endRank;
    laneOfKey.set(p.key, lane + 1);
  }
  // Re-place alternate step nodes now that their lane is known.
  const byId = new Map<string, ChartNode>();
  for (const p of placements) {
    const lane = laneOfKey.get(p.key)!;
    for (const id of p.stepIds) {
      const node = nodes.find((n) => n.id === id)!;
      node.lane = lane;
      node.x = laneX(lane, node.w);
    }
  }
  for (const n of nodes) byId.set(n.id, n);

  // --- edge paths -----------------------------------------------------------
  const edges: ChartEdge[] = rawEdges.map((e) => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const back = (rankOf.get(e.to) ?? 0) <= (rankOf.get(e.from) ?? 0);
    const { d, labelX, labelY } = back ? backPath(a, b) : forwardPath(a, b);
    return { ...e, back, d, labelX, labelY };
  });

  // --- canvas size ----------------------------------------------------------
  const maxRank = Math.max(...nodes.map((n) => n.rank));
  const maxLane = Math.max(0, ...nodes.map((n) => n.lane));
  const width = laneX(maxLane, NODE_W) + NODE_W + PAD;
  const height = PAD * 2 + maxRank * ROW + NODE_H;

  return { nodes, edges, byId, width, height, empty: false };
}

// --- path helpers -----------------------------------------------------------

/** A forward edge: leave the bottom of `a`, arrive at the top of `b`, with a
 *  vertical tangent at both ends so it meets the down-pointing arrowhead. */
function forwardPath(a: ChartNode, b: ChartNode): { d: string; labelX: number; labelY: number } {
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2;
  const yEnd = b.y - CHART_ARROW_GAP - CHART_ARROW_LEN;
  const my = (y1 + yEnd) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${yEnd}`;
  return { d, labelX: (x1 + x2) / 2, labelY: my };
}

/** A back (rejoin) edge to an equal/earlier rank: bow out to the right, run
 *  up, and enter the target's right side with a leftward arrowhead. */
function backPath(a: ChartNode, b: ChartNode): { d: string; labelX: number; labelY: number } {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x + b.w;
  const y2 = b.y + b.h / 2;
  const bow = 56;
  const cx = Math.max(x1, x2) + bow;
  const xEnd = x2 + CHART_ARROW_GAP + CHART_ARROW_LEN;
  const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${xEnd} ${y2}`;
  return { d, labelX: cx - 10, labelY: (y1 + y2) / 2 };
}
