import type { EarsPattern, Requirement } from "../types";

export interface EarsMeta {
  /** Does this pattern take a leading condition clause? */
  hasCondition: boolean;
  /** Leading keyword, e.g. "WHEN". Empty for ubiquitous. */
  keyword: string;
  /** Extra keyword after the condition, e.g. "THEN" for unwanted behaviour. */
  thenKeyword?: string;
  /** Label shown above the condition field. */
  conditionLabel: string;
  /** Placeholder / example for the condition field. */
  conditionPlaceholder: string;
  /** One-line description of when to reach for this pattern. */
  blurb: string;
}

export const EARS_META: Record<EarsPattern, EarsMeta> = {
  ubiquitous: {
    hasCondition: false,
    keyword: "",
    conditionLabel: "",
    conditionPlaceholder: "",
    blurb: "Always true — an ever-present property of the system.",
  },
  "event-driven": {
    hasCondition: true,
    keyword: "WHEN",
    conditionLabel: "When — trigger",
    conditionPlaceholder: "a vehicle is connected and the session is authorized",
    blurb: "A response to a triggering event.",
  },
  "state-driven": {
    hasCondition: true,
    keyword: "WHILE",
    conditionLabel: "While — state",
    conditionPlaceholder: "a charging session is active",
    blurb: "Active for as long as the system is in a given state.",
  },
  "unwanted-behavior": {
    hasCondition: true,
    keyword: "IF",
    thenKeyword: "THEN",
    conditionLabel: "If — unwanted condition",
    conditionPlaceholder: "the measured current exceeds the rated limit",
    blurb: "Handles an error or otherwise unwanted condition.",
  },
  optional: {
    hasCondition: true,
    keyword: "WHERE",
    conditionLabel: "Where — feature present",
    conditionPlaceholder: "tariff forecast data is available",
    blurb: "Applies only where an optional feature is included.",
  },
  complex: {
    hasCondition: true,
    keyword: "WHEN",
    conditionLabel: "When / while — combined condition",
    conditionPlaceholder: "a heartbeat is missed for 3 intervals while commissioned",
    blurb: "Combines a state and a trigger.",
  },
};

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

type EarsParts = Pick<
  Requirement,
  "ears" | "condition" | "subject" | "action" | "object" | "constraint"
>;

/**
 * Compose the full EARS statement from the structured slots. This is the single
 * source of the sentence — it is generated, never hand-typed.
 */
export function composeEars(r: EarsParts): string {
  // Tolerate partially-shaped data (e.g. a project persisted before these
  // structured fields existed) rather than throwing.
  const meta = EARS_META[r.ears] ?? EARS_META.ubiquitous;
  const subject = (r.subject ?? "").trim() || "system";
  const tail = [r.action, r.object, r.constraint]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const core = `the ${subject} shall ${tail}`.trim();

  let sentence: string;
  if (!meta.hasCondition) {
    sentence = cap(core);
  } else {
    const cond = (r.condition ?? "").trim() || "…";
    sentence = meta.thenKeyword
      ? `${meta.keyword} ${cond}, ${meta.thenKeyword} ${core}`
      : `${meta.keyword} ${cond}, ${core}`;
  }
  return sentence.replace(/\s+/g, " ").trim().replace(/\.*$/, "") + ".";
}
