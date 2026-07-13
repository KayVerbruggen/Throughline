// ---------------------------------------------------------------------------
// Mapping between the typed model and the on-disk file format.
//
// One file per artifact: YAML frontmatter + markdown body. Parsing is
// defensive (files are hand-editable / git-merged), serialization is
// deterministic so round-tripping a file leaves a minimal, stable diff.
// ---------------------------------------------------------------------------

import { buildFile, splitFrontmatter } from "../model/frontmatter";
import {
  MOSCOWS,
  STATUSES,
  EARS_PATTERNS,
  type AlternateFlow,
  type Artifact,
  type ArtifactKind,
  type EarsPattern,
  type Moscow,
  type Need,
  type Requirement,
  type Status,
  type UseCase,
  type UserStory,
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

// --- use-case body <-> mainFlow / altFlows ----------------------------------

function parseUseCaseBody(body: string): { mainFlow: string[]; altFlows: AlternateFlow[] } {
  const mainFlow: string[] = [];
  const altFlows: AlternateFlow[] = [];
  let section: "main" | "alt" | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^##\s+main flow/i.test(line)) {
      section = "main";
      continue;
    }
    if (/^##\s+alternate flows?/i.test(line)) {
      section = "alt";
      continue;
    }
    if (/^##\s+/.test(line)) {
      section = null;
      continue;
    }
    if (!line) continue;

    if (section === "main") {
      const m = line.match(/^\d+[.)]\s+(.*)$/);
      if (m) mainFlow.push(m[1].trim());
    } else if (section === "alt") {
      const m = line.match(/^[-*]\s+(.*)$/);
      if (m) {
        const step = m[1].match(/^at step\s+(\d+)[,:]?\s*(.*)$/i);
        if (step) altFlows.push({ step: parseInt(step[1], 10), text: step[2].trim() });
        else altFlows.push({ step: 0, text: m[1].trim() });
      }
    }
  }
  return { mainFlow, altFlows };
}

function buildUseCaseBody(uc: UseCase): string {
  const parts: string[] = [];
  parts.push("## Main flow");
  uc.mainFlow.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
  if (uc.altFlows.length > 0) {
    parts.push("");
    parts.push("## Alternate flows");
    for (const a of uc.altFlows) {
      parts.push(a.step > 0 ? `- At step ${a.step}, ${a.text}` : `- ${a.text}`);
    }
  }
  return parts.join("\n");
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
  const base = {
    id,
    title: str(data.title, id),
    status: status(data.status),
    moscow: moscow(data.moscow),
    created: data.created != null ? str(data.created) : undefined,
  };

  switch (kind) {
    case "need":
      return {
        ...base,
        kind: "need",
        source: data.source != null ? str(data.source) : undefined,
        tags: strArray(data.tags),
        body,
      } satisfies Need;

    case "use-case": {
      const flows = parseUseCaseBody(body);
      return {
        ...base,
        kind: "use-case",
        trace: strArray(data.trace),
        actors: strArray(data.actors),
        stories: parseStories(data.stories),
        preconditions: strArray(data.preconditions),
        mainFlow: flows.mainFlow,
        altFlows: flows.altFlows,
      } satisfies UseCase;
    }

    case "requirement":
      return {
        ...base,
        kind: "requirement",
        trace: strArray(data.trace),
        format: "EARS",
        ears: ears(data.ears_pattern ?? data.ears),
        body,
      } satisfies Requirement;
  }
}

// --- serialize: Artifact -> file --------------------------------------------

export function serializeArtifact(a: Artifact): string {
  switch (a.kind) {
    case "need": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        status: a.status,
        moscow: a.moscow,
      };
      if (a.source) data.source = a.source;
      if (a.tags.length) data.tags = a.tags;
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
      if (a.created) data.created = a.created;
      return buildFile(data, buildUseCaseBody(a));
    }

    case "requirement": {
      const data: Record<string, unknown> = {
        id: a.id,
        title: a.title,
        status: a.status,
        trace: a.trace,
        format: "EARS",
        ears_pattern: a.ears,
        moscow: a.moscow,
      };
      if (a.created) data.created = a.created;
      return buildFile(data, a.body);
    }
  }
}

export function filenameFor(a: Artifact): string {
  return `${a.id}.md`;
}
