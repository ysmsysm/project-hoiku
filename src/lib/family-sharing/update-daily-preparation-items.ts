import type {
  DailyDataClient,
  DailyDataInvalidInputError,
  DailyDataValidationIssue,
  DailyPreparationConflict,
  DailyPreparationConflictPayload,
  DailyItem,
  UpdateDailyPreparationItemsInput,
  UpdateDailyPreparationItemsResult,
  UpdateDailyPreparationItemsValidationContext,
  UpdatedDailyItem,
} from "../../types/daily";
import {
  isDailyDataIsoDateTime,
  isDailyDataUuid,
  isPostgresInteger,
  mapUpdatedDailyItemPayload,
  normalizeDailyDataUuid,
  toDailyDataRpcError,
  validateDailyDataScopeInput,
} from "./daily-data";

const maxDailyPreparationItemUpdates = 100;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  isPostgresInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  isPostgresInteger(value) && value >= 1;

const dailyItemsEqual = (left: DailyItem, right: DailyItem): boolean => {
  const leftKeys = Object.keys(left) as (keyof DailyItem)[];
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
};

const nullableUuid = (value: unknown) =>
  value === null || isDailyDataUuid(value);
const nullableString = (value: unknown) =>
  value === null || typeof value === "string";

const invalidResponse = (
  message: string,
  issues: DailyDataValidationIssue[],
): UpdateDailyPreparationItemsResult => ({
  status: "transport_error",
  error: {
    kind: "invalid_response",
    message,
    issues,
  },
});

export function validateDailyPreparationItemsInput(
  input: UpdateDailyPreparationItemsInput,
): DailyDataInvalidInputError | null {
  const scopeError = validateDailyDataScopeInput(input);
  const issues = scopeError ? [...scopeError.issues] : [];

  if (!Array.isArray(input.updates)) {
    issues.push({ path: "updates", code: "invalid_array" });
  } else {
    if (input.updates.length === 0) {
      issues.push({ path: "updates", code: "empty_updates" });
    }
    if (input.updates.length > maxDailyPreparationItemUpdates) {
      issues.push({ path: "updates", code: "too_many_updates" });
    }

    const seenDailyItemIds = new Set<string>();
    input.updates.forEach((update, index) => {
      const path = `updates[${index}]`;
      if (!isPlainObject(update)) {
        issues.push({ path, code: "invalid_object" });
        return;
      }
      if (!isDailyDataUuid(update.dailyItemId)) {
        issues.push({ path: `${path}.dailyItemId`, code: "invalid_uuid" });
      } else if (
        seenDailyItemIds.has(normalizeDailyDataUuid(update.dailyItemId))
      ) {
        issues.push({
          path: `${path}.dailyItemId`,
          code: "duplicate_daily_item_id",
        });
      } else {
        seenDailyItemIds.add(normalizeDailyDataUuid(update.dailyItemId));
      }
      if (!isPositiveInteger(update.expectedVersion)) {
        issues.push({
          path: `${path}.expectedVersion`,
          code: "invalid_positive_integer",
        });
      }
      if (typeof update.isPrepared !== "boolean") {
        issues.push({
          path: `${path}.isPrepared`,
          code: "invalid_boolean",
        });
      }
    });
  }

  return issues.length > 0
    ? {
        kind: "invalid_input",
        message: "Invalid daily preparation update input",
        issues,
      }
    : null;
}

export async function updateDailyPreparationItems(
  client: DailyDataClient,
  input: UpdateDailyPreparationItemsInput,
  context: UpdateDailyPreparationItemsValidationContext,
): Promise<UpdateDailyPreparationItemsResult> {
  const inputError = validateDailyPreparationItemsInput(input);
  const contextIssues = validateValidationContext(context, input);
  if (inputError || contextIssues.length > 0) {
    return {
      status: "client_error",
      error: inputError ?? {
        kind: "invalid_input",
        message: "Invalid daily preparation update context",
        issues: contextIssues,
      },
    };
  }

  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc("update_daily_preparation_items", {
      p_family_id: input.familyId,
      p_child_id: input.childId,
      p_session_date: input.sessionDate,
      p_updates: input.updates.map((update) => ({
        daily_item_id: update.dailyItemId,
        expected_version: update.expectedVersion,
        is_prepared: update.isPrepared,
      })),
    });
  } catch (error) {
    return {
      status: "transport_error",
      error: toDailyDataRpcError(error),
    };
  }

  if (response.error) {
    return {
      status: "transport_error",
      error: toDailyDataRpcError(response.error),
    };
  }

  try {
    const result = mapUpdateDailyPreparationItemsResponse(response.data);
    if (result.status === "success") {
      const issues =
        result.requestedCount === input.updates.length
          ? validateSuccessResponseScope(result.items, input, context)
          : [{ path: "requested_count", code: "requested_count_mismatch" }];
      return issues.length === 0
        ? result
        : invalidResponse(
            "update_daily_preparation_items response is outside the requested scope",
            issues,
          );
    }
    if (result.status === "conflict") {
      const issues =
        result.requestedCount === input.updates.length
          ? validateConflictResponseScope(result.conflicts, input)
          : [{ path: "requested_count", code: "requested_count_mismatch" }];
      return issues.length === 0
        ? result
        : invalidResponse(
            "update_daily_preparation_items conflicts do not match the request",
            issues,
          );
    }
    return result;
  } catch {
    return invalidResponse("Invalid update_daily_preparation_items response", [
      { path: "response", code: "response_mapping_failed" },
    ]);
  }
}

