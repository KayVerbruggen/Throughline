import { flowOfUseCase } from "../model/behavior";
import { composeDecision } from "../model/decision";
import { composeEars } from "../model/ears";
import { testsForRequirement, useCasesForNeed } from "../model/trace";
import type { Project } from "../types";

/**
 * A compact, whole-project textual summary for a project-level LLM pass (the
 * model critic, and later natural-language authoring). Every artifact is listed
 * with its id — so a finding or draft can reference it — its human text, its
 * trace links, and the coverage flags a mechanical check already knows, so the
 * model can spend its judgement on what those flags can't capture. Kept terse:
 * one line per artifact where possible.
 */
export function describeProject(project: Project): string {
  const S: string[] = [];
  const section = (title: string, lines: string[]) => {
    S.push(`## ${title}`);
    S.push(lines.length ? lines.join("\n") : "(none)");
    S.push("");
  };

  section(
    "Stakeholders",
    project.stakeholders.map((s) => `- ${s.id} "${s.title}" (${s.type})`),
  );

  section(
    "Needs",
    project.needs.map((n) => {
      const owner = project.stakeholders.find((s) => s.id === n.stakeholder);
      const covered = useCasesForNeed(project, n.id).length > 0;
      const flags = [n.moscow ? `priority ${n.moscow}` : null, covered ? null : "NO use case covers it"]
        .filter(Boolean)
        .join(", ");
      return `- ${n.id} "${n.title}"${owner ? ` [${owner.title}]` : ""}${flags ? ` — ${flags}` : ""}`;
    }),
  );

  section(
    "Use cases",
    project.useCases.map((u) => {
      const hasFlow = flowOfUseCase(project, u) != null;
      const flags = [
        u.trace.length ? `addresses ${u.trace.join(", ")}` : "addresses NO need",
        u.moscow ? `priority ${u.moscow}` : null,
        hasFlow ? "has a flow" : "no flow",
        u.actors?.length ? `actors: ${u.actors.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return `- ${u.id} "${u.title}" — ${flags}`;
    }),
  );

  section(
    "Requirements (EARS)",
    project.requirements.map((r) => {
      const tested = testsForRequirement(project, r.id).length > 0;
      const flags = [
        r.trace.length ? `traces to ${r.trace.join(", ")}` : "traces to NO use case",
        tested ? "has a test" : "NO test",
      ].join("; ");
      return `- ${r.id}: ${composeEars(r)} — ${flags}`;
    }),
  );

  section(
    "Tests",
    project.tests.map((t) => {
      const flags = [
        t.trace.length ? `verifies ${t.trace.join(", ")}` : "verifies NO requirement",
        `result ${t.result}`,
      ].join("; ");
      return `- ${t.id} "${t.title}" — ${flags}`;
    }),
  );

  section(
    "Components",
    project.components.map((c) => {
      const vars = c.variables.map((v) => v.name).join(", ");
      const acts = c.activities.length;
      const bits = [
        `${acts} ${acts === 1 ? "activity" : "activities"}`,
        vars ? `state: ${vars}` : "no state",
        c.decisions.length ? `cites ${c.decisions.join(", ")}` : "cites no decision",
      ].join("; ");
      return `- ${c.id} "${c.title}" — ${bits}`;
    }),
  );

  section(
    "Design decisions",
    project.decisions.map(
      (d) => `- ${d.id} [${d.status}] ${composeDecision(d)}${d.trace.length ? ` (addresses ${d.trace.join(", ")})` : ""}`,
    ),
  );

  section(
    "Glossary",
    project.glossary.map(
      (g) => `- ${g.id} "${g.title}"${g.aliases?.length ? ` (aka ${g.aliases.join(", ")})` : ""}: ${g.definition || "(no definition)"}`,
    ),
  );

  return S.join("\n").trim();
}

/** Every artifact id in the project — used to resolve/validate model-supplied references. */
export function allArtifactIds(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const a of [
    ...project.stakeholders,
    ...project.needs,
    ...project.useCases,
    ...project.requirements,
    ...project.tests,
    ...project.components,
    ...project.flows,
    ...project.decisions,
    ...project.glossary,
  ]) {
    ids.add(a.id);
  }
  return ids;
}
