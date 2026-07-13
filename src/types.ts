// ---------------------------------------------------------------------------
// Core data model (first slice: Needs, Use Cases, Requirements, Traceability).
//
// These types are the source of truth for the app. They intentionally mirror
// the on-disk file schema (YAML frontmatter + markdown body) described in the
// project notes — NOT the Claude Design prototype's placeholder shapes.
//
// Trace links are forward-only: a child references its parent(s) in `trace`.
// Reverse lookups ("which requirements trace to this use case") are computed
// at render time (see model/trace.ts), never stored.
// ---------------------------------------------------------------------------

export type ArtifactKind = "need" | "use-case" | "requirement";

export type Status = "draft" | "approved" | "deprecated";

export type Moscow = "must" | "should" | "could" | "wont";

/** EARS requirement patterns. Canonical slugs per the project notes. */
export type EarsPattern =
  | "ubiquitous"
  | "event-driven"
  | "unwanted-behavior"
  | "state-driven"
  | "optional"
  | "complex";

export const EARS_PATTERNS: EarsPattern[] = [
  "ubiquitous",
  "event-driven",
  "unwanted-behavior",
  "state-driven",
  "optional",
  "complex",
];

export const STATUSES: Status[] = ["draft", "approved", "deprecated"];
export const MOSCOWS: Moscow[] = ["must", "should", "could", "wont"];

interface ArtifactBase {
  /** e.g. "N-001". Duplicated on disk so identity survives a file rename. */
  id: string;
  title: string;
  status: Status;
  moscow: Moscow;
  /** ISO date string (YYYY-MM-DD). */
  created?: string;
}

export interface Need extends ArtifactBase {
  kind: "need";
  source?: string;
  tags: string[];
  /** Markdown body: plain prose describing the need. */
  body: string;
}

export interface UserStory {
  id: string;
  as_a: string;
  i_want: string;
  so_that: string;
}

/** An alternate/error flow anchored to a step of the main flow. */
export interface AlternateFlow {
  /** Which main-flow step this branches from. */
  step: number;
  /** Free text, e.g. "if authorization is declined, the EVSE returns to Available…". */
  text: string;
}

export interface UseCase extends ArtifactBase {
  kind: "use-case";
  /** Parent Need IDs. Always an array. */
  trace: string[];
  actors: string[];
  stories: UserStory[];
  preconditions: string[];
  /** Ordered main-flow steps (from the "## Main flow" body section). */
  mainFlow: string[];
  /** Alternate/error flows (from the "## Alternate flows" body section). */
  altFlows: AlternateFlow[];
}

export interface Requirement extends ArtifactBase {
  kind: "requirement";
  /** Parent Use Case IDs. Always an array. */
  trace: string[];
  format: "EARS";
  ears: EarsPattern;
  /** Markdown body: the EARS statement itself. */
  body: string;
}

export type Artifact = Need | UseCase | Requirement;

/** The whole in-memory project. */
export interface Project {
  needs: Need[];
  useCases: UseCase[];
  requirements: Requirement[];
}

export function emptyProject(): Project {
  return { needs: [], useCases: [], requirements: [] };
}
