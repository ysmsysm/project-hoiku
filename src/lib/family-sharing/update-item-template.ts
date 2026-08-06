import { isDailyDataIsoDateTime, isDailyDataUuid } from "./daily-data";

export type SharedTemplateKind = "regular" | "rough" | "spot";
export type SharedTemplateRoughState = "enough" | "low" | "refill";
export type SharedTemplateMutationReason =
  | "invalid_input"
  | "stale_template"
  | "inactive_template"
  | "wrong_kind"
  | null;

export type SharedTemplateMetadata = {
  familyId: string;
  childId: string;
  itemTemplateId: string;
  kind: SharedTemplateKind;
  name: string;
  defaultQuantity: number;
  unit: string;
  currentRoughState: SharedTemplateRoughState | null;
  weekdays: number[];
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
};

export type SharedTemplateMutationResult =
  | ({ status: "success"; changed: boolean; reason: null } & SharedTemplateMetadata)
  | { status: "conflict"; changed: false; reason: "stale_template" }
  | { status: "forbidden" | "not_found"; changed: false; reason: null }
  | {
      status: "invalid_state";
      changed: false;
      reason: "invalid_input" | "inactive_template" | "wrong_kind";
    }
  | {
      status: "client_error" | "transport_error" | "invalid_response";
      changed: false;
      reason: null;
    };

export type UpdateSharedItemTemplateInput = {
  familyId: string;
  childId: string;
  itemTemplateId: string;
  expectedUpdatedAt: string;
  kind: "regular" | "rough";
  name: string;
  defaultQuantity: number;
  unit: string | null;
};

export type UpdateSharedRoughItemStateInput = {
  familyId: string;
  childId: string;
  itemTemplateId: string;
  expectedUpdatedAt: string;
  currentRoughState: SharedTemplateRoughState;
};

export type UpdateSharedSpotItemTemplateInput = {
  familyId: string;
  childId: string;
  itemTemplateId: string;
  expectedUpdatedAt: string;
  name: string;
  defaultQuantity: number;
  weekdays: number[];
};

export type SharedTemplateUpdateClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

const validKinds = new Set<SharedTemplateKind>(["regular", "rough", "spot"]);
const validRoughStates = new Set<SharedTemplateRoughState>([
  "enough",
  "low",
  "refill",
]);

const failed = (
  status: "client_error" | "transport_error" | "invalid_response",
): SharedTemplateMutationResult => ({ status, changed: false, reason: null });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return isDailyDataUuid(value);
}

function isName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    Array.from(value).length >= 1 &&
    Array.from(value).length <= 80
  );
}

function isQuantity(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5;
}

function snapshotBase(input: unknown) {
  if (!isRecord(input)) return null;
  try {
    const familyId = input.familyId;
    const childId = input.childId;
    const itemTemplateId = input.itemTemplateId;
    const expectedUpdatedAt = input.expectedUpdatedAt;
    if (
      !isUuid(familyId) ||
      !isUuid(childId) ||
      !isUuid(itemTemplateId) ||
      !isDailyDataIsoDateTime(expectedUpdatedAt)
    ) {
      return null;
    }
    return { familyId, childId, itemTemplateId, expectedUpdatedAt };
  } catch {
    return null;
  }
}

