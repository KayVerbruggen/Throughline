// ---------------------------------------------------------------------------
// Actors ⇄ stakeholders.
//
// A use case lists its `actors` as free-text strings. To give the derived
// sequence diagram real, traceable lifelines we resolve each entry to a
// Stakeholder when it names one — either by its id ("SH-001") or, tolerantly,
// by its title ("System Engineer"). Entries that match no stakeholder stay
// usable as a plain named actor, so existing free-text projects keep working
// and migration to stakeholder ids is opt-in rather than forced.
// ---------------------------------------------------------------------------

import type { Project, Stakeholder } from "../types";

export interface ResolvedActor {
  /** Stable participant id: the stakeholder id when resolved, else `actor:<name>`. */
  id: string;
  /** Display name. */
  label: string;
  /** The backing stakeholder, when the entry resolved to one. */
  stakeholder?: Stakeholder;
}

/** Resolve one `UseCase.actors` entry to a stakeholder (by id or title) or a
 *  plain named actor. */
export function resolveActor(project: Project, entry: string): ResolvedActor {
  const trimmed = entry.trim();
  const byId = project.stakeholders.find((s) => s.id === trimmed);
  if (byId) return { id: byId.id, label: byId.title, stakeholder: byId };
  const byTitle = project.stakeholders.find(
    (s) => s.title.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byTitle) return { id: byTitle.id, label: byTitle.title, stakeholder: byTitle };
  return { id: `actor:${trimmed}`, label: trimmed };
}

/** Resolve every actor entry of a use case, skipping blanks. */
export function resolveActors(project: Project, entries: string[]): ResolvedActor[] {
  return entries.map((e) => e.trim()).filter(Boolean).map((e) => resolveActor(project, e));
}
