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
  kind: "regular" | "rough";
  name: string;
  defaultQuantity: number;
  unit: string;
  currentRoughState: "enough" | null;
};

export type SaveSharedItemTemplateAddResult = {
  id: string;
  sortOrder: number;
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

  if (
    !data ||
    typeof data.id !== "string" ||
    !uuidPattern.test(data.id) ||
    typeof data.sort_order !== "number" ||
    !Number.isInteger(data.sort_order) ||
    data.sort_order < 0 ||
    data.sort_order > maxItemSortOrder
  ) {
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

function assertNonEmptyId(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`missing_${label}`);
  }
}
