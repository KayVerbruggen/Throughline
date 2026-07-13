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

export type ArtifactKind =
  | "stakeholder"
  | "need"
  | "use-case"
  | "requirement"
  | "component"
  | "flow";

export type Status = "draft" | "approved" | "deprecated";

export type Moscow = "must" | "should" | "could" | "wont";

/**
 * Whether a stakeholder is a direct target of the design (primary) or an
 * indirectly-affected party (secondary). Purely descriptive — it drives the
 * badge shown next to a stakeholder, not any consistency rule.
 */
export type StakeholderType = "primary" | "secondary";

export const STAKEHOLDER_TYPES: StakeholderType[] = ["primary", "secondary"];

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

/**
 * A stakeholder in the design. Stakeholders are first-class artifacts (one
 * file each) so Needs can group under them and so a stakeholder's type and
 * description live in one place. Unlike the spine artifacts they carry no
 * status/MoSCoW — they're not prioritised, they're just who the design is for.
 */
export interface Stakeholder {
  kind: "stakeholder";
  /** e.g. "SH-001". Duplicated on disk so identity survives a rename. */
  id: string;
  /** The stakeholder's name — e.g. "Fleet Operator". */
  title: string;
  type: StakeholderType;
  /** Optional free-text description of who they are and what they care about. */
  body: string;
  created?: string;
}

export interface Need extends ArtifactBase {
  kind: "need";
  /**
   * ID of the Stakeholder who holds this need (e.g. "SH-001"), or "" if
   * unassigned. Resolved to a Stakeholder at render time for grouping.
   */
  stakeholder: string;
  source?: string;
  tags: string[];
  /** Optional free-text rationale / description. */
  body: string;
}

/** A user story authored in the fixed "As a / I want / so that" template. */
export interface UserStory {
  id: string;
  as_a: string;
  i_want: string;
  so_that: string;
}

export interface UseCase extends ArtifactBase {
  kind: "use-case";
  /** Parent Need IDs. Always an array. */
  trace: string[];
  actors: string[];
  stories: UserStory[];
  preconditions: string[];
  /**
   * Reference to the flow (behaviour) that implements this use case. The flow
   * itself lives in System Behaviour — a node-link diagram — which is a later
   * slice; for now this is just the linked flow's id (e.g. "FL-001"), or "".
   */
  flow: string;
}

export interface Requirement extends ArtifactBase {
  kind: "requirement";
  /** Parent Use Case IDs. Always an array. */
  trace: string[];
  format: "EARS";
  ears: EarsPattern;
  // Structured EARS slots. The full statement is composed from these
  // (see model/ears.ts) rather than authored as free text:
  //   [keyword] <condition>, the <subject> shall <action> <object> <constraint>
  /** Content of the WHEN/WHILE/IF/WHERE clause. Empty for ubiquitous. */
  condition: string;
  /** The subject that "shall" — e.g. "EVSE", "lock system". */
  subject: string;
  /** The required action / verb phrase — e.g. "begin energy delivery". */
  action: string;
  /** Optional object of the action — e.g. "the audit log". */
  object: string;
  /** Optional constraint — e.g. "within 5 seconds". */
  constraint: string;
}

// ---------------------------------------------------------------------------
// System Structure & Behavior
//
// A Component owns Activities. A Flow (the behaviour of one Use Case) is an
// ordered list of activity references plus alternate paths. Structure
// connections between components are NOT stored — they are derived from flow
// adjacency (see model/behavior.ts), which is the single consistency rule:
// two components are connected iff their activities run back-to-back in a flow.
// ---------------------------------------------------------------------------

/** A unit of behaviour performed by exactly one component. */
export interface Activity {
  /** e.g. "ACT-001". Project-wide unique so flows can reference it directly. */
  id: string;
  label: string;
}

export interface Component {
  kind: "component";
  /** e.g. "C-001". */
  id: string;
  title: string;
  /** Optional free-text description. */
  description: string;
  /** The activities this component is responsible for. */
  activities: Activity[];
  created?: string;
}

/**
 * An alternate path branching off the main flow. It diverges after main step
 * `after`, runs its own `steps`, then either rejoins the main flow at step
 * `rejoin`, or terminates the flow when `rejoin` is -1. Indices are 0-based
 * positions into the flow's `main` array.
 */
export interface AltPath {
  /** e.g. "AP-1", unique within its flow. */
  id: string;
  condition: string;
  after: number;
  rejoin: number;
  /** Activity ids, in order. */
  steps: string[];
}

export interface Flow {
  kind: "flow";
  /** e.g. "FL-001". Referenced by a Use Case via its `flow` field. */
  id: string;
  title: string;
  /** The happy-path activity ids, in order. */
  main: string[];
  alternates: AltPath[];
  created?: string;
}

export type Artifact =
  | Stakeholder
  | Need
  | UseCase
  | Requirement
  | Component
  | Flow;

/**
 * The prioritised spine artifacts (Need → Use Case → Requirement). Unlike
 * Stakeholder/Component/Flow these all carry status + MoSCoW, so code that
 * assumes those fields (e.g. the Traceability columns) should use this type.
 */
export type SpineArtifact = Need | UseCase | Requirement;

/** The whole in-memory project. */
export interface Project {
  stakeholders: Stakeholder[];
  needs: Need[];
  useCases: UseCase[];
  requirements: Requirement[];
  components: Component[];
  flows: Flow[];
}

export function emptyProject(): Project {
  return {
    stakeholders: [],
    needs: [],
    useCases: [],
    requirements: [],
    components: [],
    flows: [],
  };
}
