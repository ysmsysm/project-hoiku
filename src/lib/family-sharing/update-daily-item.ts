import type {
  DailyDataInvalidInputError,
  DailyDataValidationIssue,
  DailyItem,
  UpdateDailyItemClient,
  UpdateDailyItemInput,
  UpdateDailyItemResult,
} from "../../types/daily";
import {
  isDailyDataUuid,
  isPostgresInteger,
  mapDailyItemPayload,
  mapDailySessionPayload,
  normalizeDailyDataUuid,
  toDailyDataRpcError,
  validateDailyDataScopeInput,
} from "./daily-data";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

const invalidResponse = (
  message: string,
  issues: DailyDataValidationIssue[],
): UpdateDailyItemResult => ({
  status: "transport_error",
  error: {
    kind: "invalid_response",
    message,
    issues,
  },
});

export function validateUpdateDailyItemInput(
  input: UpdateDailyItemInput,
): DailyDataInvalidInputError | null {
  const scopeError = validateDailyDataScopeInput(input);
  const issues = scopeError ? [...scopeError.issues] : [];

  if (!isDailyDataUuid(input.dailySessionId)) {
    issues.push({ path: "dailySessionId", code: "invalid_uuid" });
  }
  if (!isDailyDataUuid(input.dailyItemId)) {
    issues.push({ path: "dailyItemId", code: "invalid_uuid" });
  }
  if (!isPostgresInteger(input.expectedVersion) || input.expectedVersion < 1) {
    issues.push({
      path: "expectedVersion",
      code: "invalid_positive_integer",
    });
  }
  if (!isPostgresInteger(input.requiredQuantity) || input.requiredQuantity < 0) {
    issues.push({
      path: "requiredQuantity",
      code: "invalid_non_negative_integer",
    });
  }
  if (!isPostgresInteger(input.observedQuantity) || input.observedQuantity < 0) {
    issues.push({
      path: "observedQuantity",
      code: "invalid_non_negative_integer",
    });
  } else if (
    isPostgresInteger(input.requiredQuantity) &&
    input.observedQuantity > input.requiredQuantity
  ) {
    issues.push({ path: "observedQuantity", code: "quantity_exceeds_required" });
  }

  return issues.length > 0
    ? {
        kind: "invalid_input",
        message: "Invalid daily item update input",
        issues,
      }
    : null;
}

export async function updateDailyItem(
  client: UpdateDailyItemClient,
  input: UpdateDailyItemInput,
): Promise<UpdateDailyItemResult> {
  let inputError: DailyDataInvalidInputError | null;
  try {
    inputError = validateUpdateDailyItemInput(input);
  } catch {
    inputError = {
      kind: "invalid_input",
      message: "Invalid daily item update input",
      issues: [{ path: "input", code: "input_validation_failed" }],
    };
  }

  if (inputError) {
    return { status: "client_error", error: inputError };
  }

  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc("update_daily_item", {
      p_family_id: input.familyId,
      p_child_id: input.childId,
      p_session_date: input.sessionDate,
      p_daily_item_id: input.dailyItemId,
      p_expected_version: input.expectedVersion,
      p_action: "set_observed_quantity",
      p_value: {
        observed_quantity: input.observedQuantity,
      },
    });
  } catch (error) {
    return {
      status: "transport_error",
      error: toDailyDataRpcError(error),
    };
  }

  try {
    if (response.error) {
      return {
        status: "transport_error",
        error: toDailyDataRpcError(response.error),
      };
    }

    return mapUpdateDailyItemResponse(response.data, input);
  } catch {
    return invalidResponse("Invalid update_daily_item response", [
      { path: "response", code: "response_read_failed" },
    ]);
  }
}

export function mapUpdateDailyItemResponse(
  value: unknown,
  input: UpdateDailyItemInput,
): UpdateDailyItemResult {
  try {
    return mapUpdateDailyItemResponseUnsafe(value, input);
  } catch {
    return invalidResponse("Invalid update_daily_item response", [
      { path: "response", code: "response_mapping_failed" },
    ]);
  }
}

