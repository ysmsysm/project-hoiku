import type { RoughState } from "./shared-settings";
import {
  assertValidHomeItemQuantity,
  assertValidHomeRoughUnit,
} from "../home-item-template-constraints";

export type SaveSharedItemTemplateEditInput = {
  familyId: string;
  childId: string;
  itemId: string;
  changes: {
    name?: string;
    count?: number;
    unit?: string;
    weekdays?: number[];
  };
};

export type SaveSharedRoughStateInput = {
  familyId: string;
  childId: string;
  itemId: string;
  roughState: string;
};

export type SaveSharedItemTemplateAddInput = {
  familyId: string;
  childId: string;
  kind: "regular" | "spot" | "rough";
  name: string;
  defaultQuantity: number;
  unit: string;
  currentRoughState: "enough" | null;
  weekdays?: number[];
};

export type SaveSharedItemTemplateAddResult = {
  id: string;
  sortOrder: number;
};

export type SaveSharedItemTemplateDeleteInput = {
  familyId: string;
  childId: string;
  itemId: string;
};

type ItemTemplateInsert = {
  family_id: string;
  child_id: string;
  kind: "regular" | "rough";
  name: string;
  default_quantity: number;
  unit: string;
  weekday: null;
  sort_order: number;
  current_rough_state: "enough" | null;
  is_active: true;
};

type ItemTemplatesUpdate = {
  name?: string;
  default_quantity?: number;
  unit?: string;
  current_rough_state?: DbRoughState;
  is_active?: false;
};

type ItemTemplatesUpdateQuery = {
  eq: (column: string, value: string) => ItemTemplatesUpdateQuery;
  select: (columns: "id") => {
    maybeSingle: () => PromiseLike<{
      data: { id: string } | null;
      error: unknown;
    }>;
  };
};

export type SharedItemTemplateClient = {
  from: (table: "item_templates") => {
    update: (value: ItemTemplatesUpdate) => ItemTemplatesUpdateQuery;
  };
  rpc?: (
    functionName: "update_family_spot_item_template_weekdays",
    args: {
      p_family_id: string;
      p_child_id: string;
      p_item_template_id: string;
      p_weekdays: number[];
      p_name?: string | null;
      p_default_quantity?: number | null;
    },
  ) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

type ItemTemplateMaxSortOrderQuery = {
  eq: (column: string, value: string) => ItemTemplateMaxSortOrderQuery;
  order: (
    column: "sort_order",
    options: { ascending: false },
  ) => ItemTemplateMaxSortOrderQuery;
  limit: (count: 1) => {
    maybeSingle: () => PromiseLike<{
      data: { sort_order: number } | null;
      error: unknown;
    }>;
  };
};

export type SharedItemTemplateAddClient = {
  from: (table: "item_templates") => {
    select: (columns: "sort_order") => ItemTemplateMaxSortOrderQuery;
    insert: (value: ItemTemplateInsert) => {
      select: (columns: "id, sort_order") => {
        single: () => PromiseLike<{
          data: { id: string; sort_order: number } | null;
          error: unknown;
        }>;
      };
    };
  };
  rpc?: (
    functionName: "add_family_spot_item_template",
    args: {
      p_family_id: string;
      p_child_id: string;
      p_name: string;
      p_default_quantity: number;
      p_weekdays: number[];
    },
  ) => PromiseLike<{
    data: { id: string; sort_order: number }[] | null;
    error: unknown;
  }>;
};

const dbRoughStateByAppValue = {
  十分: "enough",
  少ない: "low",
  補充: "refill",
} as const satisfies Record<RoughState, string>;

type DbRoughState =
  (typeof dbRoughStateByAppValue)[keyof typeof dbRoughStateByAppValue];

const maxItemNameLength = 80;
const maxItemSortOrder = 100000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toItemTemplateEditUpdate(
  changes: SaveSharedItemTemplateEditInput["changes"],
): ItemTemplatesUpdate {
  return {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.count !== undefined
      ? { default_quantity: changes.count }
      : {}),
    ...(changes.unit !== undefined ? { unit: changes.unit } : {}),
  };
}

