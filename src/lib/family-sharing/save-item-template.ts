import type { RoughState } from "./shared-settings";

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

const dbRoughStateByAppValue = {
  十分: "enough",
  少ない: "low",
  補充: "refill",
} as const satisfies Record<RoughState, string>;

type DbRoughState =
  (typeof dbRoughStateByAppValue)[keyof typeof dbRoughStateByAppValue];

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

export async function saveSharedItemTemplateEdit(
  supabase: SharedItemTemplateClient,
  input: SaveSharedItemTemplateEditInput,
) {
  assertNonEmptyId(input.familyId, "familyId");
  assertNonEmptyId(input.childId, "childId");
  assertNonEmptyId(input.itemId, "itemId");
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

function assertNonEmptyId(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`missing_${label}`);
  }
}
