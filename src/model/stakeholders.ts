// ---------------------------------------------------------------------------
// Stakeholder lookups and Need grouping.
//
// A Need references its stakeholder by id (Need.stakeholder). These helpers
// resolve that reference and group Needs under their stakeholder for the
// grouped Needs view — all derived at call time, nothing persisted.
// ---------------------------------------------------------------------------

import type { Need, Project, Stakeholder } from "../types";

/** The Stakeholder a need points at, or null if unassigned / dangling. */
export function stakeholderOf(project: Project, need: Need): Stakeholder | null {
  if (!need.stakeholder) return null;
  return project.stakeholders.find((s) => s.id === need.stakeholder) ?? null;
}

/** Display name for a stakeholder id (empty string if unknown / unset). */
export function stakeholderName(project: Project, id: string): string {
  if (!id) return "";
  return project.stakeholders.find((s) => s.id === id)?.title ?? "";
}

export interface NeedGroup {
  /** The owning stakeholder, or null for the trailing "Unassigned" group. */
  stakeholder: Stakeholder | null;
  needs: Need[];
}

/**
 * Group needs under their stakeholder for the Needs view. Groups follow the
 * stakeholders' own order; a stakeholder with no needs still gets a (possibly
 * empty) group so newly-added stakeholders are visible. Needs whose stakeholder
 * is unset or unresolved collect into a trailing "Unassigned" group.
 */
export function groupNeedsByStakeholder(project: Project, needs: Need[]): NeedGroup[] {
  const byStakeholder = new Map<string, Need[]>();
  const unassigned: Need[] = [];

  for (const need of needs) {
    const holder = stakeholderOf(project, need);
    if (!holder) {
      unassigned.push(need);
      continue;
    }
    const bucket = byStakeholder.get(holder.id);
    if (bucket) bucket.push(need);
    else byStakeholder.set(holder.id, [need]);
  }

  const groups: NeedGroup[] = project.stakeholders.map((s) => ({
    stakeholder: s,
    needs: byStakeholder.get(s.id) ?? [],
  }));

  if (unassigned.length > 0) {
    groups.push({ stakeholder: null, needs: unassigned });
  }
  return groups;
}
