import assert from "node:assert/strict";
import test from "node:test";
import {
  saveSharedItemTemplateAdd,
  saveSharedItemTemplateDelete,
  saveSharedItemTemplateEdit,
  saveSharedRoughState,
  toDbRoughState,
  toItemTemplateEditUpdate,
  type SaveSharedItemTemplateAddInput,
  type SharedItemTemplateAddClient,
  type SharedItemTemplateClient,
} from "../src/lib/family-sharing/save-item-template";

const regularUuid = "11111111-1111-4111-8111-111111111111";
const roughUuid = "22222222-2222-4222-8222-222222222222";
const anotherUuid = "33333333-3333-4333-8333-333333333333";

test("adds a regular item template after the current maximum sort order", async () => {
  const calls: unknown[] = [];
  const client = createAddMockClient(calls, {
    maxResult: { data: { sort_order: 7 }, error: null },
    insertResult: {
      data: { id: regularUuid, sort_order: 8 },
      error: null,
    },
  });

  const result = await saveSharedItemTemplateAdd(client, {
    familyId: "family-1",
    childId: "child-1",
    kind: "regular",
    name: "Towel",
    defaultQuantity: 2,
    unit: "枚",
    currentRoughState: null,
  });

  assert.deepEqual(result, { id: regularUuid, sortOrder: 8 });
  assert.deepEqual(calls, [
    ["from", "item_templates"],
    ["select-max", "sort_order"],
    ["eq-max", "family_id", "family-1"],
    ["eq-max", "child_id", "child-1"],
    ["order", "sort_order", { ascending: false }],
    ["limit", 1],
    ["maybeSingle"],
    ["from", "item_templates"],
    [
      "insert",
      {
        family_id: "family-1",
        child_id: "child-1",
        kind: "regular",
        name: "Towel",
        default_quantity: 2,
        unit: "枚",
        weekday: null,
        sort_order: 8,
        current_rough_state: null,
        is_active: true,
      },
    ],
    ["select-insert", "id, sort_order"],
    ["single"],
  ]);
  const insert = calls.find((call) => Array.isArray(call) && call[0] === "insert");
  assert.equal(Object.hasOwn((insert as [string, Record<string, unknown>])[1], "id"), false);
});

test("adds a rough item with enough state and starts sort order at zero", async () => {
  const calls: unknown[] = [];
  const client = createAddMockClient(calls, {
    maxResult: { data: null, error: null },
    insertResult: {
      data: { id: roughUuid, sort_order: 0 },
      error: null,
    },
  });

  const result = await saveSharedItemTemplateAdd(client, {
    familyId: "family-1",
    childId: "child-1",
    kind: "rough",
    name: "Diapers",
    defaultQuantity: 1,
    unit: "pack",
    currentRoughState: "enough",
  });

  assert.deepEqual(result, { id: roughUuid, sortOrder: 0 });
  assert.ok(
    calls.some(
      (call) =>
        Array.isArray(call) &&
        call[0] === "insert" &&
        call[1].current_rough_state === "enough" &&
        call[1].sort_order === 0,
    ),
  );
});

test("accepts shared item input values at the durable write limits", async () => {
  const regular = await saveSharedItemTemplateAdd(
    createAddMockClient([], {
      maxResult: { data: null, error: null },
      insertResult: { data: { id: regularUuid, sort_order: 0 }, error: null },
    }),
    {
      ...regularAddInput(),
      name: "a".repeat(80),
      defaultQuantity: 5,
    },
  );
  assert.equal(regular.id, regularUuid);

  const rough = await saveSharedItemTemplateAdd(
    createAddMockClient([], {
      maxResult: { data: null, error: null },
      insertResult: { data: { id: roughUuid, sort_order: 0 }, error: null },
    }),
    {
      ...regularAddInput(),
      kind: "rough",
      defaultQuantity: 0,
      unit: "u".repeat(10),
      currentRoughState: "enough",
    },
  );
  assert.equal(rough.id, roughUuid);
});