export function toDbRoughState(roughState: string): DbRoughState {
  if (!isAllowedRoughState(roughState)) {
    throw new Error("invalid_roughState");
  }

  return dbRoughStateByAppValue[roughState];
}

export async function saveSharedItemTemplateAdd(
  supabase: SharedItemTemplateAddClient,
  input: SaveSharedItemTemplateAddInput,
): Promise<SaveSharedItemTemplateAddResult> {
  assertNonEmptyId(input.familyId, "familyId");
  assertNonEmptyId(input.childId, "childId");
  const name = input.name.trim();

  if (!name || charLength(name) > maxItemNameLength) {
    throw new Error("invalid_item_template_name");
  }

  assertValidHomeItemQuantity(input.defaultQuantity);
  assertValidHomeRoughUnit(input.unit);

  if (input.kind === "spot") {
    if (input.unit !== "個" || input.currentRoughState !== null) {
      throw new Error("invalid_spot_item_template");
    }

    const weekdays = validateSpotWeekdays(input.weekdays);
    if (!supabase.rpc) {
      throw new Error("missing_spot_item_template_rpc");
    }

    const { data, error } = await supabase.rpc(
      "add_family_spot_item_template",
      {
        p_family_id: input.familyId,
        p_child_id: input.childId,
        p_name: name,
        p_default_quantity: input.defaultQuantity,
        p_weekdays: weekdays,
      },
    );

    if (error) {
      throw toSharedItemTemplateSaveError(error);
    }

    const saved = data?.[0];
    if (data?.length !== 1 || !isValidItemTemplateAddResult(saved)) {
      throw new Error("shared_item_template_add_result_invalid");
    }

    return { id: saved.id, sortOrder: saved.sort_order };
  }

  if (
    (input.kind === "rough" && input.currentRoughState !== "enough") ||
    (input.kind === "regular" && input.currentRoughState !== null)
  ) {
    throw new Error("invalid_item_template_rough_state");
  }

  const { data: maxSortOrderRow, error: maxSortOrderError } = await supabase
    .from("item_templates")
    .select("sort_order")
    .eq("family_id", input.familyId)
    .eq("child_id", input.childId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxSortOrderError) {
    throw maxSortOrderError;
  }

  let sortOrder = 0;
  if (maxSortOrderRow !== null) {
    const maxSortOrder = maxSortOrderRow.sort_order;
    if (
      typeof maxSortOrder !== "number" ||
      !Number.isInteger(maxSortOrder) ||
      maxSortOrder < 0 ||
      maxSortOrder >= maxItemSortOrder
    ) {
      throw new Error("invalid_item_template_sort_order");
    }
    sortOrder = maxSortOrder + 1;
  }

  const { data, error } = await supabase
    .from("item_templates")
    .insert({
      family_id: input.familyId,
      child_id: input.childId,
      kind: input.kind,
      name,
      default_quantity: input.defaultQuantity,
      unit: input.unit,
      weekday: null,
      sort_order: sortOrder,
      current_rough_state: input.currentRoughState,
      is_active: true,
    })
    .select("id, sort_order")
    .single();

  if (error) {
    throw error;
  }

  if (!isValidItemTemplateAddResult(data)) {
    throw new Error("shared_item_template_add_result_invalid");
  }

  return { id: data.id, sortOrder: data.sort_order };
}

