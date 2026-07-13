import type { Moscow } from "../types";

/** Priority ordering, highest first. */
const ORDER: Moscow[] = ["must", "should", "could", "wont"];

const RANK: Record<Moscow, number> = {
  must: 0,
  should: 1,
  could: 2,
  wont: 3,
};

/** True when `a` is a strictly higher priority than `b`. */
export function higher(a: Moscow, b: Moscow): boolean {
  return RANK[a] < RANK[b];
}

/**
 * The highest priority among a set of parents.
 *
 * Used by the MoSCoW pre-fill rule: when a Use Case or Requirement is created,
 * its `moscow` is pre-filled from its direct parent's value — and if it has
 * multiple parents, from the highest priority among them.
 */
export function highestOf(values: Moscow[]): Moscow {
  if (values.length === 0) return "should"; // sensible default when parentless
  return values.reduce((best, v) => (higher(v, best) ? v : best), values[0]);
}

export const MOSCOW_ORDER = ORDER;
