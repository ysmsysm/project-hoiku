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

export type SharedDailyQuantityReloadScope = SharedDailyItemUpdateScope & {
  responseVersion: number;
  observedQuantity: number;
  requestScopeKey: string;
  currentScopeKey: string;
  requestScopeGeneration: number;
  currentScopeGeneration: number;
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

export type SharedDailyThanksScope = {
  familyId: string;
  childId: string;
  sessionDate: string;
  dailySessionId: string;
  expectedSessionVersion: number;
  responseSessionVersion: number;
  changed: boolean;
  requestScopeKey: string;
  currentScopeKey: string;
  requestScopeGeneration: number;
  currentScopeGeneration: number;
};

export type SharedDailyCheckCompletionScope = {
  familyId: string;
  childId: string;
  sessionDate: string;
  dailySessionId: string;
  expectedSessionVersion: number;
  responseSessionVersion: number;
  changed: boolean;
  requestScopeKey: string;
  currentScopeKey: string;
  requestScopeGeneration: number;
  currentScopeGeneration: number;
};

export type SharedDailyItemDeletionTarget =
  | { status: "invalid" }
  | { status: "none"; dailyItemId: null; expectedDailyItemVersion: null }
  | {
      status: "ready";
      dailyItemId: string;
      expectedDailyItemVersion: number;
    };

export type SharedDailyItemDeletionScope = {
  familyId: string;
  childId: string;
  sessionDate: string;
  dailySessionId: string;
  startSessionVersion: number;
  itemTemplateId: string;
  dailyItemId: string | null;
  expectedDailyItemVersion: number | null;
  requestScopeKey: string;
  currentScopeKey: string;
  requestScopeGeneration: number;
  currentScopeGeneration: number;
};

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

export function isSharedDailyCheckCurrent(
  session: Pick<DailySession, "checkedAt" | "completedAt">,
): boolean {
  if (!session.checkedAt) {
    return false;
  }
  if (!session.completedAt) {
    return true;
  }
  return Date.parse(session.checkedAt) >= Date.parse(session.completedAt);
}

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

export function getSharedDailyItemDeletionTarget(
  state: SharedDailyState,
  itemTemplateId: string,
): SharedDailyItemDeletionTarget {
  if (state.status !== "success" || !isDailyDataUuid(itemTemplateId)) {
    return { status: "invalid" };
  }
  const matches = state.session.items.filter(
    (item) =>
      item.itemTemplateId !== null &&
      uuidEquals(item.itemTemplateId, itemTemplateId),
  );
  if (matches.length > 1) {
    return { status: "invalid" };
  }
  if (matches.length === 0) {
    return {
      status: "none",
      dailyItemId: null,
      expectedDailyItemVersion: null,
    };
  }
  const [item] = matches;
  if (
    item.isAdHoc ||
    !isDailyDataUuid(item.dailyItemId) ||
    !isPostgresInteger(item.version) ||
    item.version < 1
  ) {
    return { status: "invalid" };
  }
  return {
    status: "ready",
    dailyItemId: item.dailyItemId,
    expectedDailyItemVersion: item.version,
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

export function applyQuantityReloadToSharedDailyState(
  state: SharedDailyState,
  scope: SharedDailyQuantityReloadScope,
  session: DailySession,
): SharedDailyState {
  if (
    state.status !== "success" ||
    scope.requestScopeKey !== scope.currentScopeKey ||
    scope.requestScopeGeneration !== scope.currentScopeGeneration ||
    !uuidEquals(state.session.familyId, scope.familyId) ||
    !uuidEquals(state.session.childId, scope.childId) ||
    state.session.sessionDate !== scope.sessionDate ||
    !uuidEquals(state.session.dailySessionId, scope.dailySessionId) ||
    !uuidEquals(session.familyId, scope.familyId) ||
    !uuidEquals(session.childId, scope.childId) ||
    session.sessionDate !== scope.sessionDate ||
    !uuidEquals(session.dailySessionId, scope.dailySessionId) ||
    session.version !== state.session.version
  ) {
    return state;
  }

  const currentById = new Map(
    state.session.items.map((item) => [
      normalizeDailyDataUuid(item.dailyItemId),
      item,
    ]),
  );
  const loadedById = new Map(
    session.items.map((item) => [
      normalizeDailyDataUuid(item.dailyItemId),
      item,
    ]),
  );
  const targetId = normalizeDailyDataUuid(scope.dailyItemId);
  const currentTarget = currentById.get(targetId);
  const loadedTarget = loadedById.get(targetId);
  if (
    currentById.size !== state.session.items.length ||
    loadedById.size !== session.items.length ||
    currentById.size !== loadedById.size ||
    !currentTarget ||
    currentTarget.version !== scope.expectedVersion ||
    !loadedTarget ||
    loadedTarget.version !== scope.responseVersion ||
    loadedTarget.observedQuantity !== scope.observedQuantity ||
    [...currentById].some(([id, currentItem]) => {
      const loadedItem = loadedById.get(id);
      return !loadedItem || loadedItem.version < currentItem.version;
    })
  ) {
    return state;
  }

  const mapped = mapDailySessionToSharedDailyState(session, scope.sessionDate);
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

const hasCoherentSessionActorTuples = (session: DailySession): boolean => {
  const preparedActors = [
    session.completedByMemberId,
    session.completedByUserId,
    session.completedByDisplayName,
  ];
  const thanksActors = [
    session.thanksSentByMemberId,
    session.thanksSentByUserId,
    session.thanksSentByDisplayName,
    session.thanksReceivedByMemberId,
    session.thanksReceivedByUserId,
    session.thanksReceivedByDisplayName,
  ];
  const hasCheckedActors =
    Boolean(session.checkedByMemberId) &&
    Boolean(session.checkedByUserId) &&
    session.checkedByDisplayName !== null;
  const hasPreparedActors = preparedActors.every((value) => value !== null);
  const hasNoPreparedActors = preparedActors.every((value) => value === null);
  const hasThanksActors = thanksActors.every((value) => value !== null);
  const hasNoThanksActors = thanksActors.every((value) => value === null);

  if (!session.isChecked || !session.checkedAt || !hasCheckedActors) {
    return false;
  }
  if (
    session.isCompleted
      ? !session.completedAt || !hasPreparedActors
      : session.completedAt !== null || !hasNoPreparedActors
  ) {
    return false;
  }
  if (
    session.thanksSent
      ? !session.thanksSentAt ||
        !session.isCompleted ||
        !hasThanksActors ||
        !uuidEquals(
          session.completedByMemberId ?? "",
          session.thanksReceivedByMemberId ?? "",
        ) ||
        uuidEquals(
          session.thanksSentByMemberId ?? "",
          session.thanksReceivedByMemberId ?? "",
        )
      : session.thanksSentAt !== null || !hasNoThanksActors
  ) {
    return false;
  }
  return true;
};

export function applyCheckedSessionToSharedDailyState(
  state: SharedDailyState,
  scope: SharedDailyCheckCompletionScope,
  session: DailySession,
): SharedDailyState {
  if (
    state.status !== "success" ||
    scope.requestScopeKey !== scope.currentScopeKey ||
    scope.requestScopeGeneration !== scope.currentScopeGeneration ||
    !uuidEquals(state.session.familyId, scope.familyId) ||
    !uuidEquals(state.session.childId, scope.childId) ||
    state.session.sessionDate !== scope.sessionDate ||
    !uuidEquals(state.session.dailySessionId, scope.dailySessionId) ||
    state.session.version !== scope.expectedSessionVersion ||
    isSharedDailyCheckCurrent(state.session) ||
    !uuidEquals(session.familyId, scope.familyId) ||
    !uuidEquals(session.childId, scope.childId) ||
    session.sessionDate !== scope.sessionDate ||
    !uuidEquals(session.dailySessionId, scope.dailySessionId) ||
    session.version !== scope.responseSessionVersion ||
    (scope.changed
      ? scope.expectedSessionVersion >= 2_147_483_647 ||
        scope.responseSessionVersion !== scope.expectedSessionVersion + 1
      : scope.responseSessionVersion !== scope.expectedSessionVersion) ||
    !hasCoherentSessionActorTuples(session) ||
    !isSharedDailyCheckCurrent(session) ||
    state.session.completedAt !== session.completedAt ||
    state.session.completedByMemberId !== session.completedByMemberId ||
    state.session.completedByUserId !== session.completedByUserId ||
    state.session.completedByDisplayName !== session.completedByDisplayName ||
    state.session.thanksSentAt !== session.thanksSentAt ||
    state.session.thanksSentByMemberId !== session.thanksSentByMemberId ||
    state.session.thanksSentByUserId !== session.thanksSentByUserId ||
    state.session.thanksSentByDisplayName !== session.thanksSentByDisplayName ||
    state.session.thanksReceivedByMemberId !==
      session.thanksReceivedByMemberId ||
    state.session.thanksReceivedByUserId !== session.thanksReceivedByUserId ||
    state.session.thanksReceivedByDisplayName !==
      session.thanksReceivedByDisplayName ||
    session.items.some(
      (item) =>
        !uuidEquals(item.familyId, session.familyId) ||
        !uuidEquals(item.dailySessionId, session.dailySessionId),
    ) ||
    new Set(
      session.items.map((item) => normalizeDailyDataUuid(item.dailyItemId)),
    ).size !== session.items.length
  ) {
    return state;
  }

  const mapped = mapDailySessionToSharedDailyState(session, scope.sessionDate);
  return mapped.status === "success" ? mapped : state;
}

export function applyThanksSessionToSharedDailyState(
  state: SharedDailyState,
  scope: SharedDailyThanksScope,
  session: DailySession,
): SharedDailyState {
  const hasValidActors =
    Boolean(session.checkedByMemberId) &&
    Boolean(session.checkedByUserId) &&
    session.checkedByDisplayName !== null &&
    Boolean(session.completedByMemberId) &&
    Boolean(session.completedByUserId) &&
    session.completedByDisplayName !== null &&
    Boolean(session.thanksSentByMemberId) &&
    Boolean(session.thanksSentByUserId) &&
    session.thanksSentByDisplayName !== null &&
    Boolean(session.thanksReceivedByMemberId) &&
    Boolean(session.thanksReceivedByUserId) &&
    session.thanksReceivedByDisplayName !== null;
  const recipientMatchesPreparer =
    session.completedByMemberId !== null &&
    session.thanksReceivedByMemberId !== null &&
    uuidEquals(
      session.completedByMemberId,
      session.thanksReceivedByMemberId,
    );
  const senderDiffersFromRecipient =
    session.thanksSentByMemberId !== null &&
    session.thanksReceivedByMemberId !== null &&
    !uuidEquals(
      session.thanksSentByMemberId,
      session.thanksReceivedByMemberId,
    );

  if (
    state.status !== "success" ||
    scope.requestScopeKey !== scope.currentScopeKey ||
    scope.requestScopeGeneration !== scope.currentScopeGeneration ||
    !uuidEquals(state.session.familyId, scope.familyId) ||
    !uuidEquals(state.session.childId, scope.childId) ||
    state.session.sessionDate !== scope.sessionDate ||
    !uuidEquals(state.session.dailySessionId, scope.dailySessionId) ||
    state.session.version !== scope.expectedSessionVersion ||
    !state.session.isChecked ||
    !state.session.checkedAt ||
    !state.session.checkedByMemberId ||
    !state.session.checkedByUserId ||
    state.session.checkedByDisplayName === null ||
    !state.session.isCompleted ||
    !state.session.completedAt ||
    !state.session.completedByMemberId ||
    state.session.thanksSent ||
    !uuidEquals(session.familyId, scope.familyId) ||
    !uuidEquals(session.childId, scope.childId) ||
    session.sessionDate !== scope.sessionDate ||
    !uuidEquals(session.dailySessionId, scope.dailySessionId) ||
    !uuidEquals(
      state.session.completedByMemberId,
      session.completedByMemberId ?? "",
    ) ||
    session.version !== scope.responseSessionVersion ||
    (scope.changed
      ? scope.responseSessionVersion !== scope.expectedSessionVersion + 1
      : scope.responseSessionVersion < scope.expectedSessionVersion) ||
    !session.isChecked ||
    !session.checkedAt ||
    !session.isCompleted ||
    !session.completedAt ||
    !session.thanksSent ||
    !session.thanksSentAt ||
    !hasValidActors ||
    !recipientMatchesPreparer ||
    !senderDiffersFromRecipient ||
    session.items.some(
      (item) =>
        !uuidEquals(item.familyId, session.familyId) ||
        !uuidEquals(item.dailySessionId, session.dailySessionId),
    ) ||
    new Set(
      session.items.map((item) => normalizeDailyDataUuid(item.dailyItemId)),
    ).size !== session.items.length
  ) {
    return state;
  }

  const mapped = mapDailySessionToSharedDailyState(session, scope.sessionDate);
  return mapped.status === "success" ? mapped : state;
}

export function applyDeletedItemReloadToSharedDailyState(
  state: SharedDailyState,
  scope: SharedDailyItemDeletionScope,
  session: DailySession,
): SharedDailyState {
  const targetPairIsValid =
    (scope.dailyItemId === null &&
      scope.expectedDailyItemVersion === null) ||
    (isDailyDataUuid(scope.dailyItemId) &&
      isPostgresInteger(scope.expectedDailyItemVersion) &&
      scope.expectedDailyItemVersion >= 1);
  const currentTarget =
    state.status === "success"
      ? getSharedDailyItemDeletionTarget(state, scope.itemTemplateId)
      : { status: "invalid" as const };
  const currentTargetMatches =
    scope.dailyItemId === null
      ? currentTarget.status === "none"
      : currentTarget.status === "ready" &&
        uuidEquals(currentTarget.dailyItemId, scope.dailyItemId) &&
        currentTarget.expectedDailyItemVersion ===
          scope.expectedDailyItemVersion;
  const loadedIds = new Set<string>();
  let hasInvalidLoadedItem = false;
  let targetStillPresent = false;
  for (const item of session.items) {
    const id = normalizeDailyDataUuid(item.dailyItemId);
    if (
      !isDailyDataUuid(item.dailyItemId) ||
      loadedIds.has(id) ||
      !uuidEquals(item.familyId, session.familyId) ||
      !uuidEquals(item.dailySessionId, session.dailySessionId)
    ) {
      hasInvalidLoadedItem = true;
      break;
    }
    loadedIds.add(id);
    if (
      item.itemTemplateId !== null &&
      uuidEquals(item.itemTemplateId, scope.itemTemplateId)
    ) {
      targetStillPresent = true;
    }
  }

  if (
    state.status !== "success" ||
    !targetPairIsValid ||
    !currentTargetMatches ||
    scope.requestScopeKey !== scope.currentScopeKey ||
    scope.requestScopeGeneration !== scope.currentScopeGeneration ||
    !uuidEquals(state.session.familyId, scope.familyId) ||
    !uuidEquals(state.session.childId, scope.childId) ||
    state.session.sessionDate !== scope.sessionDate ||
    !uuidEquals(state.session.dailySessionId, scope.dailySessionId) ||
    state.session.version !== scope.startSessionVersion ||
    !uuidEquals(session.familyId, scope.familyId) ||
    !uuidEquals(session.childId, scope.childId) ||
    session.sessionDate !== scope.sessionDate ||
    !uuidEquals(session.dailySessionId, scope.dailySessionId) ||
    session.version < scope.startSessionVersion ||
    hasInvalidLoadedItem ||
    targetStillPresent
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
