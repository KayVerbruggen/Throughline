// ---------------------------------------------------------------------------
// Design decisions: composing the fixed "Y-statement" sentence and the derived
// links between decisions, use cases, and components.
//
// Like EARS requirements, the decision sentence is generated from structured
// slots — never hand-typed — so every decision reads identically. Links are
// forward-only: a decision references its use cases (`trace`); a component
// references its decisions (`Component.decisions`). Reverse views ("which
// components cite this decision") are computed here, never stored.
// ---------------------------------------------------------------------------

import type { Component, Decision, Project, UseCase } from "../types";

type DecisionParts = Pick<
  Decision,
  "context" | "concern" | "decision" | "alternatives" | "criterion" | "downside"
>;

/**
 * Compose the full Y-statement from the structured slots. The two optional
 * clauses (alternatives, downside) are dropped when empty rather than left as
 * dangling "and not …". A placeholder "…" fills a missing required slot so the
 * live preview stays readable while a decision is still being authored.
 */
export function composeDecision(d: DecisionParts): string {
  const context = (d.context ?? "").trim() || "…";
  const concern = (d.concern ?? "").trim() || "…";
  const decision = (d.decision ?? "").trim() || "…";
  const alternatives = (d.alternatives ?? "").trim();
  const criterion = (d.criterion ?? "").trim() || "…";
  const downside = (d.downside ?? "").trim();

  let s = `In the ${context}, facing ${concern}, we decided ${decision}`;
  if (alternatives) s += ` and not ${alternatives}`;
  s += ` to achieve ${criterion}`;
  if (downside) s += `, accepting ${downside}`;
  return s.replace(/\s+/g, " ").trim().replace(/\.*$/, "") + ".";
}

// --- derived links ----------------------------------------------------------

/** The decisions a component links to, in the component's stored order. */
export function decisionsForComponent(project: Project, component: Component): Decision[] {
  return component.decisions
    .map((id) => project.decisions.find((d) => d.id === id))
    .filter((d): d is Decision => d != null);
}

/** The components that cite a given decision (reverse of Component.decisions). */
export function componentsForDecision(project: Project, decisionId: string): Component[] {
  return project.components.filter((c) => c.decisions.includes(decisionId));
}

/** The use cases a decision addresses (follows the stored forward `trace`). */
export function useCasesOfDecision(project: Project, decision: Decision): UseCase[] {
  return project.useCases.filter((u) => decision.trace.includes(u.id));
}
