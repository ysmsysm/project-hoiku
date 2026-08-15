import {
  isDailyDataIsoDate,
  isDailyDataIsoDateTime,
  isDailyDataUuid,
  isPostgresInteger,
  toDailyDataRpcError,
  validateDailyDataScopeInput,
} from "./daily-data";
import type {
  DailyDataFailure,
  DailyDataInvalidInputError,
  DailyDataValidationIssue,
  LoadDailyDataInput,
} from "../../types/daily";

export type DailySpotMutationInput = LoadDailyDataInput &
  (
    | { action: "add_template"; itemTemplateId: string; dueDate: string | null }
    | {
        action: "add_temporary";
        dailyItemId: string;
        name: string;
        quantity: number;
        dueDate: string | null;
      }
    | {
        action: "delete";
        dailyItemId: string;
        expectedVersion: number;
      }
    | {
        action: "set_due_date";
        dailyItemId: string;
        expectedVersion: number;
        dueDate: string | null;
      }
  );

export type DailySpotMutationItem = {
  dailyItemId: string;
  version: number;
  deletedAt: string | null;
  dueDate: string | null;
  itemTemplateId: string | null;
  isAdHoc: boolean;
};

export type DailySpotMutationResult =
  | { status: "success"; changed: boolean; item: DailySpotMutationItem }
  | { status: "conflict"; changed: false; item: DailySpotMutationItem | null }
  | { status: "forbidden" | "not_found"; changed: false }
  | {
      status: "invalid_state";
      changed: false;
      reason:
        | "invalid_input"
        | "session_prepared"
        | "carryover_linked"
        | "idempotency_mismatch";
    }
  | DailyDataFailure;

type DailySpotMutationRpcArgs = {
  p_family_id: string;
  p_child_id: string;
  p_session_date: string;
  p_action: DailySpotMutationInput["action"];
  p_daily_item_id: string | null;
  p_expected_version: number | null;
  p_item_template_id: string | null;
  p_name: string | null;
  p_quantity: number | null;
  p_due_date: string | null;
};

export type DailySpotMutationClient = {
  rpc: (
    functionName: "mutate_daily_spot_item",
    args: DailySpotMutationRpcArgs,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const invalidInput = (
  issues: DailyDataValidationIssue[],
): DailyDataInvalidInputError => ({
  kind: "invalid_input",
  message: "Invalid daily spot mutation input",
  issues,
});

const invalidResponse = (issues: DailyDataValidationIssue[]): DailySpotMutationResult => ({
  status: "transport_error",
  error: {
    kind: "invalid_response",
    message: "Invalid daily spot mutation response",
    issues,
  },
});

export function validateDailySpotMutationInput(
  input: DailySpotMutationInput,
): DailyDataInvalidInputError | null {
  const scopeError = validateDailyDataScopeInput(input);
  const issues = scopeError ? [...scopeError.issues] : [];
  const validateDueDate = (dueDate: string | null) => {
    if (dueDate !== null && !isDailyDataIsoDate(dueDate)) {
      issues.push({ path: "dueDate", code: "invalid_nullable_date" });
    }
  };

  if (input.action === "add_template") {
    if (!isDailyDataUuid(input.itemTemplateId)) {
      issues.push({ path: "itemTemplateId", code: "invalid_uuid" });
    }
    validateDueDate(input.dueDate);
  } else if (input.action === "add_temporary") {
    if (!isDailyDataUuid(input.dailyItemId)) {
      issues.push({ path: "dailyItemId", code: "invalid_uuid" });
    }
    if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > 80) {
      issues.push({ path: "name", code: "invalid_name" });
    }
    if (!isPostgresInteger(input.quantity) || input.quantity < 0 || input.quantity > 5) {
      issues.push({ path: "quantity", code: "invalid_spot_quantity" });
    }
    validateDueDate(input.dueDate);
  } else {
    if (!isDailyDataUuid(input.dailyItemId)) {
      issues.push({ path: "dailyItemId", code: "invalid_uuid" });
    }
    if (!isPostgresInteger(input.expectedVersion) || input.expectedVersion < 1) {
      issues.push({ path: "expectedVersion", code: "invalid_positive_integer" });
    }
    if (input.action === "set_due_date") {
      validateDueDate(input.dueDate);
    }
  }
  return issues.length > 0 ? invalidInput(issues) : null;
}

export function buildDailySpotMutationRpcArgs(
  input: DailySpotMutationInput,
): DailySpotMutationRpcArgs {
  const args: DailySpotMutationRpcArgs = {
    p_family_id: input.familyId,
    p_child_id: input.childId,
    p_session_date: input.sessionDate,
    p_action: input.action,
    p_daily_item_id: null,
    p_expected_version: null,
    p_item_template_id: null,
    p_name: null,
    p_quantity: null,
    p_due_date: null,
  };
  if (input.action === "add_template") {
    args.p_item_template_id = input.itemTemplateId;
    args.p_due_date = input.dueDate;
  } else if (input.action === "add_temporary") {
    args.p_daily_item_id = input.dailyItemId;
    args.p_name = input.name.trim();
    args.p_quantity = input.quantity;
    args.p_due_date = input.dueDate;
  } else {
    args.p_daily_item_id = input.dailyItemId;
    args.p_expected_version = input.expectedVersion;
    if (input.action === "set_due_date") {
      args.p_due_date = input.dueDate;
    }
  }
  return args;
}

export async function mutateDailySpotItem(
  client: DailySpotMutationClient,
  input: DailySpotMutationInput,
): Promise<DailySpotMutationResult> {
  const inputError = validateDailySpotMutationInput(input);
  if (inputError) return { status: "client_error", error: inputError };
  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc(
      "mutate_daily_spot_item",
      buildDailySpotMutationRpcArgs(input),
    );
  } catch (error) {
    return { status: "transport_error", error: toDailyDataRpcError(error) };
  }
  if (response.error) {
    return { status: "transport_error", error: toDailyDataRpcError(response.error) };
  }
  return mapDailySpotMutationResponse(response.data);
}

