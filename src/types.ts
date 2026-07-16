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
  | "flow"
  | "decision"
  | "glossary"
  | "test";

export type Status = "draft" | "approved" | "deprecated";

/**
 * Lifecycle of a design decision. Unlike the spine artifacts a decision isn't
 * prioritised (MoSCoW) — it's a recorded choice — so it carries its own status
 * rather than reusing the draft/approved/deprecated ladder.
 */
export type DecisionStatus = "proposed" | "accepted" | "superseded";

export const DECISION_STATUSES: DecisionStatus[] = ["proposed", "accepted", "superseded"];

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
  /**
   * Marks an artifact as inferred / low-confidence — e.g. produced by
   * reverse-engineering and not yet confirmed by a human. Distinct from
   * `status` (a lifecycle stage): an artifact can be `approved` in status yet
   * still `inferred`, flagging it as "structure is plausible, please verify".
   * Absent/false means authored-and-trusted.
   */
  inferred?: boolean;
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
  /** Inferred / low-confidence — see ArtifactBase.inferred. */
  inferred?: boolean;
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
  /**
   * Optional precondition: a boolean guard over component variables that must
   * hold for the step to run (e.g. `chamber.vesselCount == 0`). The label
   * remains the human form; `pre` is the machine-readable one. (Stage 1.)
   */
  pre?: string;
  /**
   * Optional state effects applied when the activity runs, each an assignment
   * `head.name := value` (e.g. `upstreamGate.state := open`). Together these
   * make a flow a transition function over the state valuation. (Stage 1.)
   */
  effects?: string[];
  /**
   * Optional initiator of this activity, for the derived sequence diagram: the
   * id of the participant that *sends* the message triggering it — a Stakeholder
   * (an actor, e.g. the system engineer) or a Component. When absent the sender
   * defaults to the previous activity's owning component (a natural hand-off),
   * or the use case's primary actor for the first activity. The activity's own
   * owning component is always the *receiver*.
   */
  initiator?: string;
}

/**
 * The type of a component state variable. This is the small type universe the
 * behaviour expression language (see `model/expr`) understands — enough to
 * express and type-check guards like `chamber.vesselCount != 0`.
 */
export type VarType =
  | { kind: "bool" }
  | { kind: "int"; min?: number; max?: number }
  | { kind: "enum"; values: string[] };

/**
 * A typed piece of state owned by a component. Guards and (later) activity
 * effects are expressions over these variables, referenced as
 * `<componentHandle>.<name>` (e.g. `chamber.vesselCount`). This is the
 * foundation for making behaviour formal and executable.
 */
export interface Variable {
  /** e.g. "VAR-001". Project-wide unique so a guard survives relocation. */
  id: string;
  /** Identifier used in expressions, unique within its component (e.g. "vesselCount"). */
  name: string;
  type: VarType;
  /** Raw literal for the variable's starting value, used by the simulator (Stage 2). */
  initial?: string;
  /** Short prose gloss — what this variable means, for a reader who didn't
   *  author it (shown beside the name in the flow runner). */
  description?: string;
}

export interface Component {
  kind: "component";
  /** e.g. "C-001". */
  id: string;
  title: string;
  /**
   * Id of the component this one is a part of (composition/ownership), or "" if
   * it is top-level. This is the ONE structural relationship that is authored
   * and stored — unlike flow-derived connections, a component's place in the
   * system hierarchy can't be inferred from behaviour. Cycles and dangling
   * parents are tolerated on read (treated as top-level); the editor prevents
   * creating them.
   */
  parent: string;
  /** Optional free-text description. */
  description: string;
  /**
   * IDs of other components this one statically depends on ("uses" / imports /
   * calls) — a directed, authored relationship, distinct from the undirected
   * flow-derived connections. Unlike connections (which fall out of behaviour),
   * a static dependency such as "the Model Core uses the Storage Layer" exists
   * independently of any flow and so has to be recorded, not inferred. Self- and
   * dangling references are tolerated on read (dropped). Empty by default.
   */
  uses: string[];
  /** The activities this component is responsible for. */
  activities: Activity[];
  /** Typed state this component owns, referenced by behaviour expressions. */
  variables: Variable[];
  /**
   * IDs of the Design Decisions (e.g. "D-002") that shaped this component —
   * the "why it is the way it is". A forward link the component owns; the
   * decision doesn't list its components (that reverse view is computed).
   */
  decisions: string[];
  created?: string;
  /** Inferred / low-confidence — see ArtifactBase.inferred. */
  inferred?: boolean;
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
  /** Human-readable label for the branch, e.g. "the card is not recognised". */
  condition: string;
  /**
   * Optional machine-readable guard: a boolean expression over component
   * variables (e.g. `chamber.vesselCount != 0`) that formalises `condition`.
   * When present it type-checks against the model; `condition` remains the
   * display label. Absent for branches not yet formalised.
   */
  guard?: string;
  after: number;
  rejoin: number;
  /** Step ids, in order — activity ids or subflow invokes, like `Flow.main`. */
  steps: string[];
}

