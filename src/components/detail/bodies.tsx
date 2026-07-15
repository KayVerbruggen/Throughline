import { useMemo, useState, type ReactNode } from "react";

import { resolveActor } from "../../model/actors";
import { composeDecision, componentsForDecision } from "../../model/decision";
import { composeEars, EARS_META } from "../../model/ears";
import { componentHandle } from "../../model/expr";
import { descendantIds } from "../../model/hierarchy";
import { nextStoryId, nextVariableId } from "../../model/ids";
import { collectRoles, collectSubjects } from "../../model/vocab";
import { useStore } from "../../state/store";
import {
  activityLabel,
  componentOfActivity,
  requirementsForComponent,
  useCaseOfFlow,
  useCasesForComponent,
} from "../../model/behavior";
import {
  DECISION_STATUSES,
  EARS_PATTERNS,
  STAKEHOLDER_TYPES,
  type Component,
  type Decision,
  type DecisionStatus,
  type EarsPattern,
  type Flow,
  type Need,
  type Requirement,
  type Stakeholder,
  type StakeholderType,
  TEST_RESULTS,
  type Term,
  type Test,
  type TestResult,
  type UseCase,
  type UserStory,
  type VarType,
  type Variable,
} from "../../types";
import { DecisionStatusBadge, EARS_LABEL } from "../badges";
import { Icon, type IconName } from "../icons";
import { useConfirm } from "../useConfirm";
import { Combobox, FieldLabel, Section, Select, TextArea, TextInput } from "./fields";

type Update<T> = (patch: Partial<T>) => void;

const STAKEHOLDER_TYPE_LABEL: Record<StakeholderType, string> = {
  primary: "Primary",
  secondary: "Secondary",
};

// ===========================================================================
// Stakeholder
// ===========================================================================

export function StakeholderBody({
  stakeholder,
  update,
}: {
  stakeholder: Stakeholder;
  update: Update<Stakeholder>;
}) {
  return (
    <>
      <Section>
        <FieldLabel>Type</FieldLabel>
        <Select<StakeholderType>
          value={stakeholder.type}
          onChange={(v) => update({ type: v })}
          options={STAKEHOLDER_TYPES.map((t) => ({ value: t, label: STAKEHOLDER_TYPE_LABEL[t] }))}
        />
      </Section>
      <Section mb={0}>
        <FieldLabel hint="(optional)">Description</FieldLabel>
        <TextArea value={stakeholder.body} rows={6} onChange={(v) => update({ body: v })} />
      </Section>
    </>
  );
}

// ===========================================================================
// Need
// ===========================================================================

export function NeedBody({ need, update }: { need: Need; update: Update<Need> }) {
  const project = useStore((s) => s.project);
  const stakeholderOptions = useMemo(
    () => [
      { value: "", label: "— Unassigned —" },
      ...project.stakeholders.map((s) => ({ value: s.id, label: s.title })),
    ],
    [project.stakeholders],
  );
  return (
    <>
      <Section>
        <FieldLabel>Stakeholder</FieldLabel>
        <Select<string>
          value={need.stakeholder}
          onChange={(v) => update({ stakeholder: v })}
          options={stakeholderOptions}
        />
      </Section>
      <Section>
        <FieldLabel>Source</FieldLabel>
        <TextInput
          value={need.source ?? ""}
          placeholder="e.g. Customer interview, Acme Corp"
          onChange={(v) => update({ source: v })}
        />
      </Section>
      <Section mb={22}>
        <FieldLabel hint="(comma separated)">Tags</FieldLabel>
        <TextInput
          mono
          value={need.tags.join(", ")}
          placeholder="reliability, driver-ux"
          onChange={(v) => update({ tags: splitList(v) })}
        />
      </Section>
      <Section mb={0}>
        <FieldLabel hint="(optional)">Rationale</FieldLabel>
        <TextArea value={need.body} rows={5} onChange={(v) => update({ body: v })} />
      </Section>
    </>
  );
}

// ===========================================================================
// Use Case
// ===========================================================================

