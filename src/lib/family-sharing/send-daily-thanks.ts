import type {
  DailyDataInvalidInputError,
  DailyDataValidationIssue,
  DailySessionMetadata,
  SendDailyThanksClient,
  SendDailyThanksInput,
  SendDailyThanksReason,
  SendDailyThanksResult,
} from "../../types/daily";
import {
  isPostgresInteger,
  mapDailySessionMetadataPayload,
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
): SendDailyThanksResult => ({
  status: "transport_error",
  error: { kind: "invalid_response", message, issues },
});

const invalidInput = (): DailyDataInvalidInputError => ({
  kind: "invalid_input",
  message: "Invalid daily thanks input",
  issues: [{ path: "input", code: "invalid_object" }],
});

const snapshotInput = (
  input: SendDailyThanksInput,
): SendDailyThanksInput | null => {
  try {
    return {
      familyId: input.familyId,
      childId: input.childId,
      sessionDate: input.sessionDate,
      expectedSessionVersion: input.expectedSessionVersion,
    };
  } catch {
    return null;
  }
};

export function validateSendDailyThanksInput(
  input: SendDailyThanksInput,
): DailyDataInvalidInputError | null {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return invalidInput();
  }
  const scopeError = validateDailyDataScopeInput(safeInput);
  const issues = scopeError ? [...scopeError.issues] : [];
  if (
    !isPostgresInteger(safeInput.expectedSessionVersion) ||
    safeInput.expectedSessionVersion < 1
  ) {
    issues.push({
      path: "expectedSessionVersion",
      code: "invalid_positive_integer",
    });
  }
  return issues.length === 0
    ? null
    : {
        kind: "invalid_input",
        message: "Invalid daily thanks input",
        issues,
      };
}

const getKnownReason = (value: unknown): SendDailyThanksReason | null =>
  value === "invalid_input" ||
  value === "preparation_incomplete" ||
  value === "recipient_missing" ||
  value === "self_recipient"
    ? value
    : null;

const validateSessionScope = (
  session: DailySessionMetadata,
  input: SendDailyThanksInput,
): DailyDataValidationIssue[] => {
  const issues: DailyDataValidationIssue[] = [];
  if (!uuidEquals(session.familyId, input.familyId)) {
    issues.push({ path: "session.family_id", code: "family_id_mismatch" });
  }
  if (!uuidEquals(session.childId, input.childId)) {
    issues.push({ path: "session.child_id", code: "child_id_mismatch" });
  }
  if (session.sessionDate !== input.sessionDate) {
    issues.push({ path: "session.session_date", code: "session_date_mismatch" });
  }
  return issues;
};

const validateSentSession = (
  session: DailySessionMetadata,
): DailyDataValidationIssue[] => {
  const issues: DailyDataValidationIssue[] = [];
  if (!session.isChecked || !session.checkedAt) {
    issues.push({ path: "session.checked_at", code: "check_incomplete" });
  }
  if (
    !session.checkedByMemberId ||
    !session.checkedByUserId ||
    session.checkedByDisplayName === null
  ) {
    issues.push({
      path: "session.checked_by_member_id",
      code: "checker_incomplete",
    });
  }
  if (
    !session.isCompleted ||
    !session.completedAt ||
    !session.completedByMemberId ||
    !session.completedByUserId ||
    session.completedByDisplayName === null
  ) {
    issues.push({ path: "session.prepared_at", code: "preparation_incomplete" });
  }
  if (
    !session.thanksSent ||
    !session.thanksSentAt ||
    !session.thanksSentByMemberId ||
    !session.thanksSentByUserId ||
    session.thanksSentByDisplayName === null
  ) {
    issues.push({ path: "session.thanks_sent_at", code: "sender_incomplete" });
  }
  if (
    !session.thanksReceivedByMemberId ||
    !session.thanksReceivedByUserId ||
    session.thanksReceivedByDisplayName === null
  ) {
    issues.push({
      path: "session.thanks_received_by_member_id",
      code: "recipient_incomplete",
    });
  }
  if (
    session.completedByMemberId &&
    session.thanksReceivedByMemberId &&
    !uuidEquals(
      session.completedByMemberId,
      session.thanksReceivedByMemberId,
    )
  ) {
    issues.push({
      path: "session.thanks_received_by_member_id",
      code: "recipient_preparer_mismatch",
    });
  }
  if (
    session.thanksSentByMemberId &&
    session.thanksReceivedByMemberId &&
    uuidEquals(session.thanksSentByMemberId, session.thanksReceivedByMemberId)
  ) {
    issues.push({
      path: "session.thanks_sent_by_member_id",
      code: "self_recipient",
    });
  }
  return issues;
};

