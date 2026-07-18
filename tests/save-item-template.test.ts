import assert from "node:assert/strict";
import test from "node:test";
import {
  saveSharedItemTemplateAdd,
  saveSharedItemTemplateDelete,
  saveSharedItemTemplateEdit,
  saveSharedItemTemplateSortOrders,
  saveSharedRoughState,
  toDbRoughState,
  toItemTemplateEditUpdate,
  type SaveSharedItemTemplateAddInput,
  type SaveSharedItemTemplateEditInput,
  type SharedItemTemplateAddClient,
  type SharedItemTemplateClient,
  type SharedItemTemplateSortOrderClient,
} from "../src/lib/family-sharing/save-item-template";

const regularUuid = "11111111-1111-4111-8111-111111111111";
const roughUuid = "22222222-2222-4222-8222-222222222222";
const anotherUuid = "33333333-3333-4333-8333-333333333333";
const spotUuid = "44444444-4444-4444-8444-444444444444";

test("adds a regular item template through the atomic RPC", async () => {
  const calls: unknown[] = [];
  const client = createItemAddMockClient(calls, {
    data: [{ id: regularUuid, sort_order: 8 }],
    error: null,
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
    [
      "rpc",
      "add_family_item_template",
      {
        p_family_id: "family-1",
        p_child_id: "child-1",
        p_kind: "regular",
        p_name: "Towel",
        p_default_quantity: 2,
        p_unit: "枚",
        p_current_rough_state: null,
      },
    ],
  ]);
  assert.equal(hasFromCall(calls), false);
  assert.equal(hasInsertCall(calls), false);
});

test("adds a rough item through the atomic RPC with enough state", async () => {
  const calls: unknown[] = [];
  const client = createItemAddMockClient(calls, {
    data: [{ id: roughUuid, sort_order: 0 }],
    error: null,
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
  assert.deepEqual(calls, [
    [
      "rpc",
      "add_family_item_template",
      {
        p_family_id: "family-1",
        p_child_id: "child-1",
        p_kind: "rough",
        p_name: "Diapers",
        p_default_quantity: 1,
        p_unit: "pack",
        p_current_rough_state: "enough",
      },
    ],
  ]);
  assert.equal(hasFromCall(calls), false);
  assert.equal(hasInsertCall(calls), false);
});

test("adds a spot item through the atomic RPC and returns its database UUID", async () => {
  const calls: unknown[] = [];
  const client = createSpotAddMockClient(calls, {
    data: [{ id: spotUuid, sort_order: 9 }],
    error: null,
  });

  const result = await saveSharedItemTemplateAdd(client, {
    familyId: "family-1",
    childId: "child-1",
    kind: "spot",
    name: " Water bottle ",
    defaultQuantity: 0,
    unit: "個",
    currentRoughState: null,
    weekdays: [0, 6],
  });

  assert.deepEqual(result, { id: spotUuid, sortOrder: 9 });
  assert.deepEqual(calls, [
    [
      "rpc",
      "add_family_spot_item_template",
      {
        p_family_id: "family-1",
        p_child_id: "child-1",
        p_name: "Water bottle",
        p_default_quantity: 0,
        p_weekdays: [0, 6],
      },
    ],
  ]);
});

test("spot add accepts zero to seven weekdays and quantities zero through five", async () => {
  for (const defaultQuantity of [0, 1, 5]) {
    for (const weekdays of [[], [1], [1, 5], [0, 1, 2, 3, 4, 5, 6]]) {
      const result = await saveSharedItemTemplateAdd(
        createSpotAddMockClient([], {
          data: [{ id: spotUuid, sort_order: 0 }],
          error: null,
        }),
        {
          ...spotAddInput(),
          defaultQuantity,
          weekdays,
        },
      );
      assert.equal(result.id, spotUuid);
    }
  }
});

test("spot add rejects invalid quantity, weekdays, unit, and rough state before RPC", async () => {
  const invalidInputs: SaveSharedItemTemplateAddInput[] = [
    { ...spotAddInput(), defaultQuantity: -1 },
    { ...spotAddInput(), defaultQuantity: 6 },
    { ...spotAddInput(), weekdays: [0, 1, 2, 3, 4, 5, 6, 0] },
    { ...spotAddInput(), weekdays: [-1] },
    { ...spotAddInput(), weekdays: [7] },
    { ...spotAddInput(), weekdays: [1, 1] },
    { ...spotAddInput(), unit: "枚" },
    { ...spotAddInput(), currentRoughState: "enough" },
  ];

  for (const input of invalidInputs) {
    const calls: unknown[] = [];
    await assert.rejects(
      saveSharedItemTemplateAdd(
        createSpotAddMockClient(calls, {
          data: [{ id: spotUuid, sort_order: 0 }],
          error: null,
        }),
        input,
      ),
    );
    assert.deepEqual(calls, []);
  }
});

test("spot RPC failure is returned without a direct item_templates insert", async () => {
  const calls: unknown[] = [];
  const error = new Error("weekday insert failed");
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createSpotAddMockClient(calls, { data: null, error }),
      spotAddInput(),
    ),
    error,
  );
  assert.equal(calls.length, 1);
  assert.equal(hasInsertCall(calls), false);
});

