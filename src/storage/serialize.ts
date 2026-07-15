// ---------------------------------------------------------------------------
// Mapping between the typed model and the on-disk file format.
//
// One file per artifact: YAML frontmatter + markdown body. Parsing is
// defensive (files are hand-editable / git-merged), serialization is
// deterministic so round-tripping a file leaves a minimal, stable diff.
// ---------------------------------------------------------------------------

import { composeDecision } from "../model/decision";
import { composeEars } from "../model/ears";
import { buildFile, splitFrontmatter } from "../model/frontmatter";
import {
  DECISION_STATUSES,
  MOSCOWS,
  STATUSES,
  EARS_PATTERNS,
  STAKEHOLDER_TYPES,
  TEST_RESULTS,
  type Activity,
  type AltPath,
  type Artifact,
  type ArtifactKind,
  type Component,
  type Decision,
  type DecisionStatus,
  type EarsPattern,
  type Flow,
  type Moscow,
  type Need,
  type Requirement,
  type Stakeholder,
  type StakeholderType,
  type Status,
  type Term,
  type Test,
  type TestResult,
  type UseCase,
  type UserStory,
  type VarType,
  type Variable,
} from "../types";

// --- coercion helpers -------------------------------------------------------

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

function strArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x)).filter((s) => s.length > 0);
  if (typeof v === "string" && v.trim()) {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = str(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function status(v: unknown): Status {
  return oneOf<Status>(v, STATUSES, "draft");
}

function moscow(v: unknown): Moscow {
  return oneOf<Moscow>(v, MOSCOWS, "should");
}

function stakeholderType(v: unknown): StakeholderType {
  return oneOf<StakeholderType>(v, STAKEHOLDER_TYPES, "primary");
}

function decisionStatus(v: unknown): DecisionStatus {
  return oneOf<DecisionStatus>(v, DECISION_STATUSES, "proposed");
}

function testResult(v: unknown): TestResult {
  return oneOf<TestResult>(v, TEST_RESULTS, "unknown");
}

function ears(v: unknown): EarsPattern {
  // Accept both canonical slugs and a few historical aliases.
  const aliases: Record<string, EarsPattern> = {
    event: "event-driven",
    unwanted: "unwanted-behavior",
    state: "state-driven",
  };
  const s = str(v);
  if (s in aliases) return aliases[s];
  return oneOf<EarsPattern>(v, EARS_PATTERNS, "ubiquitous");
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function parseActivities(v: unknown): Activity[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw, i) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const pre = o.pre != null && str(o.pre).trim() ? str(o.pre) : undefined;
      const effects = strArray(o.effects);
      const initiator = o.initiator != null && str(o.initiator).trim() ? str(o.initiator) : undefined;
      return {
        id: str(o.id, `ACT-${String(i + 1).padStart(3, "0")}`),
        label: str(o.label),
        ...(pre ? { pre } : {}),
        ...(effects.length ? { effects } : {}),
        ...(initiator ? { initiator } : {}),
      } satisfies Activity;
    })
    .filter((a) => a.id.length > 0);
}

function parseAlternates(v: unknown): AltPath[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const guard = o.guard != null && str(o.guard).trim() ? str(o.guard) : undefined;
    return {
      id: str(o.id, `AP-${i + 1}`),
      condition: str(o.condition),
      ...(guard ? { guard } : {}),
      after: num(o.after, 0),
      rejoin: num(o.rejoin, -1),
      steps: strArray(o.steps),
    } satisfies AltPath;
  });
}

function parseVarType(o: Record<string, unknown>): VarType {
  const kind = str(o.type ?? o.kind);
  if (kind === "int") {
    return {
      kind: "int",
      ...(o.min != null ? { min: num(o.min, 0) } : {}),
      ...(o.max != null ? { max: num(o.max, 0) } : {}),
    };
  }
  if (kind === "enum") return { kind: "enum", values: strArray(o.values) };
  return { kind: "bool" };
}

