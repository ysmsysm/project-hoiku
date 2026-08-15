import type {
  DailyDataClient,
  DailyDataInvalidInputError,
  DailyDataInvalidResponseError,
  DailyDataRpcError,
  DailyDataValidationIssue,
  DailyItem,
  DailyItemKind,
  DailyItemPayload,
  DailyRoughState,
  DailySession,
  DailySessionMetadata,
  DailySessionPayload,
  LoadDailyDataInput,
  LoadDailyDataResult,
  UpdatedDailyItem,
} from "../../types/daily";

export type DailyDataMappingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DailyDataInvalidResponseError };

const postgresIntegerMin = -2_147_483_648;
const postgresIntegerMax = 2_147_483_647;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isDailyDataUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

export const normalizeDailyDataUuid = (value: string): string =>
  value.toLowerCase();

export const isPostgresInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= postgresIntegerMin &&
  value <= postgresIntegerMax;

const isValidCalendarDate = (
  year: number,
  month: number,
  day: number,
): boolean => {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
};

export const isDailyDataIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !isoDatePattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  return isValidCalendarDate(year, month, day);
};

const isIsoDate = isDailyDataIsoDate;

export const isDailyDataIsoDateTime = (
  value: unknown,
): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const match = isoDateTimePattern.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second, , timezone, offsetHour, offsetMinute] =
    match;
  if (
    !isValidCalendarDate(Number(year), Number(month), Number(day)) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    return false;
  }
  if (
    timezone !== "Z" &&
    (Number(offsetHour) > 23 || Number(offsetMinute) > 59)
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
};

class DailyPayloadReader {
  readonly issues: DailyDataValidationIssue[] = [];

  add(path: string, code: string) {
    this.issues.push({ path, code });
  }

  uuid(value: unknown, path: string): string {
    if (!isDailyDataUuid(value)) {
      this.add(path, "invalid_uuid");
      return "";
    }
    return value;
  }

  nullableUuid(value: unknown, path: string): string | null {
    if (value === null) {
      return null;
    }
    return this.uuid(value, path);
  }

  string(value: unknown, path: string): string {
    if (typeof value !== "string") {
      this.add(path, "invalid_string");
      return "";
    }
    return value;
  }

  nullableString(value: unknown, path: string): string | null {
    if (value === null) {
      return null;
    }
    return this.string(value, path);
  }

  postgresInteger(value: unknown, path: string): number {
    if (!isPostgresInteger(value)) {
      this.add(path, "invalid_postgres_integer");
      return 0;
    }
    return value;
  }

  boolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") {
      this.add(path, "invalid_boolean");
      return false;
    }
    return value;
  }

  nonNegativeInteger(value: unknown, path: string): number {
    if (!isPostgresInteger(value) || value < 0) {
      this.add(path, "invalid_non_negative_integer");
      return 0;
    }
    return value as number;
  }

  nullableNonNegativeInteger(value: unknown, path: string): number | null {
    if (value === null) {
      return null;
    }
    return this.nonNegativeInteger(value, path);
  }

  positiveInteger(value: unknown, path: string): number {
    if (!isPostgresInteger(value) || value < 1) {
      this.add(path, "invalid_positive_integer");
      return 1;
    }
    return value as number;
  }

  date(value: unknown, path: string): string {
    if (!isIsoDate(value)) {
      this.add(path, "invalid_iso_date");
      return "";
    }
    return value;
  }

  nullableDate(value: unknown, path: string): string | null {
    if (value === null) {
      return null;
    }
    return this.date(value, path);
  }

  dateTime(value: unknown, path: string): string {
    if (!isDailyDataIsoDateTime(value)) {
      this.add(path, "invalid_iso_datetime");
      return "";
    }
    return value;
  }

  nullableDateTime(value: unknown, path: string): string | null {
    if (value === null) {
      return null;
    }
    return this.dateTime(value, path);
  }

  itemKind(value: unknown, path: string): DailyItemKind {
    if (value !== "regular" && value !== "spot" && value !== "rough") {
      this.add(path, "invalid_daily_item_kind");
      return "regular";
    }
    return value;
  }

  roughState(value: unknown, path: string): DailyRoughState | null {
    if (value === null) {
      return null;
    }
    if (value !== "enough" && value !== "low" && value !== "refill") {
      this.add(path, "invalid_daily_rough_state");
      return null;
    }
    return value;
  }
}

