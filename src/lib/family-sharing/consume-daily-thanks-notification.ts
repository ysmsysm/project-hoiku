import type {
  ConsumeDailyThanksNotificationClient,
  ConsumeDailyThanksNotificationInput,
  ConsumeDailyThanksNotificationResult,
  DailyDataInvalidInputError,
  DailyDataValidationIssue,
} from "../../types/daily";
import {
  isDailyDataIsoDateTime,
  isDailyDataUuid,
  normalizeDailyDataUuid,
  toDailyDataRpcError,
  validateDailyDataScopeInput,
} from "./daily-data";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

const invalidInput = (
  issues: DailyDataValidationIssue[] = [
    { path: "input", code: "invalid_object" },
  ],
): DailyDataInvalidInputError => ({
  kind: "invalid_input",
  message: "Invalid received daily thanks notification input",
  issues,
});

const invalidResponse = (
  issues: DailyDataValidationIssue[],
): ConsumeDailyThanksNotificationResult => ({
  status: "transport_error",
  error: {
    kind: "invalid_response",
    message: "Invalid consume_daily_thanks_notification response",
    issues,
  },
});

const snapshotInput = (
  input: ConsumeDailyThanksNotificationInput,
): ConsumeDailyThanksNotificationInput | null => {
  try {
    return {
      familyId: input.familyId,
      childId: input.childId,
      sessionDate: input.sessionDate,
      dailySessionId: input.dailySessionId,
      thanksSentAt: input.thanksSentAt,
    };
  } catch {
    return null;
  }
};

export function validateConsumeDailyThanksNotificationInput(
  input: ConsumeDailyThanksNotificationInput,
): DailyDataInvalidInputError | null {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return invalidInput();
  }

  const scopeError = validateDailyDataScopeInput(safeInput);
  const issues = scopeError ? [...scopeError.issues] : [];
  if (!isDailyDataUuid(safeInput.dailySessionId)) {
    issues.push({ path: "dailySessionId", code: "invalid_uuid" });
  }
  if (!isDailyDataIsoDateTime(safeInput.thanksSentAt)) {
    issues.push({ path: "thanksSentAt", code: "invalid_datetime" });
  }

  return issues.length > 0 ? invalidInput(issues) : null;
}

export async function consumeDailyThanksNotification(
  client: ConsumeDailyThanksNotificationClient,
  input: ConsumeDailyThanksNotificationInput,
): Promise<ConsumeDailyThanksNotificationResult> {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return { status: "client_error", error: invalidInput() };
  }
  const inputError = validateConsumeDailyThanksNotificationInput(safeInput);
  if (inputError) {
    return { status: "client_error", error: inputError };
  }

  let response: Awaited<
    ReturnType<ConsumeDailyThanksNotificationClient["rpc"]>
  >;
  try {
    response = await client.rpc("consume_daily_thanks_notification", {
      p_family_id: safeInput.familyId,
      p_child_id: safeInput.childId,
      p_session_date: safeInput.sessionDate,
      p_daily_session_id: safeInput.dailySessionId,
      p_thanks_sent_at: safeInput.thanksSentAt,
    });
  } catch (error) {
    return { status: "transport_error", error: toDailyDataRpcError(error) };
  }

  try {
    if (response.error) {
      return {
        status: "transport_error",
        error: toDailyDataRpcError(response.error),
      };
    }
    return mapConsumeDailyThanksNotificationResponse(response.data, safeInput);
  } catch {
    return invalidResponse([
      { path: "response", code: "response_snapshot_failed" },
    ]);
  }
}

export function mapConsumeDailyThanksNotificationResponse(
  value: unknown,
  input: ConsumeDailyThanksNotificationInput,
): ConsumeDailyThanksNotificationResult {
  try {
    if (
      !isPlainObject(value) ||
      typeof value.status !== "string" ||
      typeof value.consumed !== "boolean" ||
      typeof value.should_display !== "boolean"
    ) {
      return invalidResponse([
        { path: "response", code: "invalid_status_envelope" },
      ]);
    }

    const knownStatuses = new Set([
      "success",
      "conflict",
      "forbidden",
      "not_found",
      "invalid_state",
    ]);
    if (!knownStatuses.has(value.status)) {
      return invalidResponse([{ path: "status", code: "unexpected_status" }]);
    }

    const dailySessionId = value.daily_session_id;
    const thanksSentAt = value.thanks_sent_at;
    if (
      (dailySessionId !== null && !isDailyDataUuid(dailySessionId)) ||
      (thanksSentAt !== null && !isDailyDataIsoDateTime(thanksSentAt))
    ) {
      return invalidResponse([
        { path: "response", code: "invalid_event_metadata" },
      ]);
    }

    const isRequestedSession =
      typeof dailySessionId === "string" &&
      uuidEquals(dailySessionId, input.dailySessionId);
    const isRequestedEvent =
      typeof thanksSentAt === "string" &&
      thanksSentAt === input.thanksSentAt;
    const status = value.status as
      | "success"
      | "conflict"
      | "forbidden"
      | "not_found"
      | "invalid_state";

    if (status === "forbidden" || status === "not_found") {
      return !value.consumed &&
        !value.should_display &&
        dailySessionId === null &&
        thanksSentAt === null
        ? {
            status,
            consumed: false,
            shouldDisplay: false,
            dailySessionId: null,
            thanksSentAt: null,
          }
        : invalidResponse([
            { path: "response", code: "invalid_business_payload" },
          ]);
    }

    if (status === "conflict") {
      return !value.consumed &&
        !value.should_display &&
        isRequestedSession &&
        typeof thanksSentAt === "string" &&
        !isRequestedEvent
        ? {
            status,
            consumed: false,
            shouldDisplay: false,
            dailySessionId,
            thanksSentAt,
          }
        : invalidResponse([
            { path: "response", code: "invalid_conflict_payload" },
          ]);
    }

    if (status === "invalid_state") {
      const hasNoEvent = dailySessionId === null && thanksSentAt === null;
      const hasRequestedScope = isRequestedSession && isRequestedEvent;
      return !value.consumed &&
        !value.should_display &&
        (hasNoEvent || hasRequestedScope)
        ? {
            status,
            consumed: false,
            shouldDisplay: false,
            dailySessionId: hasRequestedScope ? dailySessionId : null,
            thanksSentAt: hasRequestedScope ? thanksSentAt : null,
          }
        : invalidResponse([
            { path: "response", code: "invalid_state_payload" },
          ]);
    }

    const isNoThanks =
      !value.consumed &&
      !value.should_display &&
      isRequestedSession &&
      thanksSentAt === null;
    const isConsumedEvent =
      value.consumed === value.should_display &&
      isRequestedSession &&
      isRequestedEvent;
    if (!isNoThanks && !isConsumedEvent) {
      return invalidResponse([
        { path: "response", code: "invalid_success_payload" },
      ]);
    }

    return {
      status: "success",
      consumed: value.consumed,
      shouldDisplay: value.should_display,
      dailySessionId: input.dailySessionId,
      thanksSentAt: isNoThanks ? null : input.thanksSentAt,
    };
  } catch {
    return invalidResponse([
      { path: "response", code: "response_mapping_failed" },
    ]);
  }
}