function mapUpdateDailyItemResponseUnsafe(
  value: unknown,
  input: UpdateDailyItemInput,
): UpdateDailyItemResult {
  if (!isPlainObject(value) || typeof value.status !== "string") {
    return invalidResponse("Invalid update_daily_item response", [
      { path: "response", code: "invalid_status_envelope" },
    ]);
  }

  if (value.status === "success" || value.status === "conflict") {
    if (value.session !== null) {
      return invalidResponse("Invalid update_daily_item item response", [
        { path: "session", code: "unexpected_session" },
      ]);
    }

    const mapped = mapDailyItemPayload(value.item);
    if (mapped.ok === false) {
      return {
        status: "transport_error",
        error: mapped.error,
      };
    }

    const issues = validateResponseItemScope(mapped.data, input, value.status);
    if (issues.length > 0) {
      return invalidResponse(
        "update_daily_item response is outside the requested scope",
        issues,
      );
    }

    return { status: value.status, item: mapped.data };
  }

  if (value.status === "forbidden" || value.status === "not_found") {
    if (value.item !== null || value.session !== null) {
      return invalidResponse("Invalid update_daily_item business response", [
        { path: "response", code: "invalid_business_error_payload" },
      ]);
    }
    return { status: value.status };
  }

  if (value.status === "invalid_state") {
    const isPreparedSession = value.reason === "session_prepared";
    if (
      value.item !== null ||
      (!isPreparedSession && value.session !== null) ||
      (value.reason !== undefined && typeof value.reason !== "string")
    ) {
      return invalidResponse("Invalid update_daily_item state response", [
        { path: "response", code: "invalid_state_payload" },
      ]);
    }
    if (isPreparedSession) {
      const mappedSession = mapDailySessionPayload(value.session, []);
      if (mappedSession.ok === false) {
        return {
          status: "transport_error",
          error: mappedSession.error,
        };
      }
      const session = mappedSession.data;
      if (
        !uuidEquals(session.familyId, input.familyId) ||
        !uuidEquals(session.childId, input.childId) ||
        session.sessionDate !== input.sessionDate ||
        !uuidEquals(session.dailySessionId, input.dailySessionId) ||
        !session.isCompleted ||
        session.completedAt === null
      ) {
        return invalidResponse(
          "update_daily_item prepared session is outside the requested scope",
          [{ path: "session", code: "prepared_session_scope_mismatch" }],
        );
      }
    }
    return {
      status: "invalid_state",
      ...(isPreparedSession ? { reason: "session_prepared" as const } : {}),
    };
  }

  return invalidResponse("Invalid update_daily_item response status", [
    { path: "status", code: "unexpected_status" },
  ]);
}

function validateResponseItemScope(
  item: DailyItem,
  input: UpdateDailyItemInput,
  status: "success" | "conflict",
): DailyDataValidationIssue[] {
  const issues: DailyDataValidationIssue[] = [];
  if (!uuidEquals(item.dailyItemId, input.dailyItemId)) {
    issues.push({ path: "item.daily_item_id", code: "daily_item_id_mismatch" });
  }
  if (!uuidEquals(item.familyId, input.familyId)) {
    issues.push({ path: "item.family_id", code: "family_id_mismatch" });
  }
  if (!uuidEquals(item.dailySessionId, input.dailySessionId)) {
    issues.push({
      path: "item.daily_session_id",
      code: "daily_session_id_mismatch",
    });
  }
  if (item.kind !== "regular") {
    issues.push({ path: "item.kind", code: "unexpected_item_kind" });
  }
  if (item.requiredQuantity !== input.requiredQuantity) {
    issues.push({
      path: "item.required_quantity",
      code: "required_quantity_mismatch",
    });
  }

  if (status === "success") {
    if (item.version !== input.expectedVersion + 1) {
      issues.push({ path: "item.version", code: "unexpected_updated_version" });
    }
    if (item.observedQuantity !== input.observedQuantity) {
      issues.push({
        path: "item.observed_quantity",
        code: "observed_quantity_mismatch",
      });
    }
    if (item.shortageCount !== input.requiredQuantity - input.observedQuantity) {
      issues.push({
        path: "item.shortage_count",
        code: "shortage_count_mismatch",
      });
    }
  } else if (item.version === input.expectedVersion) {
    issues.push({ path: "item.version", code: "unexpected_conflict_version" });
  }

  return issues;
}
