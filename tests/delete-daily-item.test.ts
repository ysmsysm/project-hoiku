import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteDailyItem,
  mapDeleteDailyItemResponse,
  validateDeleteDailyItemInput,
} from "../src/lib/family-sharing/delete-daily-item";
import type {
  DeleteDailyItemClient,
  DeleteDailyItemInput,
} from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const templateId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const dailyItemId = "55555555-5555-4555-8555-555555555555";
const memberId = "66666666-6666-4666-8666-666666666666";
const userId = "77777777-7777-4777-8777-777777777777";
const input: DeleteDailyItemInput = {
  familyId,
  childId,
  sessionDate: "2026-08-05",
  itemTemplateId: templateId,
  expectedTemplateUpdatedAt: "2026-08-05T00:00:00.000Z",
  dailyItemId,
  expectedDailyItemVersion: 3,
};

const template = (overrides: Record<string, unknown> = {}) => ({
  id: templateId,
  family_id: familyId,
  child_id: childId,
  is_active: false,
  updated_at: "2026-08-05T01:00:00.000Z",
  ...overrides,
});

const dailyItem = (overrides: Record<string, unknown> = {}) => ({
  id: dailyItemId,
  daily_item_id: dailyItemId,
  daily_session_id: sessionId,
  family_id: familyId,
  child_id: childId,
  session_date: input.sessionDate,
  item_template_id: templateId,
  version: 4,
  deleted_at: "2026-08-05T01:00:00.000Z",
  updated_at: "2026-08-05T01:00:00.000Z",
  updated_by_member_id: memberId,
  updated_by_user_id: userId,
  updated_by_display_name: "Parent",
  ...overrides,
});

const success = (overrides: Record<string, unknown> = {}) => ({
  status: "success",
  changed: true,
  reason: null,
  template: template(),
  daily_item: dailyItem(),
  ...overrides,
});

const clientReturning = (
  data: unknown,
  error: unknown = null,
  calls: Array<{ name: string; args: unknown }> = [],
): DeleteDailyItemClient => ({
  rpc(name, args) {
    calls.push({ name, args });
    return Promise.resolve({ data, error });
  },
});

test("calls the atomic delete RPC with exactly its seven client arguments", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  assert.equal(
    (await deleteDailyItem(clientReturning(success(), null, calls), input)).status,
    "success",
  );
  assert.deepEqual(calls, [
    {
      name: "delete_family_item_template_for_day",
      args: {
        p_family_id: familyId,
        p_child_id: childId,
        p_session_date: input.sessionDate,
        p_item_template_id: templateId,
        p_expected_template_updated_at: input.expectedTemplateUpdatedAt,
        p_daily_item_id: dailyItemId,
        p_expected_daily_item_version: 3,
      },
    },
  ]);
});

test("validates scope, timestamp, nullable pair, positive version, and hostile input", async () => {
  for (const invalid of [
    { ...input, familyId: "bad" },
    { ...input, childId: "bad" },
    { ...input, sessionDate: "2026-02-30" },
    { ...input, itemTemplateId: "bad" },
    { ...input, expectedTemplateUpdatedAt: "today" },
    { ...input, dailyItemId: null },
    { ...input, expectedDailyItemVersion: null },
    { ...input, expectedDailyItemVersion: 0 },
    { ...input, expectedDailyItemVersion: 2_147_483_648 },
  ]) {
    assert.equal(validateDeleteDailyItemInput(invalid)?.kind, "invalid_input");
  }
  assert.equal(
    validateDeleteDailyItemInput({
      ...input,
      dailyItemId: null,
      expectedDailyItemVersion: null,
    }),
    null,
  );
  const hostile = new Proxy(input, {
    get() {
      throw new Error("hostile");
    },
  });
  const calls: Array<{ name: string; args: unknown }> = [];
  assert.equal(validateDeleteDailyItemInput(hostile)?.kind, "invalid_input");
  assert.equal(
    (await deleteDailyItem(clientReturning(null, null, calls), hostile)).status,
    "client_error",
  );
  assert.deepEqual(calls, []);
});

test("maps changed success and validates atomic template and daily deletion metadata", () => {
  const result = mapDeleteDailyItemResponse(success(), input);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.changed, true);
    assert.equal(result.template.isActive, false);
    assert.equal(result.dailyItem?.version, 4);
    assert.equal(result.dailyItem?.deletedAt, "2026-08-05T01:00:00.000Z");
  }
  for (const response of [
    success({ template: template({ is_active: true }) }),
    success({ daily_item: dailyItem({ version: 3 }) }),
    success({ daily_item: dailyItem({ deleted_at: null }) }),
    success({ daily_item: dailyItem({ updated_by_member_id: null }) }),
    success({ daily_item: dailyItem({ updated_by_user_id: null }) }),
    success({ daily_item: dailyItem({ updated_by_display_name: null }) }),
    success({ daily_item: dailyItem({ daily_item_id: templateId }) }),
  ]) {
    assert.equal(mapDeleteDailyItemResponse(response, input).status, "transport_error");
  }
});

