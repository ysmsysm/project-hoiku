import type {
  DailyDataInvalidInputError,
  DailyDataValidationIssue,
  DeleteDailyItemClient,
  DeleteDailyItemInput,
  DeleteDailyItemReason,
  DeleteDailyItemResult,
  DeletedDailyItemMetadata,
  DeletedItemTemplateMetadata,
} from "../../types/daily";
import {
  isDailyDataIsoDateTime,
  isDailyDataUuid,
  isPostgresInteger,
  normalizeDailyDataUuid,
  toDailyDataRpcError,
  validateDailyDataScopeInput,
} from "./daily-data";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const uuidEquals = (left: string, right: string) =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

const invalidInput = (
  issues: DailyDataValidationIssue[] = [
    { path: "input", code: "invalid_object" },
  ],
): DailyDataInvalidInputError => ({
  kind: "invalid_input",
  message: "Invalid daily item deletion input",
  issues,
});

const invalidResponse = (
  issues: DailyDataValidationIssue[],
): DeleteDailyItemResult => ({
  status: "transport_error",
  error: {
    kind: "invalid_response",
    message: "Invalid daily item deletion response",
    issues,
  },
});

const snapshotInput = (
  input: DeleteDailyItemInput,
): DeleteDailyItemInput | null => {
  try {
    return {
      familyId: input.familyId,
      childId: input.childId,
      sessionDate: input.sessionDate,
      itemTemplateId: input.itemTemplateId,
      expectedTemplateUpdatedAt: input.expectedTemplateUpdatedAt,
      dailyItemId: input.dailyItemId,
      expectedDailyItemVersion: input.expectedDailyItemVersion,
    };
  } catch {
    return null;
  }
};

export function validateDeleteDailyItemInput(
  input: DeleteDailyItemInput,
): DailyDataInvalidInputError | null {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return invalidInput();
  }

  const scopeError = validateDailyDataScopeInput(safeInput);
  const issues = scopeError ? [...scopeError.issues] : [];
  if (!isDailyDataUuid(safeInput.itemTemplateId)) {
    issues.push({ path: "itemTemplateId", code: "invalid_uuid" });
  }
  if (!isDailyDataIsoDateTime(safeInput.expectedTemplateUpdatedAt)) {
    issues.push({ path: "expectedTemplateUpdatedAt", code: "invalid_timestamp" });
  }
  const hasDailyItemId = safeInput.dailyItemId !== null;
  const hasDailyItemVersion = safeInput.expectedDailyItemVersion !== null;
  if (hasDailyItemId !== hasDailyItemVersion) {
    issues.push({ path: "dailyItem", code: "invalid_nullable_pair" });
  } else if (hasDailyItemId) {
    if (!isDailyDataUuid(safeInput.dailyItemId)) {
      issues.push({ path: "dailyItemId", code: "invalid_uuid" });
    }
    if (
      !isPostgresInteger(safeInput.expectedDailyItemVersion) ||
      safeInput.expectedDailyItemVersion < 1
    ) {
      issues.push({
        path: "expectedDailyItemVersion",
        code: "invalid_positive_integer",
      });
    }
  }

  return issues.length === 0 ? null : invalidInput(issues);
}

type MappingResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: DailyDataValidationIssue[] };

const mapTemplate = (value: unknown): MappingResult<DeletedItemTemplateMetadata> => {
  if (!isPlainObject(value)) {
    return { ok: false, issues: [{ path: "template", code: "invalid_object" }] };
  }
  const issues: DailyDataValidationIssue[] = [];
  const itemTemplateId = value.id;
  const familyId = value.family_id;
  const childId = value.child_id;
  const isActive = value.is_active;
  const updatedAt = value.updated_at;
  if (!isDailyDataUuid(itemTemplateId)) {
    issues.push({ path: "template.id", code: "invalid_uuid" });
  }
  if (!isDailyDataUuid(familyId)) {
    issues.push({ path: "template.family_id", code: "invalid_uuid" });
  }
  if (!isDailyDataUuid(childId)) {
    issues.push({ path: "template.child_id", code: "invalid_uuid" });
  }
  if (typeof isActive !== "boolean") {
    issues.push({ path: "template.is_active", code: "invalid_boolean" });
  }
  if (!isDailyDataIsoDateTime(updatedAt)) {
    issues.push({ path: "template.updated_at", code: "invalid_timestamp" });
  }
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        data: {
          itemTemplateId: itemTemplateId as string,
          familyId: familyId as string,
          childId: childId as string,
          isActive: isActive as boolean,
          updatedAt: updatedAt as string,
        },
      };
};