export async function sendDailyThanks(
  client: SendDailyThanksClient,
  input: SendDailyThanksInput,
): Promise<SendDailyThanksResult> {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return { status: "client_error", error: invalidInput() };
  }
  const inputError = validateSendDailyThanksInput(safeInput);
  if (inputError) {
    return { status: "client_error", error: inputError };
  }

  let response: Awaited<ReturnType<SendDailyThanksClient["rpc"]>>;
  try {
    response = await client.rpc("send_daily_thanks", {
      p_family_id: safeInput.familyId,
      p_child_id: safeInput.childId,
      p_session_date: safeInput.sessionDate,
      p_expected_version: safeInput.expectedSessionVersion,
    });
  } catch (error) {
    return { status: "transport_error", error: toDailyDataRpcError(error) };
  }
  let responseData: unknown;
  try {
    const responseError = response.error;
    if (responseError) {
      return {
        status: "transport_error",
        error: toDailyDataRpcError(responseError),
      };
    }
    responseData = response.data;
  } catch {
    return invalidResponse("Invalid send_daily_thanks response", [
      { path: "response", code: "response_snapshot_failed" },
    ]);
  }

  try {
    return mapSendDailyThanksResponse(responseData, safeInput);
  } catch {
    return invalidResponse("Invalid send_daily_thanks response", [
      { path: "response", code: "response_mapping_failed" },
    ]);
  }
}

export function mapSendDailyThanksResponse(
  value: unknown,
  input: SendDailyThanksInput,
): SendDailyThanksResult {
  try {
    return mapSendDailyThanksResponseUnsafe(value, input);
  } catch {
    return invalidResponse("Invalid send_daily_thanks response", [
      { path: "response", code: "response_mapping_failed" },
    ]);
  }
}

function mapSendDailyThanksResponseUnsafe(
  value: unknown,
  input: SendDailyThanksInput,
): SendDailyThanksResult {
  if (
    !isPlainObject(value) ||
    typeof value.status !== "string" ||
    typeof value.changed !== "boolean"
  ) {
    return invalidResponse("Invalid send_daily_thanks response", [
      { path: "response", code: "invalid_status_envelope" },
    ]);
  }

  if (value.status === "forbidden" || value.status === "not_found") {
    return value.changed === false &&
      value.session === null &&
      value.reason === null
      ? { status: value.status, changed: false }
      : invalidResponse("Invalid daily thanks business response", [
          { path: "response", code: "invalid_business_payload" },
        ]);
  }

  if (
    value.status !== "success" &&
    value.status !== "conflict" &&
    value.status !== "invalid_state"
  ) {
    return invalidResponse("Invalid daily thanks response status", [
      { path: "status", code: "unexpected_status" },
    ]);
  }

  if (value.status === "invalid_state") {
    const reason = getKnownReason(value.reason);
    if (!reason || value.changed !== false) {
      return invalidResponse("Invalid daily thanks state response", [
        { path: "reason", code: "unexpected_reason" },
      ]);
    }
    if (value.session === null) {
      return reason === "invalid_input"
        ? { status: "invalid_state", changed: false, reason }
        : invalidResponse("Invalid daily thanks state session", [
            { path: "session", code: "missing_session" },
          ]);
    }
    const mapped = mapDailySessionMetadataPayload(value.session);
    if (mapped.ok === false) {
      return { status: "transport_error", error: mapped.error };
    }
    const scopeIssues = validateSessionScope(mapped.data, input);
    if (scopeIssues.length > 0) {
      return invalidResponse(
        "Daily thanks response is outside requested scope",
        scopeIssues,
      );
    }
    return {
      status: "invalid_state",
      changed: false,
      reason,
      session: mapped.data,
    };
  }

  if (value.reason !== null || value.session === null) {
    return invalidResponse("Invalid daily thanks session response", [
      { path: "session", code: "missing_or_invalid_session" },
    ]);
  }
  const mapped = mapDailySessionMetadataPayload(value.session);
  if (mapped.ok === false) {
    return { status: "transport_error", error: mapped.error };
  }
  const scopeIssues = validateSessionScope(mapped.data, input);
  const issues = [...scopeIssues, ...validateSentSession(mapped.data)];

  if (value.status === "success") {
    if (
      (value.changed &&
        (input.expectedSessionVersion === 2_147_483_647 ||
          mapped.data.version !== input.expectedSessionVersion + 1)) ||
      issues.length > 0
    ) {
      return invalidResponse("Invalid daily thanks success response", [
        ...issues,
        ...(value.changed &&
        mapped.data.version !== input.expectedSessionVersion + 1
          ? [{ path: "session.version", code: "version_mismatch" }]
          : []),
      ]);
    }
    return { status: "success", changed: value.changed, session: mapped.data };
  }

  if (
    value.changed !== false ||
    scopeIssues.length > 0 ||
    mapped.data.version === input.expectedSessionVersion ||
    mapped.data.thanksSent ||
    !mapped.data.isChecked ||
    !mapped.data.checkedAt ||
    !mapped.data.checkedByMemberId ||
    !mapped.data.checkedByUserId ||
    mapped.data.checkedByDisplayName === null ||
    !mapped.data.isCompleted ||
    !mapped.data.completedAt ||
    !mapped.data.completedByMemberId ||
    !mapped.data.completedByUserId ||
    mapped.data.completedByDisplayName === null
  ) {
    return invalidResponse("Invalid daily thanks conflict response", [
      { path: "response", code: "invalid_conflict_payload" },
    ]);
  }
  return { status: "conflict", changed: false, session: mapped.data };
}
