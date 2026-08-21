import assert from "node:assert/strict";
import test from "node:test";
import {
  saveSharedItemTemplateAdd,
  saveSharedItemTemplateSortOrders,
  type SharedItemTemplateAddClient,
  type SharedItemTemplateSortOrderClient,
} from "../src/lib/family-sharing/save-item-template";
import {
  getSharedTemplateMutationErrorMessage,
  updateSharedItemTemplate,
  updateSharedRoughItemState,
  updateSharedSpotItemTemplate,
  type SharedTemplateUpdateClient,
} from "../src/lib/family-sharing/update-item-template";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const updatedAt = "2026-08-06T01:02:03.123456+00:00";
const nextUpdatedAt = "2026-08-06T01:02:04.123456+00:00";

const success = (kind: "regular" | "rough" | "spot", changed = true) => ({
  status: "success",
  changed,
  reason: null,
  family_id: familyId,
  child_id: childId,
  item_template_id: itemId,
  kind,
  name: "タオル",
  default_quantity: 2,
  unit: kind === "rough" ? "組" : kind === "spot" ? "個" : "枚",
  current_rough_state: kind === "rough" ? "low" : null,
  weekdays: kind === "spot" ? [1, 3] : [],
  sort_order: 4,
  is_active: true,
  updated_at: changed ? nextUpdatedAt : updatedAt,
});

function rpcClient(data: unknown, error: unknown = null) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const client: SharedTemplateUpdateClient = {
    async rpc(name, args) {
      calls.push([name, args]);
      return { data, error };
    },
  };
  return { client, calls };
}

test("regular edit uses the locked RPC with exact arguments and null unit", async () => {
  const { client, calls } = rpcClient(success("regular"));
  const result = await updateSharedItemTemplate(client, {
    familyId,
    childId,
    itemTemplateId: itemId,
    expectedUpdatedAt: updatedAt,
    kind: "regular",
    name: "タオル",
    defaultQuantity: 2,
    unit: null,
  });
  assert.equal(result.status, "success");
  assert.deepEqual(calls, [["update_family_item_template", {
    p_family_id: familyId,
    p_child_id: childId,
    p_item_template_id: itemId,
    p_expected_updated_at: updatedAt,
    p_name: "タオル",
    p_default_quantity: 2,
    p_unit: null,
  }]]);
});

test("rough edit and state use their exact RPC contracts", async () => {
  const edit = rpcClient(success("rough"));
  await updateSharedItemTemplate(edit.client, {
    familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt,
    kind: "rough", name: "タオル", defaultQuantity: 2, unit: "組",
  });
  assert.equal(edit.calls[0][0], "update_family_item_template");
  assert.equal(Object.keys(edit.calls[0][1]).length, 7);

  const state = rpcClient(success("rough"));
  await updateSharedRoughItemState(state.client, {
    familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt,
    currentRoughState: "low",
  });
  assert.deepEqual(state.calls, [["update_family_rough_item_state", {
    p_family_id: familyId,
    p_child_id: childId,
    p_item_template_id: itemId,
    p_expected_updated_at: updatedAt,
    p_current_rough_state: "low",
  }]]);
});

test("spot edit snapshots, sorts, and sends weekdays through only the new RPC", async () => {
  const { client, calls } = rpcClient(success("spot"));
  const weekdays = [3, 1];
  const pending = updateSharedSpotItemTemplate(client, {
    familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt,
    name: "タオル", defaultQuantity: 2, weekdays,
  });
  weekdays.push(5);
  assert.equal((await pending).status, "success");
  assert.deepEqual(calls, [["update_family_spot_item_template", {
    p_family_id: familyId,
    p_child_id: childId,
    p_item_template_id: itemId,
    p_expected_updated_at: updatedAt,
    p_name: "タオル",
    p_default_quantity: 2,
    p_weekdays: [1, 3],
  }]]);
});

test("invalid and hostile inputs fail closed without calling RPC", async () => {
  const { client, calls } = rpcClient(success("regular"));
  const invalidInputs = [
    { familyId: "bad", childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt, kind: "regular", name: "タオル", defaultQuantity: 2, unit: null },
    { familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: "bad", kind: "regular", name: "タオル", defaultQuantity: 2, unit: null },
    { familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt, kind: "regular", name: "", defaultQuantity: 2, unit: null },
    { familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt, kind: "regular", name: "タオル", defaultQuantity: 6, unit: null },
    { familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt, kind: "rough", name: "タオル", defaultQuantity: 2, unit: "x".repeat(11) },
  ] as const;
  for (const input of invalidInputs) {
    assert.equal((await updateSharedItemTemplate(client, input)).status, "client_error");
  }
  const hostile = new Proxy({}, { get() { throw new Error("secret"); } });
  assert.equal((await updateSharedItemTemplate(client, hostile as never)).status, "client_error");
  assert.equal((await updateSharedRoughItemState(client, hostile as never)).status, "client_error");
  assert.equal((await updateSharedSpotItemTemplate(client, hostile as never)).status, "client_error");
  assert.equal(calls.length, 0);
});

test("rough state and weekdays whitelist invalid values", async () => {
  const { client, calls } = rpcClient(success("rough"));
  assert.equal((await updateSharedRoughItemState(client, {
    familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt,
    currentRoughState: "other" as never,
  })).status, "client_error");
  for (const weekdays of [[0, 0], [-1], [7], [0, 1, 2, 3, 4, 5, 6, 7]]) {
    assert.equal((await updateSharedSpotItemTemplate(client, {
      familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt,
      name: "タオル", defaultQuantity: 2, weekdays,
    })).status, "client_error");
  }
  assert.equal(calls.length, 0);
});