function parseVariables(v: unknown): Variable[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw, i) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const initial = o.initial != null ? str(o.initial) : undefined;
      const description = o.description != null ? str(o.description) : undefined;
      return {
        id: str(o.id, `VAR-${String(i + 1).padStart(3, "0")}`),
        name: str(o.name),
        type: parseVarType(o),
        ...(initial ? { initial } : {}),
        ...(description ? { description } : {}),
      } satisfies Variable;
    })
    .filter((v) => v.name.length > 0);
}

function parseStories(v: unknown): UserStory[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id, `US-${String(i + 1).padStart(3, "0")}`),
      as_a: str(o.as_a),
      i_want: str(o.i_want),
      so_that: str(o.so_that),
    };
  });
}

// --- parse: file -> Artifact ------------------------------------------------

export function parseArtifact(kind: ArtifactKind, filename: string, raw: string): Artifact {
  const { data, body } = splitFrontmatter(raw);
  const fallbackId = filename.replace(/\.md$/i, "");
  const id = str(data.id, fallbackId);
  const created = data.created != null ? str(data.created) : undefined;
  // Optional low-confidence marker, shared by every kind. Only carried in-memory
  // when true so it stays absent from files and objects that don't need it.
  const inferred = bool(data.inferred) ? { inferred: true as const } : {};
  const base = {
    id,
    title: str(data.title, id),
    status: status(data.status),
    moscow: moscow(data.moscow),
    created,
    ...inferred,
  };

  switch (kind) {
    case "stakeholder":
      return {
        kind: "stakeholder",
        id,
        title: str(data.title, id),
        type: stakeholderType(data.type),
        body,
        created,
        ...inferred,
      } satisfies Stakeholder;

    case "need":
      return {
        ...base,
        kind: "need",
        stakeholder: str(data.stakeholder),
        source: data.source != null ? str(data.source) : undefined,
        tags: strArray(data.tags),
        body,
      } satisfies Need;

    case "use-case":
      return {
        ...base,
        kind: "use-case",
        trace: strArray(data.trace),
        actors: strArray(data.actors),
        stories: parseStories(data.stories),
        preconditions: strArray(data.preconditions),
        flow: str(data.flow),
      } satisfies UseCase;

    case "requirement": {
      // Prefer structured slots; fall back to the legacy statement body so
      // nothing is lost when reading a pre-structured file.
      const structured = data.subject != null || data.action != null || data.condition != null;
      return {
        ...base,
        kind: "requirement",
        trace: strArray(data.trace),
        format: "EARS",
        ears: ears(data.ears_pattern ?? data.ears),
        condition: str(data.condition),
        subject: str(data.subject),
        action: structured ? str(data.action) : body.trim(),
        object: str(data.object),
        constraint: str(data.constraint),
      } satisfies Requirement;
    }

    case "component":
      return {
        kind: "component",
        id,
        title: str(data.title, id),
        parent: str(data.parent),
        description: body,
        activities: parseActivities(data.activities),
        variables: parseVariables(data.variables),
        decisions: strArray(data.decisions),
        created,
        ...inferred,
      } satisfies Component;

    case "flow":
      return {
        kind: "flow",
        id,
        title: str(data.title, id),
        main: strArray(data.main),
        alternates: parseAlternates(data.alternates),
        created,
        ...inferred,
      } satisfies Flow;

    case "decision":
      return {
        kind: "decision",
        id,
        title: str(data.title, id),
        status: decisionStatus(data.status),
        trace: strArray(data.trace),
        context: str(data.context),
        concern: str(data.concern),
        decision: str(data.decision),
        alternatives: str(data.alternatives),
        criterion: str(data.criterion),
        downside: str(data.downside),
        created,
        ...inferred,
      } satisfies Decision;

    case "glossary":
      return {
        kind: "glossary",
        id,
        title: str(data.title, id),
        aliases: strArray(data.aliases),
        definition: body,
        created,
        ...inferred,
      } satisfies Term;

    case "test":
      return {
        kind: "test",
        id,
        title: str(data.title, id),
        trace: strArray(data.trace),
        file: str(data.file),
        result: testResult(data.result),
        body,
        created,
        ...inferred,
      } satisfies Test;
  }
}