const invalidResponse = (
  message: string,
  issues: DailyDataValidationIssue[],
): DailyDataInvalidResponseError => ({
  kind: "invalid_response",
  message,
  issues,
});

const mappingFailure = <T>(
  message: string,
  issues: DailyDataValidationIssue[],
): DailyDataMappingResult<T> => ({
  ok: false,
  error: invalidResponse(message, issues),
});

export function mapDailyItemPayload(
  value: unknown,
  path = "item",
): DailyDataMappingResult<DailyItem> {
  if (!isPlainObject(value)) {
    return mappingFailure("Invalid daily item response", [
      { path, code: "invalid_object" },
    ]);
  }

  const payload = value as DailyItemPayload;
  const reader = new DailyPayloadReader();
  const id = reader.uuid(payload.id, `${path}.id`);
  const dailyItemId = reader.uuid(
    payload.daily_item_id,
    `${path}.daily_item_id`,
  );
  const sessionId = reader.uuid(payload.session_id, `${path}.session_id`);
  const dailySessionId = reader.uuid(
    payload.daily_session_id,
    `${path}.daily_session_id`,
  );

  if (id && dailyItemId && id !== dailyItemId) {
    reader.add(`${path}.daily_item_id`, "daily_item_id_mismatch");
  }
  if (sessionId && dailySessionId && sessionId !== dailySessionId) {
    reader.add(`${path}.daily_session_id`, "daily_session_id_mismatch");
  }

  const item: DailyItem = {
    dailyItemId,
    dailySessionId,
    familyId: reader.uuid(payload.family_id, `${path}.family_id`),
    itemTemplateId: reader.nullableUuid(
      payload.item_template_id,
      `${path}.item_template_id`,
    ),
    kind: reader.itemKind(payload.kind, `${path}.kind`),
    isAdHoc: reader.boolean(payload.is_ad_hoc, `${path}.is_ad_hoc`),
    name: reader.string(payload.name, `${path}.name`),
    requiredQuantity: reader.nonNegativeInteger(
      payload.required_quantity,
      `${path}.required_quantity`,
    ),
    observedQuantity: reader.nullableNonNegativeInteger(
      payload.observed_quantity,
      `${path}.observed_quantity`,
    ),
    shortageCount: reader.nullableNonNegativeInteger(
      payload.shortage_count,
      `${path}.shortage_count`,
    ),
    quantity: reader.nonNegativeInteger(payload.quantity, `${path}.quantity`),
    unit: reader.nullableString(payload.unit, `${path}.unit`),
    roughState: reader.roughState(payload.rough_state, `${path}.rough_state`),
    isChecked: reader.boolean(payload.is_checked, `${path}.is_checked`),
    isPrepared: reader.boolean(payload.is_prepared, `${path}.is_prepared`),
    isDeferred: reader.boolean(payload.is_deferred, `${path}.is_deferred`),
    isCarryover: reader.boolean(payload.is_carryover, `${path}.is_carryover`),
    carryoverPendingShortageCount: reader.nullableNonNegativeInteger(
      payload.carryover_pending_shortage_count,
      `${path}.carryover_pending_shortage_count`,
    ),
    carriedFromDailyItemId: reader.nullableUuid(
      payload.carried_from_daily_item_id,
      `${path}.carried_from_daily_item_id`,
    ),
    carryoverProcessedAt: reader.nullableDateTime(
      payload.carryover_processed_at,
      `${path}.carryover_processed_at`,
    ),
    carryoverResolvedAt: reader.nullableDateTime(
      payload.carryover_resolved_at,
      `${path}.carryover_resolved_at`,
    ),
    dueDate: reader.nullableDate(payload.due_date, `${path}.due_date`),
    sortOrder: reader.postgresInteger(payload.sort_order, `${path}.sort_order`),
    version: reader.positiveInteger(payload.version, `${path}.version`),
    deletedAt: null,
    updatedByMemberId: reader.nullableUuid(
      payload.updated_by_member_id,
      `${path}.updated_by_member_id`,
    ),
    updatedByUserId: reader.nullableUuid(
      payload.updated_by_user_id,
      `${path}.updated_by_user_id`,
    ),
    updatedByDisplayName: reader.nullableString(
      payload.updated_by_display_name,
      `${path}.updated_by_display_name`,
    ),
    createdAt: reader.dateTime(payload.created_at, `${path}.created_at`),
    updatedAt: reader.dateTime(payload.updated_at, `${path}.updated_at`),
  };

  if (reader.issues.length > 0) {
    return mappingFailure("Invalid daily item response", reader.issues);
  }

  return { ok: true, data: item };
}