function snapshotWeekdays(value: unknown): number[] | null {
  try {
    if (!Array.isArray(value) || value.length > 7) return null;
    const weekdays = [...value];
    if (
      weekdays.some(
        (weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6,
      ) ||
      new Set(weekdays).size !== weekdays.length
    ) {
      return null;
    }
    return weekdays.sort((left, right) => left - right);
  } catch {
    return null;
  }
}

function mapResponse(
  value: unknown,
  expected: {
    familyId: string;
    childId: string;
    itemTemplateId: string;
    kind: SharedTemplateKind;
    expectedUpdatedAt: string;
    name?: string;
    defaultQuantity?: number;
    unit?: string;
    currentRoughState?: SharedTemplateRoughState;
    weekdays?: number[];
  },
): SharedTemplateMutationResult {
  if (!isRecord(value)) return failed("invalid_response");
  try {
    const status = value.status;
    const changed = value.changed;
    const reason = value.reason;
    if (changed !== false && changed !== true) return failed("invalid_response");
    if (status === "conflict") {
      return changed === false && reason === "stale_template"
        ? { status, changed, reason: "stale_template" }
        : failed("invalid_response");
    }
    if (status === "forbidden" || status === "not_found") {
      return changed === false && reason === null
        ? { status, changed, reason: null }
        : failed("invalid_response");
    }
    if (status === "invalid_state") {
      return changed === false &&
        (reason === "invalid_input" ||
          reason === "inactive_template" ||
          reason === "wrong_kind")
        ? { status, changed, reason }
        : failed("invalid_response");
    }
    if (status !== "success" || reason !== null) {
      return failed("invalid_response");
    }

    const familyId = value.family_id;
    const childId = value.child_id;
    const itemTemplateId = value.item_template_id;
    const kind = value.kind;
    const name = value.name;
    const defaultQuantity = value.default_quantity;
    const unit = value.unit;
    const currentRoughState = value.current_rough_state;
    const weekdays = snapshotWeekdays(value.weekdays);
    const sortOrder = value.sort_order;
    const isActive = value.is_active;
    const updatedAt = value.updated_at;
    if (
      !isUuid(familyId) ||
      !isUuid(childId) ||
      !isUuid(itemTemplateId) ||
      familyId.toLowerCase() !== expected.familyId.toLowerCase() ||
      childId.toLowerCase() !== expected.childId.toLowerCase() ||
      itemTemplateId.toLowerCase() !== expected.itemTemplateId.toLowerCase() ||
      typeof kind !== "string" ||
      !validKinds.has(kind as SharedTemplateKind) ||
      kind !== expected.kind ||
      !isName(name) ||
      !isQuantity(defaultQuantity) ||
      typeof unit !== "string" ||
      Array.from(unit).length > 10 ||
      !(
        currentRoughState === null ||
        (typeof currentRoughState === "string" &&
          validRoughStates.has(currentRoughState as SharedTemplateRoughState))
      ) ||
      (kind === "rough") !== (currentRoughState !== null) ||
      weekdays === null ||
      (kind !== "spot" && weekdays.length !== 0) ||
      !Number.isInteger(sortOrder) ||
      Number(sortOrder) < 0 ||
      Number(sortOrder) > 100000 ||
      isActive !== true ||
      !isDailyDataIsoDateTime(updatedAt) ||
      (changed === false && updatedAt !== expected.expectedUpdatedAt) ||
      (changed === true && updatedAt === expected.expectedUpdatedAt) ||
      (expected.name !== undefined && name !== expected.name) ||
      (expected.defaultQuantity !== undefined &&
        defaultQuantity !== expected.defaultQuantity) ||
      (expected.unit !== undefined && unit !== expected.unit) ||
      (expected.currentRoughState !== undefined &&
        currentRoughState !== expected.currentRoughState) ||
      (expected.weekdays !== undefined &&
        (weekdays.length !== expected.weekdays.length ||
          weekdays.some((weekday, index) => weekday !== expected.weekdays?.[index])))
    ) {
      return failed("invalid_response");
    }

    return {
      status,
      changed,
      reason: null,
      familyId,
      childId,
      itemTemplateId,
      kind: kind as SharedTemplateKind,
      name,
      defaultQuantity,
      unit,
      currentRoughState: currentRoughState as SharedTemplateRoughState | null,
      weekdays,
      sortOrder: sortOrder as number,
      isActive,
      updatedAt,
    };
  } catch {
    return failed("invalid_response");
  }
}

async function callRpc(
  client: SharedTemplateUpdateClient,
  functionName: string,
  args: Record<string, unknown>,
  expected: Parameters<typeof mapResponse>[1],
) {
  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc(functionName, args);
  } catch {
    return failed("transport_error");
  }
  try {
    if (!response || response.error) return failed("transport_error");
    return mapResponse(response.data, expected);
  } catch {
    return failed("invalid_response");
  }
}

