// Project-wide vocabularies that back the dropdowns/comboboxes. Derived from
// what's already in the model so the lists grow as you use them, while still
// allowing a new value to be typed in.

import type { Project } from "../types";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Names of every stakeholder defined in the project. */
export function collectStakeholderNames(project: Project): string[] {
  return uniqueSorted(project.stakeholders.map((s) => s.title));
}

/** Actors named on any use case. */
export function collectActors(project: Project): string[] {
  return uniqueSorted(project.useCases.flatMap((u) => u.actors));
}

/** Candidate "As a …" values for user stories: actors plus stakeholder names. */
export function collectRoles(project: Project): string[] {
  return uniqueSorted([
    ...project.useCases.flatMap((u) => u.actors),
    ...project.stakeholders.map((s) => s.title),
  ]);
}

/** Candidate requirement subjects: prior subjects, actors, and a default. */
export function collectSubjects(project: Project): string[] {
  return uniqueSorted([
    "system",
    ...project.requirements.map((r) => r.subject),
    ...project.useCases.flatMap((u) => u.actors),
  ]);
}