test("rejects invalid shared item input before any Supabase query", async () => {
  await assertAddRejectedBeforeQuery(
    { name: "a".repeat(81) },
    /invalid_item_template_name/,
  );
  await assertAddRejectedBeforeQuery(
    { name: "   " },
    /invalid_item_template_name/,
  );
  await assertAddRejectedBeforeQuery(
    { defaultQuantity: 6 },
    /invalid_home_item_quantity/,
  );
  await assertAddRejectedBeforeQuery(
    { defaultQuantity: 10 },
    /invalid_home_item_quantity/,
  );
  await assertAddRejectedBeforeQuery(
    { defaultQuantity: 11 },
    /invalid_home_item_quantity/,
  );
  await assertAddRejectedBeforeQuery(
    { defaultQuantity: 999 },
    /invalid_home_item_quantity/,
  );
  await assertAddRejectedBeforeQuery(
    { defaultQuantity: 1000 },
    /invalid_home_item_quantity/,
  );
  await assertAddRejectedBeforeQuery(
    { defaultQuantity: -1 },
    /invalid_home_item_quantity/,
  );
  await assertAddRejectedBeforeQuery(
    { defaultQuantity: 1.5 },
    /invalid_home_item_quantity/,
  );
  await assertAddRejectedBeforeQuery(
    {
      kind: "rough",
      unit: "u".repeat(11),
      currentRoughState: "enough",
    },
    /invalid_home_rough_unit/,
  );
});

test("rejects invalid maximum sort orders without inserting", async () => {
  for (const invalidSortOrder of [null, "4", Number.NaN, -1, 1.5, 100001]) {
    const calls: unknown[] = [];
    await assert.rejects(
      saveSharedItemTemplateAdd(
        createAddMockClient(calls, {
          maxResult: {
            data: { sort_order: invalidSortOrder },
            error: null,
          },
          insertResult: {
            data: { id: regularUuid, sort_order: 0 },
            error: null,
          },
        }),
        regularAddInput(),
      ),
      /invalid_item_template_sort_order/,
    );
    assert.equal(hasInsertCall(calls), false);
  }
});

test("rejects a maximum sort order whose successor exceeds the allowed range", async () => {
  const calls: unknown[] = [];
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createAddMockClient(calls, {
        maxResult: { data: { sort_order: 100000 }, error: null },
        insertResult: {
          data: { id: regularUuid, sort_order: 100001 },
          error: null,
        },
      }),
      regularAddInput(),
    ),
    /invalid_item_template_sort_order/,
  );
  assert.equal(hasInsertCall(calls), false);
});

test("includes inactive rows when finding the maximum sort order", async () => {
  const calls: unknown[] = [];
  const client = createAddMockClient(calls, {
    maxResult: { data: { sort_order: 4 }, error: null },
    insertResult: { data: { id: anotherUuid, sort_order: 5 }, error: null },
  });

  await saveSharedItemTemplateAdd(client, {
    familyId: "family-1",
    childId: "child-1",
    kind: "regular",
    name: "Cup",
    defaultQuantity: 1,
    unit: "個",
    currentRoughState: null,
  });

  assert.equal(
    calls.some(
      (call) => Array.isArray(call) && call[1] === "is_active",
    ),
    false,
  );
});

test("propagates item template max query and insert failures", async () => {
  const queryError = new Error("max query failed");
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createAddMockClient([], {
        maxResult: { data: null, error: queryError },
        insertResult: { data: null, error: null },
      }),
      regularAddInput(),
    ),
    queryError,
  );

  const insertError = new Error("insert failed");
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createAddMockClient([], {
        maxResult: { data: null, error: null },
        insertResult: { data: null, error: insertError },
      }),
      regularAddInput(),
    ),
    insertError,
  );
});

test("rejects missing or invalid item template insert results", async () => {
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createAddMockClient([], {
        maxResult: { data: null, error: null },
        insertResult: { data: null, error: null },
      }),
      regularAddInput(),
    ),
    /shared_item_template_add_result_invalid/,
  );

  await assert.rejects(
    saveSharedItemTemplateAdd(
      createAddMockClient([], {
        maxResult: { data: null, error: null },
        insertResult: {
          data: { id: anotherUuid, sort_order: Number.NaN },
          error: null,
        },
      }),
      regularAddInput(),
    ),
    /shared_item_template_add_result_invalid/,
  );

  for (const invalidId of ["", "not-a-uuid"]) {
    await assert.rejects(
      saveSharedItemTemplateAdd(
        createAddMockClient([], {
          maxResult: { data: null, error: null },
          insertResult: { data: { id: invalidId, sort_order: 0 }, error: null },
        }),
        regularAddInput(),
      ),
      /shared_item_template_add_result_invalid/,
    );
  }
});

