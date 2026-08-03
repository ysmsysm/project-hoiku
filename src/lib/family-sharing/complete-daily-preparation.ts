import type {
  CompleteDailyPreparationInput,
  CompleteDailyPreparationClient,
  CompleteDailyPreparationReason,
  CompleteDailyPreparationResult,
  DailyDataInvalidInputError,
  DailyDataValidationIssue,
  DailySessionMetadata,
} from "../../types/daily";
import {
  isPostgresInteger,
  mapDailySessionMetadataPayload,
  normalizeDailyDataUuid,
  toDailyDataRpcError,
  validateDailyDataScopeInput,
} from "./daily-data";

const getKnownInvalidStateReason = (
  value: unknown,
): CompleteDailyPreparationReason | undefined =>
  value === "daily_check_incomplete" ||
  value === "preparation_items_incomplete"
    ? value
    : undefined;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const invalidResponse = (
  message: string,
  issues: DailyDataValidationIssue[],
): CompleteDailyPreparationResult => ({
  status: "transport_error",
  error: { kind: "invalid_response", message, issues },
});

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

const invalidInput = (): DailyDataInvalidInputError => ({
  kind: "invalid_input",
  message: "Invalid daily preparation completion input",
  issues: [{ path: "input", code: "invalid_object" }],
});

const snapshotInput = (
  input: CompleteDailyPreparationInput,
): CompleteDailyPreparationInput | null => {
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

export function validateCompleteDailyPreparationInput(
  input: CompleteDailyPreparationInput,
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
        message: "Invalid daily preparation completion input",
        issues,
      };
}

const validateSessionScope = (
  session: DailySessionMetadata,
  input: CompleteDailyPreparationInput,
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

export async function completeDailyPreparation(
  client: CompleteDailyPreparationClient,
  input: CompleteDailyPreparationInput,
): Promise<CompleteDailyPreparationResult> {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return { status: "client_error", error: invalidInput() };
  }
  const inputError = validateCompleteDailyPreparationInput(safeInput);
  if (inputError) {
    return { status: "client_error", error: inputError };
  }

  let response: Awaited<ReturnType<CompleteDailyPreparationClient["rpc"]>>;
  try {
    response = await client.rpc("complete_daily_preparation", {
      p_family_id: safeInput.familyId,
      p_child_id: safeInput.childId,
      p_session_date: safeInput.sessionDate,
      p_expected_version: safeInput.expectedSessionVersion,
    });
  } catch (error) {
    return { status: "transport_error", error: toDailyDataRpcError(error) };
  }
  if (response.error) {
    return {
      status: "transport_error",
      error: toDailyDataRpcError(response.error),
    };
  }

  try {
    return mapCompleteDailyPreparationResponse(response.data, safeInput);
  } catch {
    return invalidResponse("Invalid complete_daily_preparation response", [
      { path: "response", code: "response_mapping_failed" },
    ]);
  }
}

export function mapCompleteDailyPreparationResponse(
  value: unknown,
  input: CompleteDailyPreparationInput,
): CompleteDailyPreparationResult {
  if (
    !isPlainObject(value) ||
    typeof value.status !== "string" ||
    typeof value.changed !== "boolean"
  ) {
    return invalidResponse("Invalid complete_daily_preparation response", [
      { path: "response", code: "invalid_status_envelope" },
    ]);
  }

  if (value.status === "forbidden" || value.status === "not_found") {
    return value.changed === false && value.session === null
      ? { status: value.status, changed: false }
      : invalidResponse("Invalid completion business response", [
          { path: "response", code: "invalid_business_payload" },
        ]);
  }

  if (
    value.status !== "success" &&
    value.status !== "conflict" &&
    value.status !== "invalid_state"
  ) {
    return invalidResponse("Invalid completion response status", [
      { path: "status", code: "unexpected_status" },
    ]);
  }

  if (value.session === null) {
    if (value.status !== "invalid_state" || value.changed !== false) {
      return invalidResponse("Invalid completion session response", [
        { path: "session", code: "missing_session" },
      ]);
    }
    if (value.reason !== undefined) {
      return invalidResponse("Invalid completion invalid-state response", [
        { path: "reason", code: "unexpected_reason" },
      ]);
    }
    return { status: "invalid_state", changed: false };
  }

  const mapped = mapDailySessionMetadataPayload(value.session);
  if (mapped.ok === false) {
    return { status: "transport_error", error: mapped.error };
  }
  const scopeIssues = validateSessionScope(mapped.data, input);
  if (scopeIssues.length > 0) {
    return invalidResponse("Completion response is outside requested scope", scopeIssues);
  }

  if (value.status === "success") {
    const validChangedVersion =
      value.changed === true &&
      mapped.data.version === input.expectedSessionVersion + 1;
    const validNoOpVersion = value.changed === false;
    if (
      (!validChangedVersion && !validNoOpVersion) ||
      !mapped.data.isChecked ||
      !mapped.data.checkedAt ||
      !mapped.data.isCompleted ||
      !mapped.data.completedAt
    ) {
      return invalidResponse("Invalid completion success response", [
        { path: "session", code: "invalid_completed_session" },
      ]);
    }
    return { status: "success", changed: value.changed, session: mapped.data };
  }

  if (value.changed !== false || mapped.data.isCompleted) {
    return invalidResponse("Invalid completion non-success response", [
      { path: "response", code: "invalid_non_success_payload" },
    ]);
  }
  if (value.status === "conflict") {
    return { status: "conflict", changed: false, session: mapped.data };
  }

  const reason = getKnownInvalidStateReason(value.reason);
  if (value.reason !== undefined && !reason) {
    return invalidResponse("Invalid completion invalid-state reason", [
      { path: "reason", code: "unexpected_reason" },
    ]);
  }
  return {
    status: "invalid_state",
    changed: false,
    ...(reason ? { reason } : {}),
    session: mapped.data,
  };
}
