import type {
  CompleteDailyCheckClient,
  CompleteDailyCheckInput,
  CompleteDailyCheckResult,
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

const postgresIntegerMax = 2_147_483_647;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

const invalidResponse = (
  message: string,
  issues: DailyDataValidationIssue[],
): CompleteDailyCheckResult => ({
  status: "transport_error",
  error: { kind: "invalid_response", message, issues },
});

const invalidInput = (
  issues: DailyDataValidationIssue[] = [
    { path: "input", code: "invalid_object" },
  ],
): DailyDataInvalidInputError => ({
  kind: "invalid_input",
  message: "Invalid daily check completion input",
  issues,
});

const snapshotInput = (
  input: CompleteDailyCheckInput,
): CompleteDailyCheckInput | null => {
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

export function validateCompleteDailyCheckInput(
  input: CompleteDailyCheckInput,
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
  } else if (safeInput.expectedSessionVersion >= postgresIntegerMax) {
    issues.push({
      path: "expectedSessionVersion",
      code: "version_increment_overflow",
    });
  }
  return issues.length === 0 ? null : invalidInput(issues);
}

const validateSessionScope = (
  session: DailySessionMetadata,
  input: CompleteDailyCheckInput,
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

const allNull = (...values: unknown[]): boolean =>
  values.every((value) => value === null);

const allPresent = (...values: unknown[]): boolean =>
  values.every((value) => value !== null);

const validateSessionActors = (
  session: DailySessionMetadata,
): DailyDataValidationIssue[] => {
  const issues: DailyDataValidationIssue[] = [];
  const checkedActors = [
    session.checkedByMemberId,
    session.checkedByUserId,
    session.checkedByDisplayName,
  ];
  if (session.isChecked) {
    if (!session.checkedAt || !allPresent(...checkedActors)) {
      issues.push({ path: "session.checked_by", code: "checker_incomplete" });
    }
  } else if (session.checkedAt !== null || !allNull(...checkedActors)) {
    issues.push({ path: "session.checked_by", code: "checker_state_mismatch" });
  }

  const preparedActors = [
    session.completedByMemberId,
    session.completedByUserId,
    session.completedByDisplayName,
  ];
  if (session.isCompleted) {
    if (!session.completedAt || !allPresent(...preparedActors)) {
      issues.push({ path: "session.prepared_by", code: "preparer_incomplete" });
    }
  } else if (session.completedAt !== null || !allNull(...preparedActors)) {
    issues.push({ path: "session.prepared_by", code: "preparer_state_mismatch" });
  }

  const thanksActors = [
    session.thanksSentByMemberId,
    session.thanksSentByUserId,
    session.thanksSentByDisplayName,
    session.thanksReceivedByMemberId,
    session.thanksReceivedByUserId,
    session.thanksReceivedByDisplayName,
  ];
  if (session.thanksSent) {
    if (
      !session.thanksSentAt ||
      !session.isCompleted ||
      !allPresent(...thanksActors)
    ) {
      issues.push({ path: "session.thanks_sent_by", code: "thanks_actor_incomplete" });
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
      uuidEquals(
        session.thanksSentByMemberId,
        session.thanksReceivedByMemberId,
      )
    ) {
      issues.push({
        path: "session.thanks_sent_by_member_id",
        code: "self_recipient",
      });
    }
  } else if (session.thanksSentAt !== null || !allNull(...thanksActors)) {
    issues.push({ path: "session.thanks_sent_by", code: "thanks_state_mismatch" });
  }
  return issues;
};

export async function completeDailyCheck(
  client: CompleteDailyCheckClient,
  input: CompleteDailyCheckInput,
): Promise<CompleteDailyCheckResult> {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return { status: "client_error", error: invalidInput() };
  }
  const inputError = validateCompleteDailyCheckInput(safeInput);
  if (inputError) {
    return { status: "client_error", error: inputError };
  }

  let response: Awaited<ReturnType<CompleteDailyCheckClient["rpc"]>>;
  try {
    response = await client.rpc("complete_daily_check", {
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
    if (response.error) {
      return {
        status: "transport_error",
        error: toDailyDataRpcError(response.error),
      };
    }
    responseData = response.data;
  } catch {
    return invalidResponse("Invalid complete_daily_check response", [
      { path: "response", code: "response_snapshot_failed" },
    ]);
  }

  return mapCompleteDailyCheckResponse(responseData, safeInput);
}

export function mapCompleteDailyCheckResponse(
  value: unknown,
  input: CompleteDailyCheckInput,
): CompleteDailyCheckResult {
  try {
    return mapCompleteDailyCheckResponseUnsafe(value, input);
  } catch {
    return invalidResponse("Invalid complete_daily_check response", [
      { path: "response", code: "response_mapping_failed" },
    ]);
  }
}

function mapCompleteDailyCheckResponseUnsafe(
  value: unknown,
  input: CompleteDailyCheckInput,
): CompleteDailyCheckResult {
  if (!isPlainObject(value) || typeof value.status !== "string") {
    return invalidResponse("Invalid complete_daily_check response", [
      { path: "response", code: "invalid_status_envelope" },
    ]);
  }
  if ("reason" in value && value.reason !== null && value.reason !== undefined) {
    return invalidResponse("Invalid complete_daily_check reason", [
      { path: "reason", code: "unexpected_reason" },
    ]);
  }
  if (
    value.status === "forbidden" ||
    value.status === "not_found" ||
    value.status === "invalid_state"
  ) {
    return value.session === null
      ? { status: value.status, changed: false }
      : invalidResponse("Invalid daily check completion business response", [
          { path: "session", code: "unexpected_session" },
        ]);
  }
  if (value.status !== "success" && value.status !== "conflict") {
    return invalidResponse("Invalid complete_daily_check response status", [
      { path: "status", code: "unexpected_status" },
    ]);
  }
  if (value.session === null || value.session === undefined) {
    return invalidResponse("Invalid daily check completion session response", [
      { path: "session", code: "missing_session" },
    ]);
  }

  const mapped = mapDailySessionMetadataPayload(value.session);
  if (mapped.ok === false) {
    return { status: "transport_error", error: mapped.error };
  }
  const scopeIssues = validateSessionScope(mapped.data, input);
  const actorIssues = validateSessionActors(mapped.data);

  if (value.status === "conflict") {
    if (
      scopeIssues.length > 0 ||
      actorIssues.length > 0 ||
      mapped.data.version === input.expectedSessionVersion
    ) {
      return invalidResponse("Invalid daily check completion conflict response", [
        ...scopeIssues,
        ...actorIssues,
        ...(mapped.data.version === input.expectedSessionVersion
          ? [{ path: "session.version", code: "unexpected_conflict_version" }]
          : []),
      ]);
    }
    return { status: "conflict", changed: false, session: mapped.data };
  }

  const changed = mapped.data.version === input.expectedSessionVersion + 1;
  const noOp = mapped.data.version === input.expectedSessionVersion;
  const successIssues = [...scopeIssues, ...actorIssues];
  if (!mapped.data.isChecked || !mapped.data.checkedAt) {
    successIssues.push({ path: "session.checked_at", code: "check_incomplete" });
  }
  if (!changed && !noOp) {
    successIssues.push({ path: "session.version", code: "version_mismatch" });
  }
  if (successIssues.length > 0) {
    return invalidResponse("Invalid daily check completion success response", successIssues);
  }
  return { status: "success", changed, session: mapped.data };
}