const validateSuccessResponseScope = (
  items: UpdatedDailyItem[],
  input: UpdateDailyPreparationItemsInput,
  context: UpdateDailyPreparationItemsValidationContext,
): DailyDataValidationIssue[] => {
  const expectedUpdates = new Map(
    input.updates.map((update) => [
      normalizeDailyDataUuid(update.dailyItemId),
      update,
    ]),
  );
  const currentItems = new Map(
    context.items.map((item) => [
      normalizeDailyDataUuid(item.dailyItemId),
      item,
    ]),
  );
  const seenIds = new Set<string>();
  const issues: DailyDataValidationIssue[] = [];
  items.forEach((item, index) => {
    const id = normalizeDailyDataUuid(item.dailyItemId);
    if (seenIds.has(id)) {
      issues.push({
        path: `items[${index}].daily_item_id`,
        code: "duplicate_daily_item_id",
      });
    } else {
      seenIds.add(id);
    }
    const expectedUpdate = expectedUpdates.get(id);
    const currentItem = currentItems.get(id);
    if (!expectedUpdate || !currentItem) {
      issues.push({
        path: `items[${index}].daily_item_id`,
        code: "unexpected_daily_item_id",
      });
    }
    if (
      normalizeDailyDataUuid(item.familyId) !==
      normalizeDailyDataUuid(input.familyId)
    ) {
      issues.push({
        path: `items[${index}].family_id`,
        code: "family_id_mismatch",
      });
    }
    if (
      normalizeDailyDataUuid(item.dailySessionId) !==
      normalizeDailyDataUuid(context.dailySessionId)
    ) {
      issues.push({
        path: `items[${index}].daily_session_id`,
        code: "daily_session_id_mismatch",
      });
    }
    if (expectedUpdate && currentItem) {
      if (item.isPrepared !== expectedUpdate.isPrepared) {
        issues.push({
          path: `items[${index}].is_prepared`,
          code: "prepared_mismatch",
        });
      }
      const expectedDeferred = expectedUpdate.isPrepared
        ? false
        : currentItem.isDeferred;
      if (item.isDeferred !== expectedDeferred) {
        issues.push({
          path: `items[${index}].is_deferred`,
          code: "deferred_mismatch",
        });
      }
      const expectedVersion = item.changed
        ? expectedUpdate.expectedVersion + 1
        : expectedUpdate.expectedVersion;
      if (item.version !== expectedVersion) {
        issues.push({
          path: `items[${index}].version`,
          code: item.changed
            ? "unexpected_updated_version"
            : "unexpected_unchanged_version",
        });
      }
      const { changed, ...responseItem } = item;
      if (!changed && !dailyItemsEqual(responseItem, currentItem)) {
        issues.push({
          path: `items[${index}]`,
          code: "unchanged_item_mismatch",
        });
      }
    }
  });
  expectedUpdates.forEach((_, id) => {
    if (!seenIds.has(id)) {
      issues.push({ path: "items", code: "missing_daily_item_id" });
    }
  });
  return issues;
};