export interface Flow {
  kind: "flow";
  /** e.g. "FL-001". Referenced by a Use Case via its `flow` field. */
  id: string;
  title: string;
  /**
   * The happy-path steps, in order. Each entry is normally an activity id
   * (`ACT-xxx`), but may instead be a *flow* id (`FL-xxx`), meaning "invoke
   * that flow here" — a subflow / call into another use case's behaviour,
   * reused inline (see `model/subflow.ts`). The id prefix discriminates, so
   * this needs no schema change. "" is an unassigned slot.
   */
  main: string[];
  alternates: AltPath[];
  created?: string;
  /** Inferred / low-confidence — see ArtifactBase.inferred. */
  inferred?: boolean;
}

/**
 * A recorded design decision, authored in a fixed "Y-statement" template so
 * every decision reads the same way and the rationale (including what was
 * rejected and the accepted downside) is captured, not just the choice:
 *
 *   In the <context>, facing <concern>, we decided <decision> and not
 *   <alternatives> to achieve <criterion>, accepting <downside>.
 *
 * The full sentence is composed from these slots (see model/decision.ts),
 * never hand-typed — the same generated-body approach as EARS requirements.
 * Decisions trace to the Use Cases they address; components link back to them.
 */
export interface Decision {
  kind: "decision";
  /** e.g. "D-001". Duplicated on disk so identity survives a rename. */
  id: string;
  title: string;
  status: DecisionStatus;
  /** Use Case IDs this decision addresses. Always an array. */
  trace: string[];
  /** The situation / where we are — "In the <context>". */
  context: string;
  /** The problem or force at play — "facing <concern>". */
  concern: string;
  /** The choice made — "we decided <decision>". */
  decision: string;
  /** Rejected options — "and not <alternatives>". Optional. */
  alternatives: string;
  /** The goal the choice serves — "to achieve <criterion>". */
  criterion: string;
  /** The cost knowingly taken on — "accepting <downside>". Optional. */
  downside: string;
  created?: string;
  /** Inferred / low-confidence — see ArtifactBase.inferred. */
  inferred?: boolean;
}

/**
 * A domain-glossary term: the shared vocabulary of the project. Kept as
 * first-class artifacts (one file each) so definitions live in one place and
 * other artifacts' prose can lean on precise terms instead of restating them.
 * The title is the term; the definition is the markdown body.
 */
export interface Term {
  kind: "glossary";
  /** e.g. "G-001". */
  id: string;
  /** The term being defined — e.g. "Structure connection". */
  title: string;
  /** Synonyms / abbreviations that mean the same thing. */
  aliases: string[];
  /** The definition (markdown body). */
  definition: string;
  created?: string;
  /** Inferred / low-confidence — see ArtifactBase.inferred. */
  inferred?: boolean;
}

/**
 * The last-known outcome of a test. Unlike the spine's `status` lifecycle this
 * is a factual result an author or CI records into the file — the tool itself
 * doesn't run the test, it stores what was reported. `unknown` means not yet run
 * (or the result hasn't been recorded).
 */
export type TestResult = "pass" | "fail" | "unknown";

export const TEST_RESULTS: TestResult[] = ["pass", "fail", "unknown"];

/**
 * A verification that a requirement holds. Tests are the leaf of the trace
 * spine — they cover requirements the way requirements cover use cases — so a
 * requirement with no test is unverified and a test with no trace is orphaned.
 *
 * Like Component/Decision, a Test is lean: no MoSCoW/status lifecycle. It just
 * carries where it lives (`file`), its latest `result`, and a forward trace to
 * the requirement(s) it verifies. The description is the markdown body.
 */
export interface Test {
  kind: "test";
  /** e.g. "T-001". Duplicated on disk so identity survives a rename. */
  id: string;
  title: string;
  /** Requirement IDs this test covers. Always an array (forward trace). */
  trace: string[];
  /** Where the test lives, e.g. "src/model/trace.test.ts". "" if not located. */
  file: string;
  /** Latest known outcome. Recorded by an author or CI; the tool never runs it. */
  result: TestResult;
  /** What the test checks (markdown body). */
  body: string;
  created?: string;
  /** Inferred / low-confidence — see ArtifactBase.inferred. */
  inferred?: boolean;
}

export type Artifact =
  | Stakeholder
  | Need
  | UseCase
  | Requirement
  | Component
  | Flow
  | Decision
  | Term
  | Test;

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
  decisions: Decision[];
  glossary: Term[];
  tests: Test[];
}

export function emptyProject(): Project {
  return {
    stakeholders: [],
    needs: [],
    useCases: [],
    requirements: [],
    components: [],
    flows: [],
    decisions: [],
    glossary: [],
    tests: [],
  };
}