test("maps item edit changes to item_templates update columns only", () => {
  assert.deepEqual(
    toItemTemplateEditUpdate({
      name: "Diaper",
      count: 3,
      unit: "pack",
    }),
    {
      name: "Diaper",
      default_quantity: 3,
      unit: "pack",
    },
  );
});

test("updates shared item template edit with item, family, and child filters", async () => {
  const calls: unknown[] = [];
  const client = createMockClient(calls, {
    data: { id: "template-1" },
    error: null,
  });

  await saveSharedItemTemplateEdit(client, {
    familyId: "family-1",
    childId: "child-1",
    itemId: "template-1",
    changes: {
      name: "Diaper",
      count: 3,
      unit: "pack",
    },
  });

  assert.deepEqual(calls, [
    ["from", "item_templates"],
    [
      "update",
      {
        name: "Diaper",
        default_quantity: 3,
        unit: "pack",
      },
    ],
    ["eq", "id", "template-1"],
    ["eq", "family_id", "family-1"],
    ["eq", "child_id", "child-1"],
    ["select", "id"],
    ["maybeSingle"],
  ]);
});

test("soft deletes a shared item template with item, family, and child filters", async () => {
  const calls: unknown[] = [];

  await saveSharedItemTemplateDelete(
    createMockClient(calls, {
      data: { id: "template-1" },
      error: null,
    }),
    {
      familyId: "family-1",
      childId: "child-1",
      itemId: "template-1",
    },
  );

  assert.deepEqual(calls, [
    ["from", "item_templates"],
    ["update", { is_active: false }],
    ["eq", "id", "template-1"],
    ["eq", "family_id", "family-1"],
    ["eq", "child_id", "child-1"],
    ["select", "id"],
    ["maybeSingle"],
  ]);
});

test("throws when shared item template delete matches no rows", async () => {
  await assert.rejects(
    saveSharedItemTemplateDelete(
      createMockClient([], { data: null, error: null }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-1",
      },
    ),
    /shared_item_template_not_found/,
  );
});

test("throws when shared item template delete update fails", async () => {
  const updateError = new Error("delete failed");

  await assert.rejects(
    saveSharedItemTemplateDelete(
      createMockClient([], { data: null, error: updateError }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-1",
      },
    ),
    updateError,
  );
});

test("does not run ambiguous shared item template deletes without ids", async () => {
  for (const input of [
    { familyId: "", childId: "child-1", itemId: "template-1" },
    { familyId: "family-1", childId: " ", itemId: "template-1" },
    { familyId: "family-1", childId: "child-1", itemId: "" },
  ]) {
    const calls: unknown[] = [];
    await assert.rejects(
      saveSharedItemTemplateDelete(
        createMockClient(calls, {
          data: { id: "template-1" },
          error: null,
        }),
        input,
      ),
      /missing_(familyId|childId|itemId)/,
    );
    assert.deepEqual(calls, []);
  }
});

test("accepts shared item edits at the quantity and unit write limits", async () => {
  const calls: unknown[] = [];
  await saveSharedItemTemplateEdit(
    createMockClient(calls, { data: { id: "template-1" }, error: null }),
    {
      familyId: "family-1",
      childId: "child-1",
      itemId: "template-1",
      changes: { count: 5, unit: "u".repeat(10) },
    },
  );
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "update"), true);
});

test("rejects invalid shared item edits before update", async () => {
  for (const changes of [
    { count: -1 },
    { count: 1.5 },
    { count: 6 },
    { count: 10 },
    { count: 11 },
    { count: 999 },
    { count: 1000 },
    { unit: "u".repeat(11) },
  ]) {
    const calls: unknown[] = [];
    await assert.rejects(
      saveSharedItemTemplateEdit(
        createMockClient(calls, { data: { id: "template-1" }, error: null }),
        {
          familyId: "family-1",
          childId: "child-1",
          itemId: "template-1",
          changes,
        },
      ),
      /invalid_home_/,
    );
    assert.deepEqual(calls, []);
  }
});