export function mapUpdatedDailyItemPayload(
  value: unknown,
  path = "item",
): DailyDataMappingResult<UpdatedDailyItem> {
  const mappedItem = mapDailyItemPayload(value, path);
  if (mappedItem.ok === false) {
    return mappedItem;
  }
  if (!isPlainObject(value) || typeof value.changed !== "boolean") {
    return mappingFailure("Invalid updated daily item response", [
      { path: `${path}.changed`, code: "invalid_boolean" },
    ]);
  }

  return {
    ok: true,
    data: {
      ...mappedItem.data,
      changed: value.changed,
    },
  };
}

export function mapDailyItemsPayload(
  value: unknown,
  path = "items",
): DailyDataMappingResult<DailyItem[]> {
  if (!Array.isArray(value)) {
    return mappingFailure("Invalid daily items response", [
      { path, code: "invalid_array" },
    ]);
  }

  const items: DailyItem[] = [];
  const issues: DailyDataValidationIssue[] = [];
  value.forEach((item, index) => {
    const mapped = mapDailyItemPayload(item, `${path}[${index}]`);
    if (mapped.ok === false) {
      issues.push(...mapped.error.issues);
    } else {
      items.push(mapped.data);
    }
  });

  return issues.length > 0
    ? mappingFailure("Invalid daily items response", issues)
    : { ok: true, data: items };
}

