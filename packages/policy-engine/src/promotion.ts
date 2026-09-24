const PROMOTION_STREAK_THRESHOLD = 20;

/**
 * "If the owner approves a category 20 times in a row with no edits, the Agent proposes
 * moving it to L3" (PRD §9). Callers pass approval history newest-first; this only
 * reports eligibility — promoting still requires the owner to accept the proposal.
 */
export function isEligibleForPromotion(approvalsNewestFirst: Array<{ editedBeforeApproval: boolean }>): boolean {
  if (approvalsNewestFirst.length < PROMOTION_STREAK_THRESHOLD) {
    return false;
  }
  return approvalsNewestFirst
    .slice(0, PROMOTION_STREAK_THRESHOLD)
    .every((approval) => !approval.editedBeforeApproval);
}
