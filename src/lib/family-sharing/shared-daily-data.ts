import type {
  DailyDataClient,
  DailyItem,
  DailySession,
  LoadDailyDataInput,
  LoadDailyDataResult,
} from "../../types/daily";
import type { SharedDailyState } from "../../types/shared-daily";
import { loadDailyData, normalizeDailyDataUuid } from "./daily-data";
import {
  mapDailySessionToCheckView,
  mapDailySessionToPreparationSession,
} from "./daily-data-view";

const viewMappingFailure = (
  sessionDate: string,
): SharedDailyState => ({
  status: "invalid_response",
  sessionDate,
  error: {
    kind: "invalid_response",
    message: "Could not derive shared daily views",
    issues: [{ path: "session", code: "view_mapping_failed" }],
  },
});

export type SharedDailyItemUpdateScope = {
  familyId: string;
  childId: string;
  sessionDate: string;
  dailySessionId: string;
  dailyItemId: string;
  expectedVersion: number;
};

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

export function mapDailySessionToSharedDailyState(
  session: DailySession,
  fallbackSessionDate: string,
): SharedDailyState {
  try {
    return {
      status: "success",
      sessionDate: session.sessionDate,
      session,
      preparationSession: mapDailySessionToPreparationSession(session),
      checkView: mapDailySessionToCheckView(session),
    };
  } catch {
    return viewMappingFailure(fallbackSessionDate);
  }
}

export function applyUpdatedItemToSharedDailyState(
  state: SharedDailyState,
  scope: SharedDailyItemUpdateScope,
  updatedItem: DailyItem,
): SharedDailyState {
  if (
    state.status !== "success" ||
    !uuidEquals(state.session.familyId, scope.familyId) ||
    !uuidEquals(state.session.childId, scope.childId) ||
    state.session.sessionDate !== scope.sessionDate ||
    !uuidEquals(state.session.dailySessionId, scope.dailySessionId) ||
    !uuidEquals(updatedItem.familyId, scope.familyId) ||
    !uuidEquals(updatedItem.dailySessionId, scope.dailySessionId) ||
    !uuidEquals(updatedItem.dailyItemId, scope.dailyItemId) ||
    updatedItem.version !== scope.expectedVersion + 1
  ) {
    return state;
  }

  const itemIndex = state.session.items.findIndex((item) =>
    uuidEquals(item.dailyItemId, scope.dailyItemId),
  );
  if (
    itemIndex < 0 ||
    state.session.items[itemIndex].version !== scope.expectedVersion
  ) {
    return state;
  }

  const items = [...state.session.items];
  items[itemIndex] = updatedItem;
  const mapped = mapDailySessionToSharedDailyState(
    { ...state.session, items },
    scope.sessionDate,
  );
  return mapped.status === "success" ? mapped : state;
}

export function mapLoadDailyDataResultToSharedDailyState(
  result: LoadDailyDataResult,
  sessionDate: string,
): SharedDailyState {
  if (result.status === "success") {
    return mapDailySessionToSharedDailyState(result.session, sessionDate);
  }

  if (result.status === "client_error") {
    return {
      status: "invalid_input",
      sessionDate,
      error: result.error,
    };
  }

  if (result.status === "transport_error") {
    if (result.error.kind === "invalid_response") {
      return {
        status: "invalid_response",
        sessionDate,
        error: result.error,
      };
    }

    return {
      status: "transport_error",
      sessionDate,
      error: result.error,
    };
  }

  return { status: result.status, sessionDate };
}

export async function loadSharedDailyDataForDate(
  client: DailyDataClient,
  input: LoadDailyDataInput,
): Promise<SharedDailyState> {
  try {
    const result = await loadDailyData(client, input);
    return mapLoadDailyDataResultToSharedDailyState(
      result,
      input.sessionDate,
    );
  } catch {
    return {
      status: "transport_error",
      sessionDate: input.sessionDate,
      error: {
        kind: "rpc_error",
        message: "Shared daily data load failed",
      },
    };
  }
}
