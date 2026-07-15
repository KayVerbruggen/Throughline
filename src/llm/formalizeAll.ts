import { flowOfUseCase } from "../model/behavior";
import type { Artifact, Project } from "../types";
import {
  applyFormalization,
  formalizeFlow,
  pendingFormalization,
  type FormalizationPlan,
} from "./formalizeFlow";
import type { JsonResult } from "./json";
import type { LlmClient } from "./types";

/** One flow's outcome in a whole-project pass: a plan on success, else an error. */
export interface FlowFormalization {
  flowId: string;
  flowTitle: string;
  useCaseTitle: string;
  /** The validated plan, present on success (and already threaded into `touched`). */
  plan?: FormalizationPlan;
  /** Why this flow could not be formalized, present on failure. */
  error?: string;
}

/**
 * The result of formalizing every use case's flow in one sequential pass.
 * `touched` is the accumulated set of artifacts to persist if the user accepts —
 * minted against a single evolving project, so a component that several flows add
 * to appears once, carrying all of their changes.
 */
export interface BatchFormalization {
  /** Flows that had something to formalize, in use-case order (successes + failures). */
  flows: FlowFormalization[];
  touched: Artifact[];
  /** Use cases with no flow, or whose flow was already fully formal. */
  skipped: number;
}

/**
 * Formalize every use case's flow in one pass, **sequentially**, threading an
 * evolving project through each step: a flow is formalized against the project
 * that already includes the variables and effects the earlier flows introduced,
 * so a later flow reuses `chamber.mode` rather than inventing a second variable
 * for the same state. Nothing is persisted here — the batch runs on an in-memory
 * copy and returns the plans (for review) plus the accumulated `touched`
 * artifacts; the caller persists them only if the user accepts.
 *
 * Best-effort: a flow whose model call or validation fails is recorded with its
 * error and the pass continues with the others (its state simply isn't threaded).
 * Because activities are shared across flows, a flow left with nothing pending
 * once earlier flows formalized its shared activities is skipped, not re-asked.
 */
export async function formalizeAllFlows(
  client: LlmClient,
  project: Project,
): Promise<JsonResult<BatchFormalization>> {
  let working = project;
  const flows: FlowFormalization[] = [];
  const touchedById = new Map<string, Artifact>();
  let skipped = 0;
  const seen = new Set<string>();

  for (const uc of project.useCases) {
    const baseFlow = flowOfUseCase(project, uc);
    if (!baseFlow) {
      skipped++;
      continue;
    }
    // A flow could back more than one use case; formalize it only once.
    if (seen.has(baseFlow.id)) continue;
    seen.add(baseFlow.id);

    // Re-resolve from the evolving project so shared-activity effects applied by
    // an earlier flow count as already-formal here.
    const flow = working.flows.find((f) => f.id === baseFlow.id) ?? baseFlow;
    const targets = pendingFormalization(working, flow);
    if (targets.guards.length + targets.effects.length === 0) {
      skipped++;
      continue;
    }

    const r = await formalizeFlow(client, working, flow);
    if (!r.ok) {
      flows.push({ flowId: flow.id, flowTitle: flow.title, useCaseTitle: uc.title, error: r.error });
      continue;
    }

    flows.push({ flowId: flow.id, flowTitle: flow.title, useCaseTitle: uc.title, plan: r.value });
    const applied = applyFormalization(working, flow.id, r.value);
    working = applied.project;
    for (const art of applied.touched) touchedById.set(art.id, art);
  }

  return { ok: true, value: { flows, touched: [...touchedById.values()], skipped } };
}