test("transport rejection and response.error are classified without raw errors", async () => {
  const rejecting: SharedTemplateUpdateClient = { rpc: async () => { throw new Error("password=raw-secret"); } };
  const input = { familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt, currentRoughState: "low" as const };
  const rejected = await updateSharedRoughItemState(rejecting, input);
  const errored = await updateSharedRoughItemState(rpcClient(null, { message: "raw-secret" }).client, input);
  assert.deepEqual(rejected, { status: "transport_error", changed: false, reason: null });
  assert.deepEqual(errored, rejected);
  assert.equal(JSON.stringify([rejected, errored]).includes("raw-secret"), false);
});

test("shared regular quantity RPC errors reach the reported save-result message", async () => {
  const result = await updateSharedItemTemplate(
    rpcClient(null, {
      code: "42883",
      message: "function pg_catalog.coalesce does not exist",
    }).client,
    {
      familyId,
      childId,
      itemTemplateId: itemId,
      expectedUpdatedAt: updatedAt,
      kind: "regular",
      name: "タオル",
      defaultQuantity: 3,
      unit: null,
    },
  );

  assert.deepEqual(result, {
    status: "transport_error",
    changed: false,
    reason: null,
  });
  if (result.status !== "success") {
    assert.equal(
      getSharedTemplateMutationErrorMessage(result),
      "保存結果を確認できませんでした。再読み込みしてください。",
    );
  }
});

test("all business statuses and safe messages are mapped", async () => {
  const input = { familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt, currentRoughState: "low" as const };
  for (const payload of [
    { status: "conflict", changed: false, reason: "stale_template" },
    { status: "forbidden", changed: false, reason: null },
    { status: "not_found", changed: false, reason: null },
    { status: "invalid_state", changed: false, reason: "invalid_input" },
    { status: "invalid_state", changed: false, reason: "inactive_template" },
    { status: "invalid_state", changed: false, reason: "wrong_kind" },
  ] as const) {
    const result = await updateSharedRoughItemState(rpcClient(payload).client, input);
    assert.equal(result.status, payload.status);
    assert.equal(typeof getSharedTemplateMutationErrorMessage(result), "string");
  }
});

test("unknown status, reason, and malformed or mismatched metadata are rejected", async () => {
  const input = { familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt, currentRoughState: "low" as const };
  const malformed = [
    { status: "mystery", changed: false, reason: null },
    { status: "conflict", changed: false, reason: "mystery" },
    { ...success("rough"), family_id: childId },
    { ...success("rough"), child_id: familyId },
    { ...success("rough"), item_template_id: familyId },
    { ...success("regular") },
    { ...success("rough"), updated_at: "bad" },
    { ...success("rough"), weekdays: [1] },
    { ...success("rough"), default_quantity: 1.5 },
    { ...success("rough"), changed: "true" },
    { ...success("rough"), is_active: false },
    { ...success("rough"), sort_order: 1.5 },
    { ...success("spot"), weekdays: [1, 1] },
    new Proxy({}, { get() { throw new Error("hostile response"); } }),
  ];
  for (const payload of malformed) {
    assert.equal((await updateSharedRoughItemState(rpcClient(payload).client, input)).status, "invalid_response");
  }
});

test("success metadata is snapshotted once before validation and mapping", async () => {
  const payload = success("regular");
  const reads = new Map<PropertyKey, number>();
  const hostile = new Proxy(payload, {
    get(target, property, receiver) {
      const count = (reads.get(property) ?? 0) + 1;
      reads.set(property, count);
      if (count > 1) throw new Error("getter read twice");
      return Reflect.get(target, property, receiver);
    },
  });
  const result = await updateSharedItemTemplate(rpcClient(hostile).client, {
    familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt,
    kind: "regular", name: "タオル", defaultQuantity: 2, unit: null,
  });
  assert.equal(result.status, "success");
  assert.equal([...reads.values()].every((count) => count === 1), true);
});

test("changed false canonical success preserves the optimistic timestamp", async () => {
  const result = await updateSharedItemTemplate(rpcClient(success("regular", false)).client, {
    familyId, childId, itemTemplateId: itemId, expectedUpdatedAt: updatedAt,
    kind: "regular", name: "タオル", defaultQuantity: 2, unit: null,
  });
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.changed, false);
    assert.equal(result.updatedAt, updatedAt);
  }
});

test("add and sort RPC helpers remain connected", async () => {
  const addCalls: unknown[] = [];
  const addClient: SharedItemTemplateAddClient = {
    async rpc(name, args) {
      addCalls.push([name, args]);
      return { data: [{ id: itemId, sort_order: 0 }], error: null };
    },
  };
  assert.deepEqual(await saveSharedItemTemplateAdd(addClient, {
    familyId, childId, kind: "regular", name: "タオル", defaultQuantity: 2,
    unit: "枚", currentRoughState: null,
  }), { id: itemId, sortOrder: 0 });
  assert.equal((addCalls[0] as unknown[])[0], "add_family_item_template");

  const sortCalls: unknown[] = [];
  const sortClient: SharedItemTemplateSortOrderClient = {
    async rpc(name, args) { sortCalls.push([name, args]); return { data: null, error: null }; },
  };
  await saveSharedItemTemplateSortOrders(sortClient, {
    familyId, childId, items: [{ id: itemId, sortOrder: 0 }],
  });
  assert.equal((sortCalls[0] as unknown[])[0], "update_family_item_template_sort_orders");
});