export function mapDailySpotMutationResponse(value: unknown): DailySpotMutationResult {
  if (!isPlainObject(value) || typeof value.status !== "string" || typeof value.changed !== "boolean") {
    return invalidResponse([{ path: "response", code: "invalid_status_envelope" }]);
  }
  if (value.status === "forbidden" || value.status === "not_found") {
    return value.changed === false
      ? { status: value.status, changed: false }
      : invalidResponse([{ path: "changed", code: "unexpected_value" }]);
  }
  if (value.status === "invalid_state") {
    const reasons = new Set(["invalid_input", "session_prepared", "carryover_linked", "idempotency_mismatch"]);
    return value.changed === false && typeof value.reason === "string" && reasons.has(value.reason)
      ? { status: "invalid_state", changed: false, reason: value.reason as "invalid_input" | "session_prepared" | "carryover_linked" | "idempotency_mismatch" }
      : invalidResponse([{ path: "reason", code: "unexpected_value" }]);
  }
  if (value.status !== "success" && value.status !== "conflict") {
    return invalidResponse([{ path: "status", code: "unexpected_status" }]);
  }
  const item = value.item === null && value.status === "conflict" ? null : mapItem(value.item);
  if (item === undefined || (value.status === "conflict" && value.changed !== false)) {
    return invalidResponse([{ path: "item", code: "invalid_item" }]);
  }
  return value.status === "success"
    ? { status: "success", changed: value.changed, item: item as DailySpotMutationItem }
    : { status: "conflict", changed: false, item };
}

function mapItem(value: unknown): DailySpotMutationItem | undefined {
  if (!isPlainObject(value) || !isDailyDataUuid(value.daily_item_id)
    || !isPostgresInteger(value.version) || value.version < 1
    || (value.deleted_at !== null && !isDailyDataIsoDateTime(value.deleted_at))
    || (value.due_date !== null && !isDailyDataIsoDate(value.due_date))
    || (value.item_template_id !== null && !isDailyDataUuid(value.item_template_id))
    || typeof value.is_ad_hoc !== "boolean") return undefined;
  return {
    dailyItemId: value.daily_item_id,
    version: value.version,
    deletedAt: value.deleted_at,
    dueDate: value.due_date,
    itemTemplateId: value.item_template_id,
    isAdHoc: value.is_ad_hoc,
  } as DailySpotMutationItem;
}