export function mapDailySessionMetadataPayload(
  value: unknown,
  path = "session",
): DailyDataMappingResult<DailySessionMetadata> {
  if (!isPlainObject(value)) {
    return mappingFailure("Invalid daily session response", [
      { path, code: "invalid_object" },
    ]);
  }

  const payload = value as DailySessionPayload;
  const reader = new DailyPayloadReader();
  const id = reader.uuid(payload.id, `${path}.id`);
  const dailySessionId = reader.uuid(payload.session_id, `${path}.session_id`);
  if (id && dailySessionId && id !== dailySessionId) {
    reader.add(`${path}.session_id`, "daily_session_id_mismatch");
  }

  const isChecked = reader.boolean(payload.is_checked, `${path}.is_checked`);
  const checkedAt = reader.nullableDateTime(
    payload.checked_at,
    `${path}.checked_at`,
  );
  const isCompleted = reader.boolean(
    payload.is_prepared,
    `${path}.is_prepared`,
  );
  const completedAt = reader.nullableDateTime(
    payload.prepared_at,
    `${path}.prepared_at`,
  );
  const thanksSentAt = reader.nullableDateTime(
    payload.thanks_sent_at,
    `${path}.thanks_sent_at`,
  );

  if (isChecked !== Boolean(checkedAt)) {
    reader.add(`${path}.is_checked`, "checked_state_mismatch");
  }
  if (isCompleted !== Boolean(completedAt)) {
    reader.add(`${path}.is_prepared`, "prepared_state_mismatch");
  }

  const session: DailySessionMetadata = {
    dailySessionId,
    familyId: reader.uuid(payload.family_id, `${path}.family_id`),
    childId: reader.uuid(payload.child_id, `${path}.child_id`),
    sessionDate: reader.date(payload.session_date, `${path}.session_date`),
    version: reader.positiveInteger(payload.version, `${path}.version`),
    isChecked,
    checkedAt,
    checkedByMemberId: reader.nullableUuid(
      payload.checked_by_member_id,
      `${path}.checked_by_member_id`,
    ),
    checkedByUserId: reader.nullableUuid(
      payload.checked_by_user_id,
      `${path}.checked_by_user_id`,
    ),
    checkedByDisplayName: reader.nullableString(
      payload.checked_by_display_name,
      `${path}.checked_by_display_name`,
    ),
    isCompleted,
    completedAt,
    completedByMemberId: reader.nullableUuid(
      payload.prepared_by_member_id,
      `${path}.prepared_by_member_id`,
    ),
    completedByUserId: reader.nullableUuid(
      payload.prepared_by_user_id,
      `${path}.prepared_by_user_id`,
    ),
    completedByDisplayName: reader.nullableString(
      payload.prepared_by_display_name,
      `${path}.prepared_by_display_name`,
    ),
    thanksSent: Boolean(thanksSentAt),
    thanksSentAt,
    thanksSentByMemberId: reader.nullableUuid(
      payload.thanks_sent_by_member_id,
      `${path}.thanks_sent_by_member_id`,
    ),
    thanksSentByUserId: reader.nullableUuid(
      payload.thanks_sent_by_user_id,
      `${path}.thanks_sent_by_user_id`,
    ),
    thanksSentByDisplayName: reader.nullableString(
      payload.thanks_sent_by_display_name,
      `${path}.thanks_sent_by_display_name`,
    ),
    thanksReceivedByMemberId: reader.nullableUuid(
      payload.thanks_received_by_member_id,
      `${path}.thanks_received_by_member_id`,
    ),
    thanksReceivedByUserId: reader.nullableUuid(
      payload.thanks_received_by_user_id,
      `${path}.thanks_received_by_user_id`,
    ),
    thanksReceivedByDisplayName: reader.nullableString(
      payload.thanks_received_by_display_name,
      `${path}.thanks_received_by_display_name`,
    ),
    createdAt: reader.dateTime(payload.created_at, `${path}.created_at`),
    updatedAt: reader.dateTime(payload.updated_at, `${path}.updated_at`),
  };

  if (reader.issues.length > 0) {
    return mappingFailure("Invalid daily session response", reader.issues);
  }

  return { ok: true, data: session };
}

export function mapDailySessionPayload(
  value: unknown,
  items: DailyItem[],
  path = "session",
): DailyDataMappingResult<DailySession> {
  const mapped = mapDailySessionMetadataPayload(value, path);
  return mapped.ok === false
    ? mapped
    : { ok: true, data: { ...mapped.data, items } };
}

export function validateDailyDataScopeInput(
  input: LoadDailyDataInput,
): DailyDataInvalidInputError | null {
  const issues: DailyDataValidationIssue[] = [];
  if (!isDailyDataUuid(input.familyId)) {
    issues.push({ path: "familyId", code: "invalid_uuid" });
  }
  if (!isDailyDataUuid(input.childId)) {
    issues.push({ path: "childId", code: "invalid_uuid" });
  }
  if (!isIsoDate(input.sessionDate)) {
    issues.push({ path: "sessionDate", code: "invalid_iso_date" });
  }

  return issues.length > 0
    ? {
        kind: "invalid_input",
        message: "Invalid daily data input",
        issues,
      }
    : null;
}

const safelyReadStringProperty = (
  value: unknown,
  property: string,
): string | null => {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return null;
  }

  try {
    const propertyValue = Reflect.get(value, property);
    return typeof propertyValue === "string" && propertyValue.length > 0
      ? propertyValue
      : null;
  } catch {
    return null;
  }
};

const safeErrorMessage = (error: unknown): string => {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  const message = safelyReadStringProperty(error, "message");
  if (message) {
    return message;
  }

  try {
    const stringified = String(error);
    if (stringified.length > 0) {
      return stringified;
    }
  } catch {
    // Use the fixed fallback below.
  }

  return "Unknown RPC error";
};