test("accepts changed and no-op deletion when no daily session item exists", () => {
  const noDailyInput = {
    ...input,
    dailyItemId: null,
    expectedDailyItemVersion: null,
  };
  for (const changed of [true, false]) {
    const result = mapDeleteDailyItemResponse(
      success({ changed, daily_item: null }),
      noDailyInput,
    );
    assert.equal(result.status, "success");
  }
});

test("accepts idempotent deleted daily metadata with an arbitrary current version", () => {
  const result = mapDeleteDailyItemResponse(
    success({ changed: false, daily_item: dailyItem({ version: 19 }) }),
    input,
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.changed, false);
    assert.equal(result.dailyItem?.version, 19);
  }
});

test("maps conflict, forbidden, not_found, and every known invalid state", () => {
  assert.equal(
    mapDeleteDailyItemResponse(
      {
        status: "conflict",
        changed: false,
        reason: null,
        template: template({ is_active: true }),
        daily_item: null,
      },
      input,
    ).status,
    "conflict",
  );
  assert.deepEqual(
    mapDeleteDailyItemResponse(
      { status: "forbidden", changed: false, reason: null, template: null, daily_item: null },
      input,
    ),
    { status: "forbidden", changed: false },
  );
  assert.equal(
    mapDeleteDailyItemResponse(
      { status: "not_found", changed: false, reason: null, template: null, daily_item: null },
      input,
    ).status,
    "not_found",
  );
  for (const reason of [
    "invalid_input",
    "daily_item_mismatch",
    "session_completed",
    "carryover_linked",
  ] as const) {
    const result = mapDeleteDailyItemResponse(
      {
        status: "invalid_state",
        changed: false,
        reason,
        template: reason === "invalid_input" ? null : template({ is_active: true }),
        daily_item:
          reason === "carryover_linked"
            ? dailyItem({
                deleted_at: null,
                updated_by_member_id: null,
                updated_by_user_id: null,
                updated_by_display_name: null,
              })
            : null,
      },
      input,
    );
    assert.equal(result.status, "invalid_state");
    if (result.status === "invalid_state") {
      assert.equal(result.reason, reason);
    }
  }
});

test("rejects invalid-state metadata combinations the migration cannot return", () => {
  for (const response of [
    {
      status: "invalid_state",
      changed: false,
      reason: "daily_item_mismatch",
      template: null,
      daily_item: null,
    },
    {
      status: "invalid_state",
      changed: false,
      reason: "session_completed",
      template: null,
      daily_item: null,
    },
    {
      status: "invalid_state",
      changed: false,
      reason: "carryover_linked",
      template: template({ is_active: true }),
      daily_item: null,
    },
    {
      status: "invalid_state",
      changed: false,
      reason: "invalid_input",
      template: template({ is_active: true }),
      daily_item: null,
    },
  ]) {
    assert.equal(mapDeleteDailyItemResponse(response, input).status, "transport_error");
  }
});

test("rejects unknown, malformed, out-of-scope, mismatched, and hostile responses", () => {
  for (const response of [
    null,
    {},
    success({ status: "mystery" }),
    success({ status: "invalid_state", changed: false, reason: "mystery" }),
    success({ template: template({ family_id: childId }) }),
    success({ template: template({ child_id: familyId }) }),
    success({ template: template({ id: dailyItemId }) }),
    success({ daily_item: dailyItem({ child_id: familyId }) }),
    success({ daily_item: dailyItem({ session_date: "2026-08-04" }) }),
    success({ daily_item: dailyItem({ item_template_id: sessionId }) }),
    success({ daily_item: null }),
  ]) {
    assert.equal(mapDeleteDailyItemResponse(response, input).status, "transport_error");
  }
  const hostile = new Proxy(success(), {
    get() {
      throw new Error("hostile response");
    },
  });
  assert.equal(mapDeleteDailyItemResponse(hostile, input).status, "transport_error");
});

test("distinguishes rejected RPC, response errors, and hostile response envelopes", async () => {
  const rejected: DeleteDailyItemClient = {
    rpc() {
      return Promise.reject(new Error("network secret"));
    },
  };
  assert.equal((await deleteDailyItem(rejected, input)).status, "transport_error");
  assert.equal(
    (await deleteDailyItem(clientReturning(null, new Error("db secret")), input)).status,
    "transport_error",
  );
  const hostile: DeleteDailyItemClient = {
    rpc() {
      return Promise.resolve(
        new Proxy(
          { data: null, error: null },
          {
            get() {
              throw new Error("hostile envelope");
            },
          },
        ),
      );
    },
  };
  assert.equal((await deleteDailyItem(hostile, input)).status, "transport_error");
});