const validateValidationContext = (
  context: UpdateDailyPreparationItemsValidationContext,
  input: UpdateDailyPreparationItemsInput,
): DailyDataValidationIssue[] => {
  const issues: DailyDataValidationIssue[] = [];
  if (!Array.isArray(input.updates)) {
    issues.push({ path: "updates", code: "invalid_array" });
    return issues;
  }
  if (!isPlainObject(context) || !isDailyDataUuid(context.dailySessionId)) {
    issues.push({ path: "context.dailySessionId", code: "invalid_uuid" });
    return issues;
  }
  if (!Array.isArray(context.items)) {
    issues.push({ path: "context.items", code: "invalid_array" });
    return issues;
  }

  const requestedIds = new Set(
    input.updates
      .filter((update) => isDailyDataUuid(update.dailyItemId))
      .map((update) => normalizeDailyDataUuid(update.dailyItemId)),
  );
  const seenIds = new Set<string>();
  context.items.forEach((item, index) => {
    const path = `context.items[${index}]`;
    if (!isPlainObject(item) || !isDailyDataUuid(item.dailyItemId)) {
      issues.push({ path: `${path}.dailyItemId`, code: "invalid_uuid" });
      return;
    }
    const id = normalizeDailyDataUuid(item.dailyItemId);
    if (seenIds.has(id)) {
      issues.push({ path: `${path}.dailyItemId`, code: "duplicate_daily_item_id" });
    }
    seenIds.add(id);
    if (!requestedIds.has(id)) {
      issues.push({ path: `${path}.dailyItemId`, code: "unexpected_daily_item_id" });
    }
    if (typeof item.isDeferred !== "boolean") {
      issues.push({ path: `${path}.isDeferred`, code: "invalid_boolean" });
    }
    const requestedUpdate = input.updates.find(
      (update) =>
        isDailyDataUuid(update.dailyItemId) &&
        normalizeDailyDataUuid(update.dailyItemId) === id,
    );
    if (
      requestedUpdate &&
      item.version !== requestedUpdate.expectedVersion
    ) {
      issues.push({ path: `${path}.version`, code: "expected_version_mismatch" });
    }
    if (
      normalizeDailyDataUuid(item.familyId) !==
      normalizeDailyDataUuid(input.familyId)
    ) {
      issues.push({ path: `${path}.familyId`, code: "family_id_mismatch" });
    }
    if (
      normalizeDailyDataUuid(item.dailySessionId) !==
      normalizeDailyDataUuid(context.dailySessionId)
    ) {
      issues.push({
        path: `${path}.dailySessionId`,
        code: "daily_session_id_mismatch",
      });
    }
  });
  requestedIds.forEach((id) => {
    if (!seenIds.has(id)) {
      issues.push({ path: "context.items", code: "missing_daily_item_id" });
    }
  });
  return issues;
};

const validateConflictResponseScope = (
  conflicts: DailyPreparationConflict[],
  input: UpdateDailyPreparationItemsInput,
): DailyDataValidationIssue[] => {
  const expectedUpdates = new Map(
    input.updates.map((update) => [
      normalizeDailyDataUuid(update.dailyItemId),
      update,
    ]),
  );
  const seenIds = new Set<string>();
  const issues: DailyDataValidationIssue[] = [];
  conflicts.forEach((conflict, index) => {
    const path = `conflicts[${index}]`;
    const id = normalizeDailyDataUuid(conflict.dailyItemId);
    const expectedUpdate = expectedUpdates.get(id);
    if (seenIds.has(id)) {
      issues.push({
        path: `${path}.daily_item_id`,
        code: "duplicate_daily_item_id",
      });
    } else {
      seenIds.add(id);
    }
    if (!expectedUpdate) {
      issues.push({
        path: `${path}.daily_item_id`,
        code: "unexpected_daily_item_id",
      });
    } else if (conflict.expectedVersion !== expectedUpdate.expectedVersion) {
      issues.push({
        path: `${path}.expected_version`,
        code: "expected_version_mismatch",
      });
    }
  });
  return issues;
};

export function mapUpdateDailyPreparationItemsResponse(
  value: unknown,
): UpdateDailyPreparationItemsResult {
  if (!isPlainObject(value) || typeof value.status !== "string") {
    return invalidResponse("Invalid update_daily_preparation_items response", [
      { path: "response", code: "invalid_status_envelope" },
    ]);
  }

  const counts = mapResponseCounts(value);
  if (!counts) {
    return invalidResponse(
      "Invalid update_daily_preparation_items response counts",
      [{ path: "response", code: "invalid_counts" }],
    );
  }

  if (value.status === "success") {
    if (
      !Array.isArray(value.items) ||
      !Array.isArray(value.conflicts) ||
      value.conflicts.length !== 0 ||
      value.session !== null
    ) {
      return invalidResponse(
        "Invalid update_daily_preparation_items success response",
        [{ path: "response", code: "invalid_success_payload" }],
      );
    }

    const items: UpdatedDailyItem[] = [];
    const issues: DailyDataValidationIssue[] = [];
    value.items.forEach((item, index) => {
      const mapped = mapUpdatedDailyItemPayload(item, `items[${index}]`);
      if (mapped.ok === false) {
        issues.push(...mapped.error.issues);
      } else {
        items.push(mapped.data);
      }
    });

    if (
      issues.length > 0 ||
      items.length !== counts.requestedCount ||
      items.filter((item) => item.changed).length !== counts.changedCount ||
      items.filter((item) => !item.changed).length !== counts.unchangedCount
    ) {
      return invalidResponse(
        "Invalid update_daily_preparation_items success items",
        issues.length > 0
          ? issues
          : [{ path: "items", code: "item_count_mismatch" }],
      );
    }

    return {
      status: "success",
      ...counts,
      items,
    };
  }

  if (value.status === "conflict") {
    if (
      !Array.isArray(value.items) ||
      value.items.length !== 0 ||
      !Array.isArray(value.conflicts) ||
      value.session !== null ||
      counts.changedCount !== 0
    ) {
      return invalidResponse(
        "Invalid update_daily_preparation_items conflict response",
        [{ path: "response", code: "invalid_conflict_payload" }],
      );
    }

    const conflicts: DailyPreparationConflict[] = [];
    const issues: DailyDataValidationIssue[] = [];
    value.conflicts.forEach((conflict, index) => {
      const mapped = mapDailyPreparationConflict(
        conflict,
        `conflicts[${index}]`,
      );
      if (mapped.ok === false) {
        issues.push(...mapped.issues);
      } else {
        conflicts.push(mapped.data);
      }
    });

    if (issues.length > 0 || conflicts.length === 0) {
      return invalidResponse(
        "Invalid update_daily_preparation_items conflicts",
        issues.length > 0
          ? issues
          : [{ path: "conflicts", code: "empty_conflicts" }],
      );
    }

    return {
      status: "conflict",
      ...counts,
      conflicts,
    };
  }

  if (
    value.status === "forbidden" ||
    value.status === "not_found" ||
    value.status === "invalid_state"
  ) {
    if (
      !Array.isArray(value.items) ||
      value.items.length !== 0 ||
      !Array.isArray(value.conflicts) ||
      value.conflicts.length !== 0 ||
      value.session !== null ||
      counts.changedCount !== 0 ||
      (value.reason !== undefined && typeof value.reason !== "string")
    ) {
      return invalidResponse(
        "Invalid update_daily_preparation_items business error response",
        [{ path: "response", code: "invalid_business_error_payload" }],
      );
    }

    return {
      status: value.status,
      ...counts,
      ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
    };
  }

  return invalidResponse(
    "Invalid update_daily_preparation_items response status",
    [{ path: "status", code: "unexpected_status" }],
  );
}