test("throws when shared item template edit update matches no rows", async () => {
  await assert.rejects(
    saveSharedItemTemplateEdit(
      createMockClient([], { data: null, error: null }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-1",
        changes: { name: "Diaper" },
      },
    ),
    /shared_item_template_not_found/,
  );
});

test("throws when shared item template edit update fails", async () => {
  const updateError = new Error("update failed");

  await assert.rejects(
    saveSharedItemTemplateEdit(
      createMockClient([], { data: null, error: updateError }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-1",
        changes: { name: "Diaper" },
      },
    ),
    updateError,
  );
});

test("does not run ambiguous shared item template edit updates without ids", async () => {
  const missingFamilyCalls: unknown[] = [];
  await assert.rejects(
    saveSharedItemTemplateEdit(
      createMockClient(missingFamilyCalls, {
        data: { id: "template-1" },
        error: null,
      }),
      {
        familyId: "",
        childId: "child-1",
        itemId: "template-1",
        changes: { name: "Diaper" },
      },
    ),
    /missing_familyId/,
  );
  assert.deepEqual(missingFamilyCalls, []);

  const missingChildCalls: unknown[] = [];
  await assert.rejects(
    saveSharedItemTemplateEdit(
      createMockClient(missingChildCalls, {
        data: { id: "template-1" },
        error: null,
      }),
      {
        familyId: "family-1",
        childId: " ",
        itemId: "template-1",
        changes: { name: "Diaper" },
      },
    ),
    /missing_childId/,
  );
  assert.deepEqual(missingChildCalls, []);

  const missingItemCalls: unknown[] = [];
  await assert.rejects(
    saveSharedItemTemplateEdit(
      createMockClient(missingItemCalls, {
        data: { id: "template-1" },
        error: null,
      }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "",
        changes: { name: "Diaper" },
      },
    ),
    /missing_itemId/,
  );
  assert.deepEqual(missingItemCalls, []);
});

test("rejects empty shared item template edit updates before query", async () => {
  const calls: unknown[] = [];

  await assert.rejects(
    saveSharedItemTemplateEdit(
      createMockClient(calls, { data: { id: "template-1" }, error: null }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-1",
        changes: {},
      },
    ),
    /missing_item_template_update/,
  );

  assert.deepEqual(calls, []);
});

test("updates only current rough state with rough kind filter", async () => {
  const calls: unknown[] = [];
  const client = createMockClient(calls, {
    data: { id: "template-rough" },
    error: null,
  });

  await saveSharedRoughState(client, {
    familyId: "family-1",
    childId: "child-1",
    itemId: "template-rough",
    roughState: "補充",
  });

  assert.deepEqual(calls, [
    ["from", "item_templates"],
    ["update", { current_rough_state: "refill" }],
    ["eq", "id", "template-rough"],
    ["eq", "family_id", "family-1"],
    ["eq", "child_id", "child-1"],
    ["eq", "kind", "rough"],
    ["select", "id"],
    ["maybeSingle"],
  ]);
});

test("rejects invalid rough states before query", async () => {
  const calls: unknown[] = [];

  assert.throws(() => toDbRoughState("empty"), /invalid_roughState/);

  await assert.rejects(
    saveSharedRoughState(
      createMockClient(calls, { data: { id: "template-rough" }, error: null }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-rough",
        roughState: "empty",
      },
    ),
    /invalid_roughState/,
  );
  assert.deepEqual(calls, []);
});

test("throws when shared rough state update matches no rows", async () => {
  await assert.rejects(
    saveSharedRoughState(createMockClient([], { data: null, error: null }), {
      familyId: "family-1",
      childId: "child-1",
      itemId: "template-rough",
      roughState: "十分",
    }),
    /shared_rough_state_not_found/,
  );
});