export async function saveSharedItemTemplateEdit(
  supabase: SharedItemTemplateClient,
  input: SaveSharedItemTemplateEditInput,
) {
  assertNonEmptyId(input.familyId, "familyId");
  assertNonEmptyId(input.childId, "childId");
  assertNonEmptyId(input.itemId, "itemId");
  if (input.changes.count !== undefined) {
    assertValidHomeItemQuantity(input.changes.count);
  }
  if (input.changes.unit !== undefined) {
    assertValidHomeRoughUnit(input.changes.unit);
  }
  if (input.changes.weekdays !== undefined) {
    const weekdays = validateSpotWeekdays(input.changes.weekdays);
    if (!supabase.rpc) {
      throw new Error("missing_spot_item_template_weekdays_rpc");
    }

    const { error } = await supabase.rpc(
      "update_family_spot_item_template_weekdays",
      {
        p_family_id: input.familyId,
        p_child_id: input.childId,
        p_item_template_id: input.itemId,
        p_weekdays: weekdays,
        p_name: input.changes.name ?? null,
        p_default_quantity: input.changes.count ?? null,
      },
    );

    if (error) {
      throw toSharedItemTemplateSaveError(error);
    }

    return;
  }

  const update = toItemTemplateEditUpdate(input.changes);

  if (Object.keys(update).length === 0) {
    throw new Error("missing_item_template_update");
  }

  const { data, error } = await supabase
    .from("item_templates")
    .update(update)
    .eq("id", input.itemId)
    .eq("family_id", input.familyId)
    .eq("child_id", input.childId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("shared_item_template_not_found");
  }
}

export async function saveSharedItemTemplateDelete(
  supabase: SharedItemTemplateClient,
  input: SaveSharedItemTemplateDeleteInput,
) {
  assertNonEmptyId(input.familyId, "familyId");
  assertNonEmptyId(input.childId, "childId");
  assertNonEmptyId(input.itemId, "itemId");

  const { data, error } = await supabase
    .from("item_templates")
    .update({ is_active: false })
    .eq("id", input.itemId)
    .eq("family_id", input.familyId)
    .eq("child_id", input.childId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("shared_item_template_not_found");
  }
}

export async function saveSharedRoughState(
  supabase: SharedItemTemplateClient,
  input: SaveSharedRoughStateInput,
) {
  assertNonEmptyId(input.familyId, "familyId");
  assertNonEmptyId(input.childId, "childId");
  assertNonEmptyId(input.itemId, "itemId");
  const dbRoughState = toDbRoughState(input.roughState);

  const { data, error } = await supabase
    .from("item_templates")
    .update({ current_rough_state: dbRoughState })
    .eq("id", input.itemId)
    .eq("family_id", input.familyId)
    .eq("child_id", input.childId)
    .eq("kind", "rough")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("shared_rough_state_not_found");
  }
}

function isAllowedRoughState(value: string): value is RoughState {
  return value === "十分" || value === "少ない" || value === "補充";
}

function charLength(value: string) {
  return Array.from(value).length;
}

function validateSpotWeekdays(weekdays: number[] | undefined) {
  if (!Array.isArray(weekdays) || weekdays.length > 7) {
    throw new Error("invalid_spot_item_weekdays");
  }

  const uniqueWeekdays = new Set<number>();
  for (const weekday of weekdays) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error("invalid_spot_item_weekday");
    }
    if (uniqueWeekdays.has(weekday)) {
      throw new Error("duplicate_spot_item_weekday");
    }
    uniqueWeekdays.add(weekday);
  }

  return [...weekdays];
}

function isValidItemTemplateAddResult(
  value: { id: string; sort_order: number } | null | undefined,
): value is { id: string; sort_order: number } {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      uuidPattern.test(value.id) &&
      typeof value.sort_order === "number" &&
      Number.isInteger(value.sort_order) &&
      value.sort_order >= 0 &&
      value.sort_order <= maxItemSortOrder,
  );
}

function toSharedItemTemplateSaveError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === "object") {
    const postgrestError = error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const fields = [
      ["code", postgrestError.code],
      ["message", postgrestError.message],
      ["details", postgrestError.details],
      ["hint", postgrestError.hint],
    ]
      .filter((field): field is [string, string] => typeof field[1] === "string")
      .map(([label, value]) => `${label}=${value}`);

    if (fields.length > 0) {
      return new Error(`shared_item_template_save_failed: ${fields.join("; ")}`);
    }
  }

  return new Error(`shared_item_template_save_failed: ${String(error)}`);
}

function assertNonEmptyId(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`missing_${label}`);
  }
}