export function UseCaseBody({
  uc,
  update,
  onOpenNeed,
}: {
  uc: UseCase;
  update: Update<UseCase>;
  onOpenNeed: (id: string) => void;
}) {
  const project = useStore((s) => s.project);
  const roles = useMemo(() => collectRoles(project), [project]);

  return (
    <>
      <Section>
        <FieldLabel hint="(the needs this covers)">Traces to</FieldLabel>
        <TraceEditor
          trace={uc.trace}
          candidates={project.needs}
          icon="need"
          emptyLabel="Covers no need yet."
          onOpen={onOpenNeed}
          onChange={(trace) => update({ trace })}
        />
      </Section>

      <Section>
        <FieldLabel hint="(pick a stakeholder or type a name)">Actors</FieldLabel>
        <ActorEditor values={uc.actors} onChange={(actors) => update({ actors })} />
      </Section>

      <Section>
        <FieldLabel>Preconditions</FieldLabel>
        <TextListEditor
          values={uc.preconditions}
          placeholder="a condition that must hold before the flow starts"
          addLabel="Add precondition"
          onChange={(preconditions) => update({ preconditions })}
        />
      </Section>

      <Section mb={22}>
        <FieldLabel>Flow</FieldLabel>
        <FlowLink flow={uc.flow} onChange={(flow) => update({ flow })} />
      </Section>

      <Section mb={0}>
        <FieldLabel>User stories</FieldLabel>
        <StoryEditor
          stories={uc.stories}
          roles={roles}
          onChange={(stories) => update({ stories })}
        />
      </Section>
    </>
  );
}

// ===========================================================================
// Requirement — structured EARS builder
// ===========================================================================

const EARS_KEYWORDS = new Set(["WHEN", "WHILE", "IF", "THEN", "WHERE", "SHALL", "shall", "AND", "OR"]);

export function RequirementBody({
  req,
  update,
  onOpenUseCase,
}: {
  req: Requirement;
  update: Update<Requirement>;
  onOpenUseCase: (id: string) => void;
}) {
  const project = useStore((s) => s.project);
  const subjects = useMemo(() => collectSubjects(project), [project]);
  const meta = EARS_META[req.ears];
  const orphan = req.trace.length === 0;

  return (
    <>
      <Section mb={14}>
        <FieldLabel>EARS pattern</FieldLabel>
        <Select<EarsPattern>
          value={req.ears}
          onChange={(v) => update({ ears: v })}
          options={EARS_PATTERNS.map((p) => ({ value: p, label: EARS_LABEL[p] }))}
        />
        <div style={{ font: "400 11.5px/1.4 'IBM Plex Sans'", color: "var(--ter)", marginTop: 6 }}>
          {meta.blurb}
        </div>
      </Section>

      {/* live preview of the generated statement */}
      <div style={{ background: "var(--code-bg)", borderRadius: 11, padding: "17px 18px", marginBottom: 18 }}>
        <div
          style={{
            font: "500 9.5px 'IBM Plex Mono'",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "oklch(0.72 0.07 258)",
            marginBottom: 10,
          }}
        >
          {EARS_LABEL[req.ears]} requirement
        </div>
        <div style={{ font: "400 15.5px/1.6 'IBM Plex Mono'", textWrap: "pretty" }}>
          {composeEars(req)
            .split(/(\s+)/)
            .map((t, i) => (
              <span
                key={i}
                style={
                  EARS_KEYWORDS.has(t.replace(/[.,;:]/g, ""))
                    ? { color: "oklch(0.83 0.13 88)", fontWeight: 500 }
                    : { color: "#e9e9e6" }
                }
              >
                {t}
              </span>
            ))}
        </div>
      </div>

      {meta.hasCondition && (
        <Section>
          <FieldLabel>{meta.conditionLabel}</FieldLabel>
          <TextInput
            value={req.condition}
            placeholder={meta.conditionPlaceholder}
            onChange={(v) => update({ condition: v })}
          />
        </Section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <div>
          <FieldLabel hint="(the … shall)">Subject</FieldLabel>
          <Combobox
            value={req.subject}
            onChange={(v) => update({ subject: v })}
            options={subjects}
            placeholder="system"
          />
        </div>
        <div>
          <FieldLabel>Action</FieldLabel>
          <TextInput
            value={req.action}
            placeholder="begin energy delivery"
            onChange={(v) => update({ action: v })}
          />
        </div>
        <div>
          <FieldLabel hint="(optional)">Object</FieldLabel>
          <TextInput
            value={req.object}
            placeholder="to the vehicle"
            onChange={(v) => update({ object: v })}
          />
        </div>
        <div>
          <FieldLabel hint="(optional)">Constraint</FieldLabel>
          <TextInput
            value={req.constraint}
            placeholder="within 5 seconds"
            onChange={(v) => update({ constraint: v })}
          />
        </div>
      </div>

      <Section mb={0}>
        <FieldLabel hint="(the use cases this refines)">Traces to</FieldLabel>
        <TraceEditor
          trace={req.trace}
          candidates={project.useCases}
          icon="use-case"
          emptyLabel="Not linked to any use case yet."
          onOpen={onOpenUseCase}
          onChange={(trace) => update({ trace })}
        />
        {orphan ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              padding: "10px 12px",
              border: "1px solid var(--warn-border)",
              background: "var(--warn-bg)",
              borderRadius: 9,
              font: "400 12.5px/1.5 'IBM Plex Sans'",
              color: "var(--warn-ink)",
            }}
          >
            <span style={{ display: "flex" }}>
              <Icon name="warn" size={15} color="var(--warn-ink)" />
            </span>
            Not linked to any use case. Trace this requirement to keep the chain intact.
          </div>
        ) : null}
      </Section>
    </>
  );
}