test("spot RPC preserves PostgREST error fields in a loggable Error", async () => {
  const postgrestError = {
    code: "42702",
    message: "column reference is ambiguous",
    details: "It could refer to a variable or a table column.",
    hint: "Qualify the reference.",
  };

  await assert.rejects(
    saveSharedItemTemplateAdd(
      createSpotAddMockClient([], { data: null, error: postgrestError }),
      spotAddInput(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /code=42702/);
      assert.match(error.message, /message=column reference is ambiguous/);
      assert.match(error.message, /details=It could refer to a variable or a table column\./);
      assert.match(error.message, /hint=Qualify the reference\./);
      return true;
    },
  );
});

test("accepts shared item input values at the durable write limits", async () => {
  const regular = await saveSharedItemTemplateAdd(
    createItemAddMockClient([], {
      data: [{ id: regularUuid, sort_order: 0 }],
      error: null,
    }),
    {
      ...regularAddInput(),
      name: "a".repeat(80),
      defaultQuantity: 5,
    },
  );
  assert.equal(regular.id, regularUuid);

  const rough = await saveSharedItemTemplateAdd(
    createItemAddMockClient([], {
      data: [{ id: roughUuid, sort_order: 0 }],
      error: null,
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

test("propagates item template add RPC failures", async () => {
  const insertError = { code: "P0001", message: "insert failed" };
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createItemAddMockClient([], {
        data: null,
        error: insertError,
      }),
      regularAddInput(),
    ),
    /shared_item_template_save_failed/,
  );
});

test("rejects missing or invalid item template add RPC results", async () => {
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createItemAddMockClient([], {
        data: null,
        error: null,
      }),
      regularAddInput(),
    ),
    /shared_item_template_add_result_invalid/,
  );

  await assert.rejects(
    saveSharedItemTemplateAdd(
      createItemAddMockClient([], {
        data: [{ id: anotherUuid, sort_order: Number.NaN }],
        error: null,
      }),
      regularAddInput(),
    ),
    /shared_item_template_add_result_invalid/,
  );

  for (const invalidId of ["", "not-a-uuid"]) {
    await assert.rejects(
      saveSharedItemTemplateAdd(
        createItemAddMockClient([], {
          data: [{ id: invalidId, sort_order: 0 }],
          error: null,
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
      weekdays: [1, 3],
    }),
    {
      name: "Diaper",
      default_quantity: 3,
      unit: "pack",
    },
  );
});

test("updates shared spot fields and weekdays through the atomic weekday RPC", async () => {
  const calls: unknown[] = [];

  await saveSharedItemTemplateEdit(
    createSpotWeekdayEditMockClient(calls, { data: null, error: null }),
    {
      familyId: "family-1",
      childId: "child-1",
      itemId: "template-spot",
      changes: {
        name: " Water bottle ",
        count: 0,
        weekdays: [0, 6],
      },
    },
  );

  assert.deepEqual(calls, [
    [
      "rpc",
      "update_family_spot_item_template_weekdays",
      {
        p_family_id: "family-1",
        p_child_id: "child-1",
        p_item_template_id: "template-spot",
        p_weekdays: [0, 6],
        p_name: " Water bottle ",
        p_default_quantity: 0,
      },
    ],
  ]);
});

test("shared spot name-only and quantity-only edits still use the atomic weekday RPC", async () => {
  const cases: Array<{
    changes: SaveSharedItemTemplateEditInput["changes"];
    expectedName: string | null;
    expectedQuantity: number | null;
  }> = [
    {
      changes: { name: "Water bottle", weekdays: [1, 3] },
      expectedName: "Water bottle",
      expectedQuantity: null,
    },
    {
      changes: { count: 0, weekdays: [1, 3] },
      expectedName: null,
      expectedQuantity: 0,
    },
  ];

  for (const testCase of cases) {
    const calls: unknown[] = [];
    await saveSharedItemTemplateEdit(
      createSpotWeekdayEditMockClient(calls, { data: null, error: null }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-spot",
        changes: testCase.changes,
      },
    );

    assert.deepEqual(calls, [
      [
        "rpc",
        "update_family_spot_item_template_weekdays",
        {
          p_family_id: "family-1",
          p_child_id: "child-1",
          p_item_template_id: "template-spot",
          p_weekdays: [1, 3],
          p_name: testCase.expectedName,
          p_default_quantity: testCase.expectedQuantity,
        },
      ],
    ]);
  }
});

test("spot weekday edit accepts zero to seven weekdays", async () => {
  for (const weekdays of [[], [1], [1, 5], [0, 1, 2, 3, 4, 5, 6]]) {
    const calls: unknown[] = [];
    await saveSharedItemTemplateEdit(
      createSpotWeekdayEditMockClient(calls, { data: null, error: null }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-spot",
        changes: { weekdays },
      },
    );

    assert.equal(calls.length, 1);
  }
});

test("spot weekday edit rejects invalid weekdays before RPC", async () => {
  const invalidChanges: SaveSharedItemTemplateEditInput["changes"][] = [
    { weekdays: [0, 1, 2, 3, 4, 5, 6, 0] },
    { weekdays: [-1] },
    { weekdays: [7] },
    { weekdays: [1, 1] },
  ];

  for (const changes of invalidChanges) {
    const calls: unknown[] = [];
    await assert.rejects(
      saveSharedItemTemplateEdit(
        createSpotWeekdayEditMockClient(calls, { data: null, error: null }),
        {
          familyId: "family-1",
          childId: "child-1",
          itemId: "template-spot",
          changes,
        },
      ),
    );
    assert.deepEqual(calls, []);
  }
});

test("spot weekday edit does not fall back to item_templates update when RPC fails", async () => {
  const calls: unknown[] = [];
  const error = new Error("weekday update failed");

  await assert.rejects(
    saveSharedItemTemplateEdit(
      createSpotWeekdayEditMockClient(calls, { data: null, error }),
      {
        familyId: "family-1",
        childId: "child-1",
        itemId: "template-spot",
        changes: { name: "Water bottle", count: 2, weekdays: [2] },
      },
    ),
    error,
  );

  assert.equal(calls.length, 1);
  assert.equal(hasUpdateCall(calls), false);
});

test("updates shared item template sort orders through the atomic RPC", async () => {
  const calls: unknown[] = [];

  await saveSharedItemTemplateSortOrders(
    createSortOrderMockClient(calls, { data: null, error: null }),
    {
      familyId: "family-1",
      childId: "child-1",
      items: [
        { id: regularUuid, sortOrder: 0 },
        { id: spotUuid, sortOrder: 1 },
        { id: roughUuid, sortOrder: 2 },
      ],
    },
  );

  assert.deepEqual(calls, [
    [
      "rpc",
      "update_family_item_template_sort_orders",
      {
        p_family_id: "family-1",
        p_child_id: "child-1",
        p_items: [
          { id: regularUuid, sortOrder: 0 },
          { id: spotUuid, sortOrder: 1 },
          { id: roughUuid, sortOrder: 2 },
        ],
      },
    ],
  ]);
});

test("shared sort order save rejects invalid input before RPC", async () => {
  for (const items of [
    [{ id: "not-a-uuid", sortOrder: 0 }],
    [
      { id: regularUuid, sortOrder: 0 },
      { id: regularUuid, sortOrder: 1 },
    ],
    [{ id: regularUuid, sortOrder: -1 }],
    [{ id: regularUuid, sortOrder: 1.5 }],
    [
      { id: regularUuid, sortOrder: 0 },
      { id: spotUuid, sortOrder: 0 },
    ],
    [
      { id: regularUuid, sortOrder: 0 },
      { id: spotUuid, sortOrder: 2 },
    ],
  ]) {
    const calls: unknown[] = [];

    await assert.rejects(
      saveSharedItemTemplateSortOrders(
        createSortOrderMockClient(calls, { data: null, error: null }),
        {
          familyId: "family-1",
          childId: "child-1",
          items,
        },
      ),
      /item_template/,
    );

    assert.deepEqual(calls, []);
  }
});

test("shared sort order RPC failure does not fall back to item_templates update", async () => {
  const calls: unknown[] = [];
  const error = new Error("sort order update failed");

  await assert.rejects(
    saveSharedItemTemplateSortOrders(
      createSortOrderMockClient(calls, { data: null, error }),
      {
        familyId: "family-1",
        childId: "child-1",
        items: [{ id: regularUuid, sortOrder: 0 }],
      },
    ),
    error,
  );

  assert.equal(calls.length, 1);
  assert.equal(hasUpdateCall(calls), false);
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

function spotAddInput(): SaveSharedItemTemplateAddInput {
  return {
    familyId: "family-1",
    childId: "child-1",
    kind: "spot",
    name: "Water bottle",
    defaultQuantity: 1,
    unit: "個",
    currentRoughState: null,
    weekdays: [],
  };
}

async function assertAddRejectedBeforeQuery(
  overrides: Partial<SaveSharedItemTemplateAddInput>,
  expectedError: RegExp,
) {
  const calls: unknown[] = [];
  await assert.rejects(
    saveSharedItemTemplateAdd(
      createItemAddMockClient(calls, {
        data: [{ id: regularUuid, sort_order: 0 }],
        error: null,
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

function hasFromCall(calls: unknown[]) {
  return calls.some((call) => Array.isArray(call) && call[0] === "from");
}

function hasUpdateCall(calls: unknown[]) {
  return calls.some((call) => Array.isArray(call) && call[0] === "update");
}

function createItemAddMockClient(
  calls: unknown[],
  result: {
    data: { id: string; sort_order: number }[] | null;
    error: unknown;
  },
): SharedItemTemplateAddClient {
  return {
    from() {
      throw new Error("regular and rough add must use the atomic RPC");
    },
    rpc(functionName, args) {
      calls.push(["rpc", functionName, args]);
      return Promise.resolve(result);
    },
  } as unknown as SharedItemTemplateAddClient;
}

function createSpotAddMockClient(
  calls: unknown[],
  result: {
    data: { id: string; sort_order: number }[] | null;
    error: unknown;
  },
): SharedItemTemplateAddClient {
  return {
    from() {
      throw new Error("spot add must not query item_templates directly");
    },
    rpc(functionName, args) {
      calls.push(["rpc", functionName, args]);
      return Promise.resolve(result);
    },
  } as unknown as SharedItemTemplateAddClient;
}

function createSpotWeekdayEditMockClient(
  calls: unknown[],
  result: {
    data: unknown;
    error: unknown;
  },
): SharedItemTemplateClient {
  return {
    from() {
      throw new Error("spot weekday edit must use the atomic RPC");
    },
    rpc(functionName, args) {
      calls.push(["rpc", functionName, args]);
      return Promise.resolve(result);
    },
  } as unknown as SharedItemTemplateClient;
}

function createSortOrderMockClient(
  calls: unknown[],
  result: {
    data: unknown;
    error: unknown;
  },
): SharedItemTemplateSortOrderClient {
  return {
    rpc(functionName, args) {
      calls.push(["rpc", functionName, args]);
      return Promise.resolve(result);
    },
  };
}