export function toDailyDataRpcError(error: unknown): DailyDataRpcError {
  const code = safelyReadStringProperty(error, "code");
  return {
    kind: "rpc_error",
    message: safeErrorMessage(error),
    ...(code ? { code } : {}),
  };
}

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

const validateLoadedDailyDataScope = (
  session: DailySession,
  input: LoadDailyDataInput,
): DailyDataValidationIssue[] => {
  const issues: DailyDataValidationIssue[] = [];
  if (!uuidEquals(session.familyId, input.familyId)) {
    issues.push({ path: "session.family_id", code: "family_id_mismatch" });
  }
  if (!uuidEquals(session.childId, input.childId)) {
    issues.push({ path: "session.child_id", code: "child_id_mismatch" });
  }
  if (session.sessionDate !== input.sessionDate) {
    issues.push({
      path: "session.session_date",
      code: "session_date_mismatch",
    });
  }
  session.items.forEach((item, index) => {
    if (!uuidEquals(item.familyId, session.familyId)) {
      issues.push({
        path: `items[${index}].family_id`,
        code: "family_id_mismatch",
      });
    }
    if (!uuidEquals(item.dailySessionId, session.dailySessionId)) {
      issues.push({
        path: `items[${index}].daily_session_id`,
        code: "daily_session_id_mismatch",
      });
    }
  });
  return issues;
};

export async function loadDailyData(
  client: DailyDataClient,
  input: LoadDailyDataInput,
): Promise<LoadDailyDataResult> {
  const inputError = validateDailyDataScopeInput(input);
  if (inputError) {
    return { status: "client_error", error: inputError };
  }

  let response: Awaited<ReturnType<DailyDataClient["rpc"]>>;
  try {
    response = await client.rpc("load_daily_data", {
      p_family_id: input.familyId,
      p_child_id: input.childId,
      p_session_date: input.sessionDate,
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
    const result = mapLoadDailyDataResponse(response.data);
    if (result.status !== "success") {
      return result;
    }
    const scopeIssues = validateLoadedDailyDataScope(result.session, input);
    return scopeIssues.length === 0
      ? result
      : {
          status: "transport_error",
          error: invalidResponse(
            "load_daily_data response is outside the requested scope",
            scopeIssues,
          ),
        };
  } catch {
    return {
      status: "transport_error",
      error: invalidResponse("Invalid load_daily_data response", [
        { path: "response", code: "response_mapping_failed" },
      ]),
    };
  }
}

export function mapLoadDailyDataResponse(
  value: unknown,
): LoadDailyDataResult {
  if (!isPlainObject(value) || typeof value.status !== "string") {
    return {
      status: "transport_error",
      error: invalidResponse("Invalid load_daily_data response", [
        { path: "response", code: "invalid_status_envelope" },
      ]),
    };
  }

  if (
    value.status === "forbidden" ||
    value.status === "not_found" ||
    value.status === "invalid_state"
  ) {
    if (
      value.session !== null ||
      !Array.isArray(value.items) ||
      value.items.length !== 0
    ) {
      return {
        status: "transport_error",
        error: invalidResponse("Invalid load_daily_data error response", [
          { path: "response", code: "invalid_business_error_payload" },
        ]),
      };
    }
    return { status: value.status };
  }

  if (value.status !== "success") {
    return {
      status: "transport_error",
      error: invalidResponse("Invalid load_daily_data response status", [
        { path: "status", code: "unexpected_status" },
      ]),
    };
  }

  const mappedItems = mapDailyItemsPayload(value.items);
  if (mappedItems.ok === false) {
    return { status: "transport_error", error: mappedItems.error };
  }
  const mappedSession = mapDailySessionPayload(
    value.session,
    mappedItems.data,
  );
  if (mappedSession.ok === false) {
    return { status: "transport_error", error: mappedSession.error };
  }

  return {
    status: "success",
    session: mappedSession.data,
  };
}
