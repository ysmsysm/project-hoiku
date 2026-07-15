import assert from "node:assert/strict";
import test from "node:test";
import {
  saveSharedItemTemplateEdit,
  saveSharedRoughState,
  toDbRoughState,
  toItemTemplateEditUpdate,
  type SharedItemTemplateClient,
} from "../src/lib/family-sharing/save-item-template";

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