const mapDailyItem = (value: unknown): MappingResult<DeletedDailyItemMetadata> => {
  if (!isPlainObject(value)) {
    return { ok: false, issues: [{ path: "daily_item", code: "invalid_object" }] };
  }
  const issues: DailyDataValidationIssue[] = [];
  const id = value.id;
  const dailyItemId = value.daily_item_id;
  const dailySessionId = value.daily_session_id;
  const familyId = value.family_id;
  const childId = value.child_id;
  const sessionDate = value.session_date;
  const itemTemplateId = value.item_template_id;
  const version = value.version;
  const deletedAt = value.deleted_at;
  const updatedAt = value.updated_at;
  const updatedByMemberId = value.updated_by_member_id;
  const updatedByUserId = value.updated_by_user_id;
  const updatedByDisplayName = value.updated_by_display_name;

  for (const [path, field] of [
    ["daily_item.id", id],
    ["daily_item.daily_item_id", dailyItemId],
    ["daily_item.daily_session_id", dailySessionId],
    ["daily_item.family_id", familyId],
    ["daily_item.child_id", childId],
    ["daily_item.item_template_id", itemTemplateId],
  ] as const) {
    if (!isDailyDataUuid(field)) {
      issues.push({ path, code: "invalid_uuid" });
    }
  }
  if (
    isDailyDataUuid(id) &&
    isDailyDataUuid(dailyItemId) &&
    !uuidEquals(id, dailyItemId)
  ) {
    issues.push({ path: "daily_item.daily_item_id", code: "id_mismatch" });
  }
  if (typeof sessionDate !== "string") {
    issues.push({ path: "daily_item.session_date", code: "invalid_date" });
  }
  if (!isPostgresInteger(version) || version < 1) {
    issues.push({ path: "daily_item.version", code: "invalid_positive_integer" });
  }
  if (deletedAt !== null && !isDailyDataIsoDateTime(deletedAt)) {
    issues.push({ path: "daily_item.deleted_at", code: "invalid_timestamp" });
  }
  if (!isDailyDataIsoDateTime(updatedAt)) {
    issues.push({ path: "daily_item.updated_at", code: "invalid_timestamp" });
  }
  for (const [path, field] of [
    ["daily_item.updated_by_member_id", updatedByMemberId],
    ["daily_item.updated_by_user_id", updatedByUserId],
  ] as const) {
    if (field !== null && !isDailyDataUuid(field)) {
      issues.push({ path, code: "invalid_nullable_uuid" });
    }
  }
  if (updatedByDisplayName !== null && typeof updatedByDisplayName !== "string") {
    issues.push({ path: "daily_item.updated_by_display_name", code: "invalid_nullable_string" });
  }
  const actorTuple = [updatedByMemberId, updatedByUserId, updatedByDisplayName];
  if (!actorTuple.every((field) => field === null) && !actorTuple.every((field) => field !== null)) {
    issues.push({ path: "daily_item.updated_by", code: "incomplete_actor_tuple" });
  }

  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        data: {
          dailyItemId: dailyItemId as string,
          dailySessionId: dailySessionId as string,
          familyId: familyId as string,
          childId: childId as string,
          sessionDate: sessionDate as string,
          itemTemplateId: itemTemplateId as string,
          version: version as number,
          deletedAt: deletedAt as string | null,
          updatedAt: updatedAt as string,
          updatedByMemberId: updatedByMemberId as string | null,
          updatedByUserId: updatedByUserId as string | null,
          updatedByDisplayName: updatedByDisplayName as string | null,
        },
      };
};

const validateTemplateScope = (
  template: DeletedItemTemplateMetadata,
  input: DeleteDailyItemInput,
) =>
  uuidEquals(template.familyId, input.familyId) &&
  uuidEquals(template.childId, input.childId) &&
  uuidEquals(template.itemTemplateId, input.itemTemplateId);

const validateDailyItemScope = (
  item: DeletedDailyItemMetadata,
  input: DeleteDailyItemInput,
) =>
  input.dailyItemId !== null &&
  uuidEquals(item.dailyItemId, input.dailyItemId) &&
  uuidEquals(item.familyId, input.familyId) &&
  uuidEquals(item.childId, input.childId) &&
  item.sessionDate === input.sessionDate &&
  uuidEquals(item.itemTemplateId, input.itemTemplateId);

const knownReason = (value: unknown): DeleteDailyItemReason | null =>
  value === "invalid_input" ||
  value === "daily_item_mismatch" ||
  value === "session_completed" ||
  value === "carryover_linked"
    ? value
    : null;