// ===========================================================================
// Component
// ===========================================================================

export function ComponentBody({
  component,
  update,
  onOpenUseCase,
  onOpenRequirement,
  onOpenDecision,
  onOpenComponent,
}: {
  component: Component;
  update: Update<Component>;
  onOpenUseCase: (id: string) => void;
  onOpenRequirement: (id: string) => void;
  onOpenDecision: (id: string) => void;
  onOpenComponent: (id: string) => void;
}) {
  const project = useStore((s) => s.project);
  const ucs = useMemo(() => useCasesForComponent(project, component), [project, component]);
  const reqs = useMemo(() => requirementsForComponent(project, component), [project, component]);

  // A component may be nested under any other, except itself or one of its own
  // descendants (which would form a cycle in the hierarchy).
  const parentOptions = useMemo(() => {
    const banned = descendantIds(project, component.id);
    banned.add(component.id);
    return [
      { value: "", label: "— Top-level —" },
      ...project.components
        .filter((c) => !banned.has(c.id))
        .map((c) => ({ value: c.id, label: `${c.id} · ${c.title}` })),
    ];
  }, [project, component.id]);

  return (
    <>
      <Section mb={22}>
        <FieldLabel hint="(its place in the hierarchy)">Part of</FieldLabel>
        <Select<string>
          value={component.parent}
          onChange={(v) => update({ parent: v })}
          options={parentOptions}
        />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(static dependencies — uses / imports / calls)">Depends on</FieldLabel>
        <TraceEditor
          trace={component.uses}
          candidates={project.components.filter((c) => c.id !== component.id)}
          icon="structure"
          emptyLabel="No static dependencies declared yet."
          onOpen={onOpenComponent}
          onChange={(uses) => update({ uses })}
        />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(optional)">Description</FieldLabel>
        <TextArea value={component.description} rows={4} onChange={(v) => update({ description: v })} />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(the rationale behind it)">Shaped by decisions</FieldLabel>
        <TraceEditor
          trace={component.decisions}
          candidates={project.decisions}
          icon="decision"
          emptyLabel="No design decisions linked yet."
          onOpen={onOpenDecision}
          onChange={(decisions) => update({ decisions })}
        />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(typed state for behaviour guards)">State variables</FieldLabel>
        <VariablesEditor
          variables={component.variables}
          handle={componentHandle(component.title) || component.id}
          newId={() => nextVariableId(project)}
          onChange={(variables) => update({ variables })}
        />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(edit the sequence in System Behavior)">Activities</FieldLabel>
        {component.activities.length === 0 ? (
          <Muted>No activities yet — add one from a flow in System Behavior.</Muted>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {component.activities.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 11px",
                  border: "1px solid rgba(var(--line),.09)",
                  borderRadius: 8,
                  background: "var(--surface2)",
                }}
              >
                <span style={{ font: "500 10px 'IBM Plex Mono'", color: "var(--ter)" }}>{a.id}</span>
                <span style={{ font: "400 13px 'IBM Plex Sans'", color: "var(--ink)" }}>
                  {a.label || <span style={{ color: "var(--faint)" }}>(unnamed)</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(flows this component acts in)">Use cases</FieldLabel>
        {ucs.length === 0 ? (
          <Muted>Not part of any flow yet.</Muted>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ucs.map((u) => (
              <Chip key={u.id} id={u.id} icon="use-case" onClick={() => onOpenUseCase(u.id)} />
            ))}
          </div>
        )}
      </Section>

      <Section mb={0}>
        <FieldLabel hint="(via the use cases above)">Requirements</FieldLabel>
        {reqs.length === 0 ? (
          <Muted>No requirements trace through this component yet.</Muted>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {reqs.map((r) => (
              <Chip key={r.id} id={r.id} icon="requirement" onClick={() => onOpenRequirement(r.id)} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ===========================================================================
// Flow (read-only summary — the flow is edited in the System Behavior view)
// ===========================================================================

export function FlowBody({ flow, onOpenUseCase }: { flow: Flow; onOpenUseCase: (id: string) => void }) {
  const project = useStore((s) => s.project);
  const setView = useStore((s) => s.setView);
  const uc = useMemo(() => useCaseOfFlow(project, flow), [project, flow]);

  return (
    <>
      <Section>
        <FieldLabel>Implements use case</FieldLabel>
        {uc ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Chip id={`${uc.id} · ${uc.title}`} icon="use-case" onClick={() => onOpenUseCase(uc.id)} />
          </div>
        ) : (
          <Muted>Not linked to a use case.</Muted>
        )}
      </Section>

      <Section>
        <FieldLabel>Main flow</FieldLabel>
        {flow.main.length === 0 ? (
          <Muted>No activities yet.</Muted>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {flow.main.map((actId, i) => {
              const comp = componentOfActivity(project, actId);
              return (
                <div
                  key={`${actId}-${i}`}
                  style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0" }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: "var(--accent-bg)",
                      color: "var(--accent-ink)",
                      font: "500 11px 'IBM Plex Mono'",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ font: "400 13px 'IBM Plex Sans'", color: "var(--ink)" }}>
                    {activityLabel(project, actId) || (
                      <span style={{ color: "var(--faint)" }}>(unnamed)</span>
                    )}
                  </span>
                  {comp ? (
                    <span
                      style={{
                        font: "500 10px 'IBM Plex Mono'",
                        color: "var(--sub)",
                        background: "rgba(var(--line),.05)",
                        padding: "2px 6px",
                        borderRadius: 5,
                      }}
                    >
                      {comp.title}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {flow.alternates.length > 0 && (
        <Section>
          <FieldLabel>Alternate paths</FieldLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {flow.alternates.map((alt) => (
              <div
                key={alt.id}
                style={{
                  padding: "10px 13px",
                  border: "1px solid rgba(var(--line),.09)",
                  borderLeft: "2px solid oklch(0.62 0.13 70)",
                  borderRadius: "0 8px 8px 0",
                  background: "var(--surface2)",
                }}
              >
                <div
                  style={{
                    font: "500 10.5px 'IBM Plex Mono'",
                    letterSpacing: ".05em",
                    color: "oklch(0.52 0.11 62)",
                    marginBottom: 4,
                  }}
                >
                  AFTER STEP {alt.after + 1}
                </div>
                <div style={{ font: "400 13px/1.5 'IBM Plex Sans'", color: "var(--ink)" }}>
                  If {alt.condition || "…"} — {alt.steps.length} step
                  {alt.steps.length === 1 ? "" : "s"}
                  {alt.rejoin >= 0 ? `, rejoins at step ${alt.rejoin + 1}` : ", ends the flow"}
                </div>
                {alt.guard ? (
                  <div
                    style={{
                      marginTop: 4,
                      font: "400 11.5px 'IBM Plex Mono'",
                      color: "oklch(0.52 0.11 62)",
                    }}
                  >
                    ƒ {alt.guard}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section mb={0}>
        <button
          onClick={() => setView("behavior")}
          style={{
            padding: "8px 12px",
            border: "1px solid rgba(var(--line),.14)",
            borderRadius: 8,
            background: "var(--surface)",
            color: "var(--accent-ink)",
            font: "500 12.5px 'IBM Plex Sans'",
            cursor: "pointer",
          }}
        >
          Edit in System Behavior →
        </button>
      </Section>
    </>
  );
}

// ===========================================================================
// Decision — structured "Y-statement" builder
// ===========================================================================

const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  superseded: "Superseded",
};

// Connective words emphasised in the live statement preview so the fixed
// template reads clearly against the authored slots.
const DECISION_KEYWORDS = new Set(["facing", "decided", "not", "achieve", "accepting"]);

export function DecisionBody({
  decision,
  update,
  onOpenUseCase,
  onOpenComponent,
}: {
  decision: Decision;
  update: Update<Decision>;
  onOpenUseCase: (id: string) => void;
  onOpenComponent: (id: string) => void;
}) {
  const project = useStore((s) => s.project);
  const citedBy = useMemo(
    () => componentsForDecision(project, decision.id),
    [project, decision.id],
  );

  return (
    <>
      <Section mb={16}>
        <FieldLabel>Status</FieldLabel>
        <Select<DecisionStatus>
          value={decision.status}
          onChange={(v) => update({ status: v })}
          options={DECISION_STATUSES.map((s) => ({ value: s, label: DECISION_STATUS_LABEL[s] }))}
        />
      </Section>

      {/* live preview of the generated statement */}
      <div style={{ background: "var(--code-bg)", borderRadius: 11, padding: "17px 18px", marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              font: "500 9.5px 'IBM Plex Mono'",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "oklch(0.72 0.07 258)",
            }}
          >
            Decision record
          </span>
          <DecisionStatusBadge status={decision.status} />
        </div>
        <div style={{ font: "400 15.5px/1.6 'IBM Plex Mono'", textWrap: "pretty" }}>
          {composeDecision(decision)
            .split(/(\s+)/)
            .map((t, i) => (
              <span
                key={i}
                style={
                  DECISION_KEYWORDS.has(t.replace(/[.,;:]/g, "").toLowerCase())
                    ? { color: "oklch(0.83 0.13 88)", fontWeight: 500 }
                    : { color: "#e9e9e6" }
                }
              >
                {t}
              </span>
            ))}
        </div>
      </div>

      <Section>
        <FieldLabel hint="(In the … — the situation)">Context</FieldLabel>
        <TextArea
          value={decision.context}
          rows={2}
          onChange={(v) => update({ context: v })}
        />
      </Section>

      <Section>
        <FieldLabel hint="(facing … — the problem or force)">Concern</FieldLabel>
        <TextArea value={decision.concern} rows={2} onChange={(v) => update({ concern: v })} />
      </Section>

      <Section>
        <FieldLabel hint="(we decided … — the choice)">Decision</FieldLabel>
        <TextArea value={decision.decision} rows={2} onChange={(v) => update({ decision: v })} />
      </Section>

      <Section>
        <FieldLabel hint="(and not … — rejected options, optional)">Alternatives</FieldLabel>
        <TextArea
          value={decision.alternatives}
          rows={2}
          onChange={(v) => update({ alternatives: v })}
        />
      </Section>

      <Section>
        <FieldLabel hint="(to achieve … — the goal)">Criterion</FieldLabel>
        <TextArea value={decision.criterion} rows={2} onChange={(v) => update({ criterion: v })} />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(accepting … — the downside, optional)">Trade-off</FieldLabel>
        <TextArea value={decision.downside} rows={2} onChange={(v) => update({ downside: v })} />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(the use cases this addresses)">Addresses</FieldLabel>
        <TraceEditor
          trace={decision.trace}
          candidates={project.useCases}
          icon="use-case"
          emptyLabel="Not linked to any use case yet."
          onOpen={onOpenUseCase}
          onChange={(trace) => update({ trace })}
        />
      </Section>

      <Section mb={0}>
        <FieldLabel hint="(components that link to this decision)">Shapes</FieldLabel>
        {citedBy.length === 0 ? (
          <Muted>No component links to this decision yet.</Muted>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {citedBy.map((c) => (
              <Chip key={c.id} id={c.id} icon="structure" onClick={() => onOpenComponent(c.id)} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ===========================================================================
// Glossary term
// ===========================================================================

export function GlossaryBody({ term, update }: { term: Term; update: Update<Term> }) {
  return (
    <>
      <Section mb={22}>
        <FieldLabel hint="(comma separated synonyms / abbreviations)">Also known as</FieldLabel>
        <TextInput
          mono
          value={term.aliases.join(", ")}
          placeholder="e.g. connection, edge"
          onChange={(v) => update({ aliases: splitList(v) })}
        />
      </Section>
      <Section mb={0}>
        <FieldLabel>Definition</FieldLabel>
        <TextArea value={term.definition} rows={7} onChange={(v) => update({ definition: v })} />
      </Section>
    </>
  );
}

// ===========================================================================
// Test — verifies a requirement
// ===========================================================================

const TEST_RESULT_LABEL: Record<TestResult, string> = {
  pass: "Passing",
  fail: "Failing",
  unknown: "Not run",
};

export function TestBody({
  test,
  update,
  onOpenRequirement,
}: {
  test: Test;
  update: Update<Test>;
  onOpenRequirement: (id: string) => void;
}) {
  const project = useStore((s) => s.project);
  const orphan = test.trace.length === 0;

  return (
    <>
      <Section mb={16}>
        <FieldLabel hint="(the last recorded outcome)">Result</FieldLabel>
        <Select<TestResult>
          value={test.result}
          onChange={(v) => update({ result: v })}
          options={TEST_RESULTS.map((r) => ({ value: r, label: TEST_RESULT_LABEL[r] }))}
        />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(path to the test in the repo)">File</FieldLabel>
        <TextInput
          mono
          value={test.file}
          placeholder="src/model/trace.test.ts"
          onChange={(v) => update({ file: v })}
        />
      </Section>

      <Section mb={22}>
        <FieldLabel hint="(what it checks)">Description</FieldLabel>
        <TextArea value={test.body} rows={4} onChange={(v) => update({ body: v })} />
      </Section>

      <Section mb={0}>
        <FieldLabel hint="(the requirements this verifies)">Traces to</FieldLabel>
        <TraceEditor
          trace={test.trace}
          candidates={project.requirements}
          icon="requirement"
          emptyLabel="Verifies no requirement yet."
          onOpen={onOpenRequirement}
          onChange={(trace) => update({ trace })}
        />
        {orphan ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              padding: "10px 12px",
              border: "1px solid var(--warn-border)",
              background: "var(--warn-bg)",
              borderRadius: 9,
              font: "400 12.5px/1.5 'IBM Plex Sans'",
              color: "var(--warn-ink)",
            }}
          >
            <span style={{ display: "flex" }}>
              <Icon name="warn" size={15} color="var(--warn-ink)" />
            </span>
            Not linked to any requirement. Trace this test so it verifies something.
          </div>
        ) : null}
      </Section>
    </>
  );
}

// ===========================================================================
// Reusable list editors
// ===========================================================================

/**
 * Actor editor for use cases — stakeholder-aware. Each actor entry is resolved
 * (by stakeholder id or title): a stakeholder-backed actor shows a person glyph
 * and is clickable to open that stakeholder, while a free-text actor renders
 * plain. The picker suggests stakeholders first (so actors become traceable
 * lifelines in the sequence diagram) but still accepts a typed name.
 */
function ActorEditor({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const [draft, setDraft] = useState("");

  const resolved = values.map((v) => ({ raw: v, ...resolveActor(project, v) }));
  const addedIds = new Set(resolved.map((r) => r.id));
  // Stakeholders not already added, offered as first-class picks.
  const stakeholderOptions = project.stakeholders
    .filter((s) => !addedIds.has(s.id))
    .map((s) => s.title);

  const add = (value?: string) => {
    const v = (value ?? draft).trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };

  return (
    <div>
      {resolved.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {resolved.map((r) => {
            const linked = !!r.stakeholder;
            return (
              <span
                key={r.raw}
                title={linked ? `Stakeholder ${r.stakeholder!.id} — click to open` : "Free-text actor"}
                onClick={linked ? () => select("stakeholder", r.stakeholder!.id) : undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  font: "400 12.5px 'IBM Plex Sans'",
                  color: linked ? "var(--accent-ink)" : "var(--sub)",
                  background: linked ? "var(--accent-bg)" : "rgba(var(--line),.05)",
                  border: `1px solid ${linked ? "var(--accent)" : "transparent"}`,
                  padding: "3px 6px 3px 9px",
                  borderRadius: 20,
                  cursor: linked ? "pointer" : "default",
                }}
              >
                {linked ? (
                  <span style={{ display: "flex", color: "var(--accent-ink)" }}>
                    <Icon name="stakeholder" size={12} />
                  </span>
                ) : null}
                {r.label}
                <RemoveButton onClick={() => onChange(values.filter((x) => x !== r.raw))} />
              </span>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Combobox
            value={draft}
            onChange={setDraft}
            options={stakeholderOptions}
            placeholder="pick a stakeholder or type a name…"
          />
        </div>
        <AddButton onClick={() => add()} disabled={!draft.trim()}>
          Add
        </AddButton>
      </div>
    </div>
  );
}

function TextListEditor({
  values,
  onChange,
  ordered,
  placeholder,
  addLabel,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  ordered?: boolean;
  placeholder?: string;
  addLabel: string;
}) {
  const set = (i: number, v: string) => onChange(values.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange(values.filter((_, j) => j !== i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {ordered && (
            <span
              style={{
                flex: "none",
                width: 23,
                height: 23,
                borderRadius: 6,
                background: "var(--accent-bg)",
                color: "var(--accent-ink)",
                font: "500 12px 'IBM Plex Mono'",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i + 1}
            </span>
          )}
          <div style={{ flex: 1 }}>
            <TextInput value={v} placeholder={placeholder} onChange={(nv) => set(i, nv)} />
          </div>
          <RemoveButton onClick={() => remove(i)} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...values, ""])} inline>
        + {addLabel}
      </AddButton>
    </div>
  );
}

/**
 * The flow that implements a use case is a behaviour artifact (a node-link
 * diagram) — a later slice. For now the use case just references it; this
 * shows the link and a placeholder for the diagram to come.
 */
function FlowLink({ flow, onChange }: { flow: string; onChange: (v: string) => void }) {
  return (
    <div
      style={{
        border: "1px dashed rgba(var(--line),.2)",
        borderRadius: 10,
        padding: 14,
        background: "var(--surface2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 34,
            height: 34,
            flex: "none",
            borderRadius: 8,
            background: "var(--surface)",
            border: "1px solid rgba(var(--line),.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-ink)",
          }}
        >
          <Icon name="behavior" size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "500 13px 'IBM Plex Sans'", color: "var(--ink)" }}>
            Implemented by a flow
          </div>
          <div style={{ font: "400 11.5px/1.4 'IBM Plex Sans'", color: "var(--ter)" }}>
            A node-link diagram, modelled in System Behavior
            <span
              style={{
                marginLeft: 6,
                font: "500 8.5px 'IBM Plex Mono'",
                letterSpacing: ".09em",
                textTransform: "uppercase",
                color: "var(--ter)",
              }}
            >
              soon
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            font: "500 10px 'IBM Plex Mono'",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--ter)",
          }}
        >
          Flow ref
        </span>
        <div style={{ width: 150 }}>
          <TextInput mono value={flow} placeholder="FL-001" onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

function StoryEditor({
  stories,
  roles,
  onChange,
}: {
  stories: UserStory[];
  roles: string[];
  onChange: (v: UserStory[]) => void;
}) {
  const set = (i: number, patch: Partial<UserStory>) =>
    onChange(stories.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () =>
    onChange([
      ...stories,
      { id: nextStoryId(stories.map((s) => s.id)), as_a: "", i_want: "", so_that: "" },
    ]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {stories.map((st, i) => (
        <div
          key={st.id}
          style={{
            border: "1px solid rgba(var(--line),.09)",
            borderRadius: 10,
            padding: "12px 13px",
            background: "var(--surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ font: "500 10px 'IBM Plex Mono'", color: "var(--ter)" }}>{st.id}</span>
            <div style={{ flex: 1 }} />
            <RemoveButton onClick={() => onChange(stories.filter((_, j) => j !== i))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "62px 1fr", gap: "8px 10px", alignItems: "center" }}>
            <StoryLabel>As a</StoryLabel>
            <Combobox value={st.as_a} onChange={(v) => set(i, { as_a: v })} options={roles} placeholder="role" />
            <StoryLabel>I want</StoryLabel>
            <TextInput value={st.i_want} onChange={(v) => set(i, { i_want: v })} placeholder="to …" />
            <StoryLabel>so that</StoryLabel>
            <TextInput value={st.so_that} onChange={(v) => set(i, { so_that: v })} placeholder="…" />
          </div>
        </div>
      ))}
      <AddButton onClick={add} inline>
        + Add user story
      </AddButton>
    </div>
  );
}

// ===========================================================================
// Component state variables
// ===========================================================================

const VAR_TYPE_OPTIONS: { value: VarType["kind"]; label: string }[] = [
  { value: "bool", label: "Boolean" },
  { value: "int", label: "Integer" },
  { value: "enum", label: "Enum" },
];

function VariablesEditor({
  variables,
  handle,
  newId,
  onChange,
}: {
  variables: Variable[];
  handle: string;
  newId: () => string;
  onChange: (v: Variable[]) => void;
}) {
  const set = (i: number, patch: Partial<Variable>) =>
    onChange(variables.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const setKind = (i: number, kind: VarType["kind"]) => {
    const type: VarType =
      kind === "int" ? { kind: "int" } : kind === "enum" ? { kind: "enum", values: [] } : { kind: "bool" };
    set(i, { type });
  };

  const add = () =>
    onChange([...variables, { id: newId(), name: "", type: { kind: "bool" } }]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {variables.length === 0 && (
        <Muted>No state yet. Add a variable (e.g. vesselCount) to write guards over it.</Muted>
      )}
      {variables.map((v, i) => (
        <div
          key={v.id}
          style={{
            border: "1px solid rgba(var(--line),.09)",
            borderRadius: 9,
            padding: "11px 12px",
            background: "var(--surface2)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <TextInput
                mono
                value={v.name}
                placeholder="variableName"
                onChange={(name) => set(i, { name })}
              />
            </div>
            <div style={{ width: 118, flex: "none" }}>
              <Select<VarType["kind"]>
                value={v.type.kind}
                onChange={(k) => setKind(i, k)}
                options={VAR_TYPE_OPTIONS}
              />
            </div>
            <RemoveButton onClick={() => onChange(variables.filter((_, j) => j !== i))} />
          </div>

          {v.type.kind === "enum" && (
            <TextInput
              mono
              value={v.type.values.join(", ")}
              placeholder="values, e.g. open, closed"
              onChange={(raw) =>
                set(i, { type: { kind: "enum", values: splitList(raw) } })
              }
            />
          )}

          <TextInput
            value={v.description ?? ""}
            placeholder="What does this variable mean? (shown in the flow runner)"
            onChange={(raw) => set(i, { description: raw.trim() ? raw : undefined })}
          />

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                font: "500 9.5px 'IBM Plex Mono'",
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--ter)",
                whiteSpace: "nowrap",
              }}
            >
              Initial
            </span>
            <div style={{ width: 130 }}>
              <TextInput
                mono
                value={v.initial ?? ""}
                placeholder={initialPlaceholder(v.type)}
                onChange={(raw) => set(i, { initial: raw.trim() ? raw.trim() : undefined })}
              />
            </div>
            <div style={{ flex: 1 }} />
            <span
              style={{ font: "400 11px 'IBM Plex Mono'", color: "var(--faint)" }}
              title="Reference this variable in a guard using this handle"
            >
              {handle}.{v.name || "…"}
            </span>
          </div>
        </div>
      ))}
      <AddButton onClick={add} inline>
        + Add variable
      </AddButton>
    </div>
  );
}

function initialPlaceholder(t: VarType): string {
  if (t.kind === "bool") return "true / false";
  if (t.kind === "int") return "0";
  return t.values[0] ?? "value";
}

// ===========================================================================
// small shared bits
// ===========================================================================

function splitList(v: string): string[] {
  return v.split(",").map((t) => t.trim()).filter(Boolean);
}

function StoryLabel({ children }: { children: string }) {
  return (
    <span
      style={{
        font: "500 9.5px 'IBM Plex Mono'",
        letterSpacing: ".05em",
        textTransform: "uppercase",
        color: "var(--ter)",
      }}
    >
      {children}
    </span>
  );
}

function Muted({ children }: { children: string }) {
  return <span style={{ font: "400 12.5px 'IBM Plex Sans'", color: "var(--faint)" }}>{children}</span>;
}

function Chip({
  id,
  icon,
  onClick,
  onRemove,
}: {
  id: string;
  icon: IconName;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: "500 11.5px 'IBM Plex Mono'",
        color: "var(--accent-ink)",
        background: "var(--accent-bg)",
        padding: onRemove ? "4px 5px 4px 9px" : "4px 9px",
        borderRadius: 6,
      }}
    >
      <span
        onClick={onClick}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <span style={{ display: "flex" }}>
          <Icon name={icon} size={12} color="var(--accent-ink)" />
        </span>
        {id}
      </span>
      {onRemove ? <ChipRemoveButton onClick={onRemove} /> : null}
    </span>
  );
}

function ChipRemoveButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const { armed, trigger } = useConfirm(onClick);
  return (
    <button
      onClick={trigger}
      title={armed ? "Click again to remove trace" : "Remove trace"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: "none",
        width: 16,
        height: 16,
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: armed ? "oklch(0.55 0.18 25)" : hover ? "oklch(0.5 0.16 25 / .15)" : "transparent",
        color: armed ? "#fff" : "var(--accent-ink)",
      }}
    >
      <Icon name={armed ? "check" : "close"} size={11} color={armed ? "#fff" : "var(--accent-ink)"} />
    </button>
  );
}

/**
 * Edits a forward trace: shows the linked parents as removable chips and offers
 * a picker to add another from the available candidates of the parent kind.
 */
function TraceEditor({
  trace,
  candidates,
  icon,
  emptyLabel,
  onOpen,
  onChange,
}: {
  trace: string[];
  candidates: { id: string; title: string }[];
  icon: IconName;
  emptyLabel: string;
  onOpen: (id: string) => void;
  onChange: (trace: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const available = candidates.filter((c) => !trace.includes(c.id));
  const add = (id: string) => {
    if (id && !trace.includes(id)) onChange([...trace, id]);
    setAdding(false);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {trace.length === 0 && !adding ? <Muted>{emptyLabel}</Muted> : null}
      {trace.map((id) => (
        <Chip
          key={id}
          id={id}
          icon={icon}
          onClick={() => onOpen(id)}
          onRemove={() => onChange(trace.filter((t) => t !== id))}
        />
      ))}
      {adding ? (
        <div style={{ width: 240 }}>
          <Select<string>
            value=""
            onChange={add}
            options={[
              { value: "", label: available.length ? "Select…" : "Nothing to add" },
              ...available.map((c) => ({ value: c.id, label: `${c.id} · ${c.title}` })),
            ]}
          />
        </div>
      ) : (
        <AddButton onClick={() => setAdding(true)} inline disabled={available.length === 0}>
          + Add trace
        </AddButton>
      )}
    </div>
  );
}

function AddButton({
  onClick,
  children,
  inline,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  inline?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        alignSelf: inline ? "flex-start" : "auto",
        padding: inline ? "5px 10px" : "8px 12px",
        border: "1px dashed rgba(var(--line),.18)",
        borderRadius: 7,
        background: "transparent",
        color: disabled ? "var(--faint)" : "var(--sub)",
        font: "500 12px 'IBM Plex Sans'",
        cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const { armed, trigger } = useConfirm(onClick);
  return (
    <button
      onClick={trigger}
      title={armed ? "Click again to remove" : "Remove"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: "none",
        width: 24,
        height: 24,
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: armed ? "oklch(0.55 0.18 25)" : hover ? "oklch(0.95 0.05 25)" : "transparent",
        color: armed ? "#fff" : hover ? "oklch(0.5 0.16 25)" : "var(--ter)",
      }}
    >
      <Icon name={armed ? "check" : "close"} size={13} />
    </button>
  );
}
