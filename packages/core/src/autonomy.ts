/**
 * The autonomy ladder (PRD §9). Autonomy is configured per action type (and can be
 * narrowed per contact group), never globally, and only ever rises with evidence.
 */
export type AutonomyLevel =
  | "L0_OBSERVE"
  | "L1_SUGGEST"
  | "L2_APPROVE_TO_ACT"
  | "L3_ACT_AND_NOTIFY"
  | "L4_AUTONOMOUS";

export const AUTONOMY_LEVEL_ORDER: readonly AutonomyLevel[] = [
  "L0_OBSERVE",
  "L1_SUGGEST",
  "L2_APPROVE_TO_ACT",
  "L3_ACT_AND_NOTIFY",
  "L4_AUTONOMOUS",
];

export function autonomyRank(level: AutonomyLevel): number {
  return AUTONOMY_LEVEL_ORDER.indexOf(level);
}