export async function updateSharedItemTemplate(
  client: SharedTemplateUpdateClient,
  input: UpdateSharedItemTemplateInput,
): Promise<SharedTemplateMutationResult> {
  const base = snapshotBase(input);
  let kind: unknown;
  let name: unknown;
  let defaultQuantity: unknown;
  let unit: unknown;
  try {
    kind = input.kind;
    name = input.name;
    defaultQuantity = input.defaultQuantity;
    unit = input.unit;
  } catch {
    return failed("client_error");
  }
  if (
    !base ||
    (kind !== "regular" && kind !== "rough") ||
    !isName(name) ||
    !isQuantity(defaultQuantity) ||
    (kind === "regular" ? unit !== null : typeof unit !== "string" || Array.from(unit).length > 10)
  ) {
    return failed("client_error");
  }
  return callRpc(
    client,
    "update_family_item_template",
    {
      p_family_id: base.familyId,
      p_child_id: base.childId,
      p_item_template_id: base.itemTemplateId,
      p_expected_updated_at: base.expectedUpdatedAt,
      p_name: name,
      p_default_quantity: defaultQuantity,
      p_unit: unit,
    },
    {
      ...base,
      kind,
      name,
      defaultQuantity,
      ...(kind === "rough" ? { unit: unit as string } : {}),
    },
  );
}

export async function updateSharedRoughItemState(
  client: SharedTemplateUpdateClient,
  input: UpdateSharedRoughItemStateInput,
): Promise<SharedTemplateMutationResult> {
  const base = snapshotBase(input);
  let currentRoughState: unknown;
  try {
    currentRoughState = input.currentRoughState;
  } catch {
    return failed("client_error");
  }
  if (
    !base ||
    typeof currentRoughState !== "string" ||
    !validRoughStates.has(currentRoughState as SharedTemplateRoughState)
  ) {
    return failed("client_error");
  }
  return callRpc(
    client,
    "update_family_rough_item_state",
    {
      p_family_id: base.familyId,
      p_child_id: base.childId,
      p_item_template_id: base.itemTemplateId,
      p_expected_updated_at: base.expectedUpdatedAt,
      p_current_rough_state: currentRoughState,
    },
    {
      ...base,
      kind: "rough",
      currentRoughState: currentRoughState as SharedTemplateRoughState,
    },
  );
}

export async function updateSharedSpotItemTemplate(
  client: SharedTemplateUpdateClient,
  input: UpdateSharedSpotItemTemplateInput,
): Promise<SharedTemplateMutationResult> {
  const base = snapshotBase(input);
  let name: unknown;
  let defaultQuantity: unknown;
  let weekdaysValue: unknown;
  try {
    name = input.name;
    defaultQuantity = input.defaultQuantity;
    weekdaysValue = input.weekdays;
  } catch {
    return failed("client_error");
  }
  const weekdays = snapshotWeekdays(weekdaysValue);
  if (!base || !isName(name) || !isQuantity(defaultQuantity) || weekdays === null) {
    return failed("client_error");
  }
  return callRpc(
    client,
    "update_family_spot_item_template",
    {
      p_family_id: base.familyId,
      p_child_id: base.childId,
      p_item_template_id: base.itemTemplateId,
      p_expected_updated_at: base.expectedUpdatedAt,
      p_name: name,
      p_default_quantity: defaultQuantity,
      p_weekdays: weekdays,
    },
    { ...base, kind: "spot", name, defaultQuantity, weekdays },
  );
}

export function getSharedTemplateMutationErrorMessage(
  result: Exclude<SharedTemplateMutationResult, { status: "success" }>,
) {
  if (result.status === "conflict") {
    return "ほかの端末で変更されています。最新の状態を確認してください。";
  }
  if (
    result.status === "not_found" ||
    (result.status === "invalid_state" && result.reason === "inactive_template")
  ) {
    return "この項目は削除または変更されています。最新の状態を確認してください。";
  }
  if (result.status === "transport_error") {
    return "保存結果を確認できませんでした。再読み込みしてください。";
  }
  return "保存できませんでした。最新の状態を確認してもう一度お試しください。";
}