export function mapDeleteDailyItemResponse(
  value: unknown,
  input: DeleteDailyItemInput,
): DeleteDailyItemResult {
  try {
    if (
      !isPlainObject(value) ||
      typeof value.status !== "string" ||
      typeof value.changed !== "boolean"
    ) {
      return invalidResponse([{ path: "response", code: "invalid_envelope" }]);
    }
    if (value.status === "forbidden") {
      return value.changed === false &&
        value.reason === null &&
        value.template === null &&
        value.daily_item === null
        ? { status: "forbidden", changed: false }
        : invalidResponse([{ path: "response", code: "invalid_forbidden_payload" }]);
    }
    if (
      value.status !== "success" &&
      value.status !== "conflict" &&
      value.status !== "not_found" &&
      value.status !== "invalid_state"
    ) {
      return invalidResponse([{ path: "status", code: "unexpected_status" }]);
    }

    const mappedTemplate =
      value.template === null ? null : mapTemplate(value.template);
    if (mappedTemplate && mappedTemplate.ok === false) {
      return invalidResponse(mappedTemplate.issues);
    }
    const template =
      mappedTemplate?.ok === true ? mappedTemplate.data : undefined;
    if (template && !validateTemplateScope(template, input)) {
      return invalidResponse([{ path: "template", code: "scope_mismatch" }]);
    }
    const mappedDailyItem =
      value.daily_item === null ? null : mapDailyItem(value.daily_item);
    if (mappedDailyItem && mappedDailyItem.ok === false) {
      return invalidResponse(mappedDailyItem.issues);
    }
    const dailyItem =
      mappedDailyItem?.ok === true ? mappedDailyItem.data : undefined;
    if (dailyItem && !validateDailyItemScope(dailyItem, input)) {
      return invalidResponse([{ path: "daily_item", code: "scope_mismatch" }]);
    }

    if (value.status === "not_found") {
      return value.changed === false && value.reason === null && !dailyItem
        ? {
            status: "not_found",
            changed: false,
            ...(template ? { template } : {}),
          }
        : invalidResponse([{ path: "response", code: "invalid_not_found_payload" }]);
    }
    if (value.status === "invalid_state") {
      const reason = knownReason(value.reason);
      const metadataMatchesReason =
        reason === "invalid_input"
          ? (!template && !dailyItem) || Boolean(template && dailyItem)
          : reason === "carryover_linked"
            ? Boolean(template && dailyItem)
            : Boolean(template);
      return value.changed === false && reason && metadataMatchesReason
        ? {
            status: "invalid_state",
            changed: false,
            reason,
            ...(template ? { template } : {}),
            ...(dailyItem ? { dailyItem } : {}),
          }
        : invalidResponse([{ path: "reason", code: "unexpected_reason" }]);
    }
    if (!template || value.reason !== null) {
      return invalidResponse([{ path: "template", code: "missing_template" }]);
    }
    if (value.status === "conflict") {
      return value.changed === false
        ? { status: "conflict", changed: false, template, dailyItem: dailyItem ?? null }
        : invalidResponse([{ path: "changed", code: "invalid_conflict_changed" }]);
    }

    if (template.isActive) {
      return invalidResponse([{ path: "template.is_active", code: "template_still_active" }]);
    }
    if ((input.dailyItemId === null) !== (dailyItem === undefined)) {
      return invalidResponse([{ path: "daily_item", code: "nullable_pair_mismatch" }]);
    }
    if (dailyItem) {
      if (!dailyItem.deletedAt || !dailyItem.updatedByMemberId || !dailyItem.updatedByUserId) {
        return invalidResponse([{ path: "daily_item", code: "deletion_incomplete" }]);
      }
      if (
        value.changed &&
        (input.expectedDailyItemVersion === 2_147_483_647 ||
          dailyItem.version !== (input.expectedDailyItemVersion ?? 0) + 1)
      ) {
        return invalidResponse([{ path: "daily_item.version", code: "version_mismatch" }]);
      }
    }
    return {
      status: "success",
      changed: value.changed,
      template,
      dailyItem: dailyItem ?? null,
    };
  } catch {
    return invalidResponse([{ path: "response", code: "response_mapping_failed" }]);
  }
}

export async function deleteDailyItem(
  client: DeleteDailyItemClient,
  input: DeleteDailyItemInput,
): Promise<DeleteDailyItemResult> {
  const safeInput = snapshotInput(input);
  if (!safeInput) {
    return { status: "client_error", error: invalidInput() };
  }
  const inputError = validateDeleteDailyItemInput(safeInput);
  if (inputError) {
    return { status: "client_error", error: inputError };
  }

  let response: Awaited<ReturnType<DeleteDailyItemClient["rpc"]>>;
  try {
    response = await client.rpc("delete_family_item_template_for_day", {
      p_family_id: safeInput.familyId,
      p_child_id: safeInput.childId,
      p_session_date: safeInput.sessionDate,
      p_item_template_id: safeInput.itemTemplateId,
      p_expected_template_updated_at: safeInput.expectedTemplateUpdatedAt,
      p_daily_item_id: safeInput.dailyItemId,
      p_expected_daily_item_version: safeInput.expectedDailyItemVersion,
    });
  } catch (error) {
    return { status: "transport_error", error: toDailyDataRpcError(error) };
  }

  try {
    if (response.error) {
      return { status: "transport_error", error: toDailyDataRpcError(response.error) };
    }
    return mapDeleteDailyItemResponse(response.data, safeInput);
  } catch {
    return invalidResponse([{ path: "response", code: "response_snapshot_failed" }]);
  }
}
