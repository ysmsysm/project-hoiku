import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailySpotMutationRpcArgs,
  mapDailySpotMutationResponse,
  mutateDailySpotItem,
  type DailySpotMutationClient,
} from "../src/lib/family-sharing/mutate-daily-spot-item";

const scope = {
  familyId: "11111111-1111-4111-8111-111111111111",
  childId: "22222222-2222-4222-8222-222222222222",
  sessionDate: "2026-08-15",
};
const itemId = "33333333-3333-4333-8333-333333333333";
const templateId = "44444444-4444-4444-8444-444444444444";

test("builds exact add, temporary, delete, and due-date RPC values", () => {
  assert.deepEqual(buildDailySpotMutationRpcArgs({ ...scope, action: "add_template", itemTemplateId: templateId, dueDate: null }), {
    p_family_id: scope.familyId, p_child_id: scope.childId, p_session_date: scope.sessionDate,
    p_action: "add_template", p_daily_item_id: null, p_expected_version: null,
    p_item_template_id: templateId, p_name: null, p_quantity: null, p_due_date: null,
  });
  assert.deepEqual(buildDailySpotMutationRpcArgs({ ...scope, action: "add_temporary", dailyItemId: itemId, name: "  おむつ  ", quantity: 2, dueDate: "2026-08-16" }), {
    p_family_id: scope.familyId, p_child_id: scope.childId, p_session_date: scope.sessionDate,
    p_action: "add_temporary", p_daily_item_id: itemId, p_expected_version: null,
    p_item_template_id: null, p_name: "おむつ", p_quantity: 2, p_due_date: "2026-08-16",
  });
  assert.equal(buildDailySpotMutationRpcArgs({ ...scope, action: "delete", dailyItemId: itemId, expectedVersion: 4 }).p_action, "delete");
  assert.equal(buildDailySpotMutationRpcArgs({ ...scope, action: "set_due_date", dailyItemId: itemId, expectedVersion: 4, dueDate: null }).p_due_date, null);
});

test("calls only mutate_daily_spot_item and keeps retry no-op success", async () => {
  const calls: unknown[] = [];
  const client: DailySpotMutationClient = { rpc: async (name, args) => {
    calls.push([name, args]);
    return { data: { status: "success", changed: false, item: itemPayload() }, error: null };
  } };
  const result = await mutateDailySpotItem(client, { ...scope, action: "add_template", itemTemplateId: templateId, dueDate: null });
  assert.equal(result.status, "success");
  assert.equal(result.status === "success" && result.changed, false);
  assert.equal(calls.length, 1);
});

test("maps delete, due set and clear metadata plus version conflicts", () => {
  const deleted = mapDailySpotMutationResponse({ status: "success", changed: true, item: itemPayload({ version: 5, deleted_at: "2026-08-15T10:00:00Z" }) });
  assert.equal(deleted.status === "success" && deleted.item.deletedAt, "2026-08-15T10:00:00Z");
  const due = mapDailySpotMutationResponse({ status: "success", changed: true, item: itemPayload({ due_date: "2026-08-20" }) });
  assert.equal(due.status === "success" && due.item.dueDate, "2026-08-20");
  const cleared = mapDailySpotMutationResponse({ status: "success", changed: true, item: itemPayload({ due_date: null }) });
  assert.equal(cleared.status === "success" && cleared.item.dueDate, null);
  assert.equal(mapDailySpotMutationResponse({ status: "conflict", changed: false, item: itemPayload({ version: 8 }) }).status, "conflict");
});

test("keeps completed and carryover-linked business failures distinct", () => {
  assert.deepEqual(mapDailySpotMutationResponse({ status: "invalid_state", changed: false, reason: "session_prepared", item: null }), { status: "invalid_state", changed: false, reason: "session_prepared" });
  assert.deepEqual(mapDailySpotMutationResponse({ status: "invalid_state", changed: false, reason: "carryover_linked", item: null }), { status: "invalid_state", changed: false, reason: "carryover_linked" });
});

test("rejects invalid inputs and transport failures without a fallback call", async () => {
  let calls = 0;
  const client: DailySpotMutationClient = { rpc: async () => { calls += 1; throw new Error("secret"); } };
  assert.equal((await mutateDailySpotItem(client, { ...scope, action: "delete", dailyItemId: "bad", expectedVersion: 1 })).status, "client_error");
  assert.equal(calls, 0);
  assert.equal((await mutateDailySpotItem(client, { ...scope, action: "delete", dailyItemId: itemId, expectedVersion: 1 })).status, "transport_error");
  assert.equal(calls, 1);
});

function itemPayload(overrides: Record<string, unknown> = {}) {
  return { daily_item_id: itemId, version: 4, deleted_at: null, due_date: null, item_template_id: templateId, is_ad_hoc: false, ...overrides };
}