test("throws when shared rough state update fails", async () => {
  const updateError = new Error("update failed");

  await assert.rejects(
    saveSharedRoughState(
      createMockClient([], { data: null, error: updateError }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-rough",
        roughState: "十分",
      },
    ),
    updateError,
  );
});

test("does not run ambiguous shared rough state updates without ids", async () => {
  const missingFamilyCalls: unknown[] = [];
  await assert.rejects(
    saveSharedRoughState(
      createMockClient(missingFamilyCalls, {
        data: { id: "template-rough" },
        error: null,
      }),
      {
        familyId: "",
        childId: "child-1",
        itemId: "template-rough",
        roughState: "十分",
      },
    ),
    /missing_familyId/,
  );
  assert.deepEqual(missingFamilyCalls, []);

  const missingChildCalls: unknown[] = [];
  await assert.rejects(
    saveSharedRoughState(
      createMockClient(missingChildCalls, {
        data: { id: "template-rough" },
        error: null,
      }),
      {
        familyId: "family-1",
        childId: "",
        itemId: "template-rough",
        roughState: "十分",
      },
    ),
    /missing_childId/,
  );
  assert.deepEqual(missingChildCalls, []);

  const missingItemCalls: unknown[] = [];
  await assert.rejects(
    saveSharedRoughState(
      createMockClient(missingItemCalls, {
        data: { id: "template-rough" },
        error: null,
      }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: " ",
        roughState: "十分",
      },
    ),
    /missing_itemId/,
  );
  assert.deepEqual(missingItemCalls, []);
});

function createMockClient(
  calls: unknown[],
  result: { data: { id: string } | null; error: Error | null },
): SharedItemTemplateClient {
  const query = {
    update(value: unknown) {
      calls.push(["update", value]);
      return this;
    },
    eq(column: string, value: string) {
      calls.push(["eq", column, value]);
      return this;
    },
    select(columns: string) {
      calls.push(["select", columns]);
      return this;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
  };

  return {
    from(table: string) {
      calls.push(["from", table]);
      return query;
    },
  } as unknown as SharedItemTemplateClient;
}

function regularAddInput() {
  return {
    familyId: "family-1",
    childId: "child-1",
    kind: "regular" as const,
    name: "Towel",
    defaultQuantity: 2,
    unit: "枚",
    currentRoughState: null,
  };
}

async function assertAddRejectedBeforeQuery(
  overrides: Partial<SaveSharedItemTemplateAddInput>,
  expectedError: RegExp,
) {
  const calls: unknown[] = [];
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createAddMockClient(calls, {
        maxResult: { data: null, error: null },
        insertResult: { data: { id: regularUuid, sort_order: 0 }, error: null },
      }),
      { ...regularAddInput(), ...overrides },
    ),
    expectedError,
  );
  assert.deepEqual(calls, []);
}

function hasInsertCall(calls: unknown[]) {
  return calls.some((call) => Array.isArray(call) && call[0] === "insert");
}

function createAddMockClient(
  calls: unknown[],
  results: {
    maxResult: {
      data: { sort_order: unknown } | null;
      error: Error | null;
    };
    insertResult: {
      data: { id: string; sort_order: number } | null;
      error: Error | null;
    };
  },
): SharedItemTemplateAddClient {
  const maxQuery = {
    eq(column: string, value: string) {
      calls.push(["eq-max", column, value]);
      return this;
    },
    order(column: string, options: { ascending: false }) {
      calls.push(["order", column, options]);
      return this;
    },
    limit(count: number) {
      calls.push(["limit", count]);
      return {
        maybeSingle: () => {
          calls.push(["maybeSingle"]);
          return Promise.resolve(results.maxResult);
        },
      };
    },
  };

  return {
    from(table: "item_templates") {
      calls.push(["from", table]);
      return {
        select(columns: "sort_order") {
          calls.push(["select-max", columns]);
          return maxQuery;
        },
        insert(value) {
          calls.push(["insert", value]);
          return {
            select(columns: "id, sort_order") {
              calls.push(["select-insert", columns]);
              return {
                single() {
                  calls.push(["single"]);
                  return Promise.resolve(results.insertResult);
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SharedItemTemplateAddClient;
}
