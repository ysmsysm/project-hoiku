import type {
  DailyDataClient,
  DailyItem,
  DailyPreparationItemUpdate,
  DailySession,
  LoadDailyDataInput,
  LoadDailyDataResult,
  UpdatedDailyItem,
} from "../../types/daily";
import type { SharedDailyState } from "../../types/shared-daily";
import {
  isDailyDataUuid,
  isPostgresInteger,
  loadDailyData,
  normalizeDailyDataUuid,
} from "./daily-data";
import {
  mapDailySessionToCheckView,
  mapDailySessionToPreparationSession,
  isDailyItemVisibleInPreparation,
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

export const maxSharedPreparationBulkItems = 100;

export type SharedPreparationBulkMutationPlan =
  | { status: "empty" | "too_many" | "invalid" }
  | {
      status: "ready";
      desiredPrepared: boolean;
      updates: DailyPreparationItemUpdate[];
      currentItems: DailyItem[];
    };

export type SharedDailyItemsUpdateScope = {
  familyId: string;
  childId: string;
  sessionDate: string;
  dailySessionId: string;
  updates: DailyPreparationItemUpdate[];
};

export type SharedDailyCompletionScope = {
  familyId: string;
  childId: string;
  sessionDate: string;
  dailySessionId: string;
  expectedSessionVersion: number;
  completedSessionVersion: number;
  changed: boolean;
};

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

export function getSharedPreparationBulkMutationPlan(
  session: DailySession,
): SharedPreparationBulkMutationPlan {
  const targets = session.items.filter(
    (item) => isDailyItemVisibleInPreparation(item) && !item.isDeferred,
  );
  if (targets.length === 0) {
    return { status: "empty" };
  }
  if (targets.length > maxSharedPreparationBulkItems) {
    return { status: "too_many" };
  }

  const ids = new Set<string>();
  for (const item of targets) {
    const id = normalizeDailyDataUuid(item.dailyItemId);
    if (
      !isDailyDataUuid(item.dailyItemId) ||
      ids.has(id) ||
      !isPostgresInteger(item.version) ||
      item.version < 1
    ) {
      return { status: "invalid" };
    }
    ids.add(id);
  }

  const desiredPrepared = targets.some((item) => !item.isPrepared);
  return {
    status: "ready",
    desiredPrepared,
    updates: targets.map((item) => ({
      dailyItemId: item.dailyItemId,
      expectedVersion: item.version,
      isPrepared: desiredPrepared,
    })),
    currentItems: targets,
  };
}

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

export function applyUpdatedItemsToSharedDailyState(
  state: SharedDailyState,
  scope: SharedDailyItemsUpdateScope,
  updatedItems: UpdatedDailyItem[],
  changedCount: number,
): SharedDailyState {
  if (
    state.status !== "success" ||
    !uuidEquals(state.session.familyId, scope.familyId) ||
    !uuidEquals(state.session.childId, scope.childId) ||
    state.session.sessionDate !== scope.sessionDate ||
    !uuidEquals(state.session.dailySessionId, scope.dailySessionId) ||
    !Number.isInteger(changedCount) ||
    changedCount < 0 ||
    updatedItems.filter((item) => item.changed).length !== changedCount
  ) {
    return state;
  }

  const requestById = new Map<string, DailyPreparationItemUpdate>();
  for (const update of scope.updates) {
    const id = normalizeDailyDataUuid(update.dailyItemId);
    if (requestById.has(id)) {
      return state;
    }
    requestById.set(id, update);
  }
  if (requestById.size === 0 || updatedItems.length !== requestById.size) {
    return state;
  }

  const currentById = new Map(
    state.session.items.map((item) => [
      normalizeDailyDataUuid(item.dailyItemId),
      item,
    ]),
  );
  const responseById = new Map<string, UpdatedDailyItem>();
  for (const updatedItem of updatedItems) {
    const id = normalizeDailyDataUuid(updatedItem.dailyItemId);
    const request = requestById.get(id);
    const currentItem = currentById.get(id);
    if (
      responseById.has(id) ||
      !request ||
      !currentItem ||
      currentItem.version !== request.expectedVersion ||
      !uuidEquals(updatedItem.familyId, scope.familyId) ||
      !uuidEquals(updatedItem.dailySessionId, scope.dailySessionId) ||
      updatedItem.isPrepared !== request.isPrepared ||
      updatedItem.isDeferred !==
        (request.isPrepared ? false : currentItem.isDeferred) ||
      updatedItem.version !==
        request.expectedVersion + (updatedItem.changed ? 1 : 0)
    ) {
      return state;
    }
    responseById.set(id, updatedItem);
  }
  if (responseById.size !== requestById.size) {
    return state;
  }

  const items = state.session.items.map((item) => {
    const updatedItem = responseById.get(
      normalizeDailyDataUuid(item.dailyItemId),
    );
    if (!updatedItem) {
      return item;
    }
    const { changed, ...dailyItem } = updatedItem;
    return changed ? dailyItem : item;
  });
  const mapped = mapDailySessionToSharedDailyState(
    { ...state.session, items },
    scope.sessionDate,
  );
  return mapped.status === "success" ? mapped : state;
}

export function applyCompletedSessionToSharedDailyState(
  state: SharedDailyState,
  scope: SharedDailyCompletionScope,
  session: DailySession,
): SharedDailyState {
  if (
    state.status !== "success" ||
    !uuidEquals(state.session.familyId, scope.familyId) ||
    !uuidEquals(state.session.childId, scope.childId) ||
    state.session.sessionDate !== scope.sessionDate ||
    !uuidEquals(state.session.dailySessionId, scope.dailySessionId) ||
    !uuidEquals(session.familyId, scope.familyId) ||
    !uuidEquals(session.childId, scope.childId) ||
    session.sessionDate !== scope.sessionDate ||
    !uuidEquals(session.dailySessionId, scope.dailySessionId) ||
    !session.isChecked ||
    !session.checkedAt ||
    !session.isCompleted ||
    !session.completedAt ||
    session.items.some(
      (item) =>
        !uuidEquals(item.familyId, session.familyId) ||
        !uuidEquals(item.dailySessionId, session.dailySessionId),
    ) ||
    new Set(
      session.items.map((item) => normalizeDailyDataUuid(item.dailyItemId)),
    ).size !== session.items.length ||
    session.version !== scope.completedSessionVersion ||
    (scope.changed
      ? state.session.version !== scope.expectedSessionVersion ||
        scope.completedSessionVersion !== scope.expectedSessionVersion + 1
      : state.session.version !== scope.expectedSessionVersion &&
        (!state.session.isCompleted ||
          state.session.version !== session.version))
  ) {
    return state;
  }

  const mapped = mapDailySessionToSharedDailyState(session, scope.sessionDate);
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