function mapResponseCounts(value: Record<string, unknown>) {
  if (
    !isNonNegativeInteger(value.requested_count) ||
    !isNonNegativeInteger(value.changed_count) ||
    !isNonNegativeInteger(value.unchanged_count) ||
    value.changed_count + value.unchanged_count !== value.requested_count
  ) {
    return null;
  }

  return {
    requestedCount: value.requested_count,
    changedCount: value.changed_count,
    unchangedCount: value.unchanged_count,
  };
}

function mapDailyPreparationConflict(
  value: unknown,
  path: string,
):
  | { ok: true; data: DailyPreparationConflict }
  | { ok: false; issues: DailyDataValidationIssue[] } {
  if (!isPlainObject(value)) {
    return { ok: false, issues: [{ path, code: "invalid_object" }] };
  }

  const payload = value as DailyPreparationConflictPayload;
  const issues: DailyDataValidationIssue[] = [];
  if (!isDailyDataUuid(payload.daily_item_id)) {
    issues.push({ path: `${path}.daily_item_id`, code: "invalid_uuid" });
  }
  if (!isPositiveInteger(payload.expected_version)) {
    issues.push({
      path: `${path}.expected_version`,
      code: "invalid_positive_integer",
    });
  }
  if (!isPositiveInteger(payload.current_version)) {
    issues.push({
      path: `${path}.current_version`,
      code: "invalid_positive_integer",
    });
  }
  if (typeof payload.is_prepared !== "boolean") {
    issues.push({ path: `${path}.is_prepared`, code: "invalid_boolean" });
  }
  if (typeof payload.is_deferred !== "boolean") {
    issues.push({ path: `${path}.is_deferred`, code: "invalid_boolean" });
  }
  if (!nullableUuid(payload.updated_by_member_id)) {
    issues.push({
      path: `${path}.updated_by_member_id`,
      code: "invalid_nullable_uuid",
    });
  }
  if (!nullableUuid(payload.updated_by_user_id)) {
    issues.push({
      path: `${path}.updated_by_user_id`,
      code: "invalid_nullable_uuid",
    });
  }
  if (!nullableString(payload.updated_by_display_name)) {
    issues.push({
      path: `${path}.updated_by_display_name`,
      code: "invalid_nullable_string",
    });
  }
  if (!isDailyDataIsoDateTime(payload.updated_at)) {
    issues.push({
      path: `${path}.updated_at`,
      code: "invalid_iso_datetime",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: {
      dailyItemId: payload.daily_item_id as string,
      expectedVersion: payload.expected_version as number,
      currentVersion: payload.current_version as number,
      isPrepared: payload.is_prepared as boolean,
      isDeferred: payload.is_deferred as boolean,
      updatedByMemberId: payload.updated_by_member_id as string | null,
      updatedByUserId: payload.updated_by_user_id as string | null,
      updatedByDisplayName: payload.updated_by_display_name as string | null,
      updatedAt: payload.updated_at as string,
    },
  };
}