// --- serialize: Artifact -> file --------------------------------------------

export function serializeArtifact(a: Artifact): string {
  switch (a.kind) {
    case "stakeholder": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        type: a.type,
      };
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      return buildFile(data, a.body);
    }

    case "need": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        status: a.status,
        moscow: a.moscow,
      };
      if (a.stakeholder) data.stakeholder = a.stakeholder;
      if (a.source) data.source = a.source;
      if (a.tags.length) data.tags = a.tags;
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      return buildFile(data, a.body);
    }

    case "use-case": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        status: a.status,
        trace: a.trace,
        moscow: a.moscow,
        actors: a.actors,
        stories: a.stories.map((s) => ({
          id: s.id,
          as_a: s.as_a,
          i_want: s.i_want,
          so_that: s.so_that,
        })),
        preconditions: a.preconditions,
      };
      if (a.flow) data.flow = a.flow;
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      // The flow (behaviour) itself is a separate artifact; the use case only
      // references it. No body content.
      return buildFile(data, "");
    }

    case "requirement": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        status: a.status,
        trace: a.trace,
        format: "EARS",
        ears_pattern: a.ears,
      };
      if (a.condition) data.condition = a.condition;
      data.subject = a.subject;
      data.action = a.action;
      if (a.object) data.object = a.object;
      if (a.constraint) data.constraint = a.constraint;
      data.moscow = a.moscow;
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      // Body is the generated statement — human-readable, never authored directly.
      return buildFile(data, composeEars(a));
    }

    case "component": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
      };
      if (a.parent) data.parent = a.parent;
      if (a.activities.length) {
        data.activities = a.activities.map((act) => {
          const out: Record<string, unknown> = { id: act.id, label: act.label };
          if (act.pre) out.pre = act.pre;
          if (act.effects?.length) out.effects = act.effects;
          if (act.initiator) out.initiator = act.initiator;
          return out;
        });
      }
      if (a.variables.length) {
        data.variables = a.variables.map((v) => {
          const out: Record<string, unknown> = { id: v.id, name: v.name, type: v.type.kind };
          if (v.type.kind === "enum") out.values = v.type.values;
          if (v.type.kind === "int") {
            if (v.type.min != null) out.min = v.type.min;
            if (v.type.max != null) out.max = v.type.max;
          }
          if (v.initial) out.initial = v.initial;
          if (v.description) out.description = v.description;
          return out;
        });
      }
      if (a.decisions.length) data.decisions = a.decisions;
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      // Description is the markdown body.
      return buildFile(data, a.description);
    }

    case "flow": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        main: a.main,
      };
      if (a.alternates.length) {
        data.alternates = a.alternates.map((alt) => {
          const out: Record<string, unknown> = { id: alt.id, condition: alt.condition };
          if (alt.guard) out.guard = alt.guard;
          out.after = alt.after;
          out.rejoin = alt.rejoin;
          out.steps = alt.steps;
          return out;
        });
      }
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      return buildFile(data, "");
    }

    case "decision": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        status: a.status,
        trace: a.trace,
        context: a.context,
        concern: a.concern,
        decision: a.decision,
      };
      if (a.alternatives) data.alternatives = a.alternatives;
      data.criterion = a.criterion;
      if (a.downside) data.downside = a.downside;
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      // Body is the generated Y-statement — human-readable, never authored directly.
      return buildFile(data, composeDecision(a));
    }

    case "glossary": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
      };
      if (a.aliases.length) data.aliases = a.aliases;
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      // The definition is the markdown body.
      return buildFile(data, a.definition);
    }

    case "test": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        trace: a.trace,
        result: a.result,
      };
      if (a.file) data.file = a.file;
      if (a.inferred) data.inferred = true;
      if (a.created) data.created = a.created;
      // Description is the markdown body.
      return buildFile(data, a.body);
    }
  }
}

export function filenameFor(a: Artifact): string {
  return `${a.id}.md`;
}
