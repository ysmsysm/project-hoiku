import type { PreparationSession } from "../types/preparation";

export function getPreparationCompletedAt(
  session: Pick<PreparationSession, "completedAt">,
) {
  return session.completedAt;
}

export function isPreparationSessionCompleted(
  session: Pick<PreparationSession, "completedAt">,
) {
  return Boolean(getPreparationCompletedAt(session));
}
