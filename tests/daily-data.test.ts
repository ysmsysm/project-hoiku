import assert from "node:assert/strict";
import test from "node:test";
import {
  mapDailyItemPayload,
  mapDailyItemsPayload,
  mapUpdatedDailyItemPayload,
} from "../src/lib/family-sharing/daily-data";

const dailyItemId = "11111111-1111-4111-8111-111111111111";
const dailySessionId = "22222222-2222-4222-8222-222222222222";
const familyId = "33333333-3333-4333-8333-333333333333";
const itemTemplateId = "44444444-4444-4444-8444-444444444444";
const memberId = "55555555-5555-4555-8555-555555555555";
const userId = "66666666-6666-4666-8666-666666666666";

function dailyItemPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: dailyItemId,
    daily_item_id: dailyItemId,
    session_id: dailySessionId,
    daily_session_id: dailySessionId,
    family_id: familyId,
    item_template_id: itemTemplateId,
    kind: "regular",
    is_ad_hoc: false,
    name: "着替え",
    required_quantity: 3,
    observed_quantity: 1,
    shortage_count: 2,
    quantity: 3,
    unit: "枚",
    rough_state: null,
    is_checked: true,
    is_prepared: false,
    is_deferred: false,
    is_carryover: true,
    carryover_pending_shortage_count: 1,
    carried_from_daily_item_id: "77777777-7777-4777-8777-777777777777",
    carryover_processed_at: "2026-07-28T00:01:02.000Z",
    carryover_resolved_at: null,
    due_date: "2026-07-29",
    sort_order: 2,
    version: 4,
    updated_by_member_id: memberId,
    updated_by_user_id: userId,
    updated_by_display_name: "ママ",
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:01:02.000Z",
    ...overrides,
  };
}

function assertInvalidItem(
  overrides: Record<string, unknown>,
  expectedCode: string,
) {
  const result = mapDailyItemPayload(dailyItemPayload(overrides));
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(
      result.error.issues.some((issue) => issue.code === expectedCode),
      true,
    );
  }
}

test("maps a complete daily item payload from snake_case to camelCase", () => {
  const result = mapDailyItemPayload(dailyItemPayload());

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      dailyItemId,
      dailySessionId,
      familyId,
      itemTemplateId,
      kind: "regular",
      isAdHoc: false,
      name: "着替え",
      requiredQuantity: 3,
      observedQuantity: 1,
      shortageCount: 2,
      quantity: 3,
      unit: "枚",
      roughState: null,
      isChecked: true,
      isPrepared: false,
      isDeferred: false,
      isCarryover: true,
      carryoverPendingShortageCount: 1,
      carriedFromDailyItemId: "77777777-7777-4777-8777-777777777777",
      carryoverProcessedAt: "2026-07-28T00:01:02.000Z",
      carryoverResolvedAt: null,
      dueDate: "2026-07-29",
      sortOrder: 2,
      version: 4,
      deletedAt: null,
      updatedByMemberId: memberId,
      updatedByUserId: userId,
      updatedByDisplayName: "ママ",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:01:02.000Z",
    });
  }
});

test("accepts nullable daily item fields from an active ad-hoc spot item", () => {
  const result = mapDailyItemPayload(
    dailyItemPayload({
      item_template_id: null,
      kind: "spot",
      is_ad_hoc: true,
      observed_quantity: null,
      shortage_count: null,
      unit: null,
      carryover_pending_shortage_count: null,
      carried_from_daily_item_id: null,
      carryover_processed_at: null,
      due_date: null,
      updated_by_member_id: null,
      updated_by_user_id: null,
      updated_by_display_name: null,
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.itemTemplateId, null);
    assert.equal(result.data.observedQuantity, null);
    assert.equal(result.data.updatedByMemberId, null);
    assert.equal(result.data.deletedAt, null);
  }
});

test("rejects invalid UUIDs and mismatched duplicate ID fields", () => {
  assertInvalidItem({ daily_item_id: "not-a-uuid" }, "invalid_uuid");
  assertInvalidItem(
    { daily_item_id: "88888888-8888-4888-8888-888888888888" },
    "daily_item_id_mismatch",
  );
  assertInvalidItem(
    { daily_session_id: "99999999-9999-4999-8999-999999999999" },
    "daily_session_id_mismatch",
  );
});

test("rejects invalid versions and quantity values", () => {
  assertInvalidItem({ version: 0 }, "invalid_positive_integer");
  assertInvalidItem(
    { required_quantity: -1 },
    "invalid_non_negative_integer",
  );
  assertInvalidItem({ observed_quantity: 1.5 }, "invalid_non_negative_integer");
  assertInvalidItem({ shortage_count: -1 }, "invalid_non_negative_integer");
  assertInvalidItem(
    { carryover_pending_shortage_count: -1 },
    "invalid_non_negative_integer",
  );
});

test("uses PostgreSQL integer bounds and allows negative sort order", () => {
  for (const sortOrder of [-2_147_483_648, -1, 2_147_483_647]) {
    const result = mapDailyItemPayload(
      dailyItemPayload({ sort_order: sortOrder }),
    );
    assert.equal(result.ok, true);
  }
  assertInvalidItem({ sort_order: -2_147_483_649 }, "invalid_postgres_integer");
  assertInvalidItem({ sort_order: 2_147_483_648 }, "invalid_postgres_integer");

  assert.equal(
    mapDailyItemPayload(
      dailyItemPayload({
        version: 2_147_483_647,
        required_quantity: 2_147_483_647,
        observed_quantity: 2_147_483_647,
        shortage_count: 2_147_483_647,
        quantity: 2_147_483_647,
        carryover_pending_shortage_count: 2_147_483_647,
      }),
    ).ok,
    true,
  );
  assertInvalidItem({ version: 2_147_483_648 }, "invalid_positive_integer");
  assertInvalidItem(
    { required_quantity: 2_147_483_648 },
    "invalid_non_negative_integer",
  );
});

test("rejects invalid booleans and item kinds", () => {
  assertInvalidItem({ is_prepared: "true" }, "invalid_boolean");
  assertInvalidItem({ kind: "other" }, "invalid_daily_item_kind");
});

test("rejects missing required fields", () => {
  const payload = dailyItemPayload();
  delete payload.name;
  const result = mapDailyItemPayload(payload);

  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(
      result.error.issues.some(
        (issue) => issue.path === "item.name" && issue.code === "invalid_string",
      ),
      true,
    );
  }
});

test("rejects invalid dates and datetimes", () => {
  assertInvalidItem({ due_date: "2026-02-30" }, "invalid_iso_date");
  assertInvalidItem({ updated_at: "yesterday" }, "invalid_iso_datetime");
  assertInvalidItem(
    { updated_at: "2026-02-31T00:00:00Z" },
    "invalid_iso_datetime",
  );
  assertInvalidItem(
    { carryover_processed_at: "2026-07-28 00:00:00" },
    "invalid_iso_datetime",
  );
});

test("accepts leap-day, fractional, and offset datetimes", () => {
  for (const updatedAt of [
    "2024-02-29T23:59:59Z",
    "2026-07-28T00:01:02.123456Z",
    "2026-07-28T09:01:02+09:00",
  ]) {
    assert.equal(
      mapDailyItemPayload(dailyItemPayload({ updated_at: updatedAt })).ok,
      true,
    );
  }
});

test("rejects a non-array items payload and reports nested invalid items", () => {
  assert.equal(mapDailyItemsPayload({}).ok, false);

  const result = mapDailyItemsPayload([
    dailyItemPayload(),
    dailyItemPayload({ daily_item_id: "bad" }),
  ]);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.error.issues[0].path.startsWith("items[1]"), true);
  }
});

test("maps the changed flag only for batch update result items", () => {
  const changed = mapUpdatedDailyItemPayload(
    dailyItemPayload({ changed: true }),
  );
  assert.equal(changed.ok, true);
  if (changed.ok) {
    assert.equal(changed.data.changed, true);
    assert.equal(changed.data.dailyItemId, dailyItemId);
  }

  const missing = mapUpdatedDailyItemPayload(dailyItemPayload());
  assert.equal(missing.ok, false);
  if (missing.ok === false) {
    assert.deepEqual(missing.error.issues, [
      { path: "item.changed", code: "invalid_boolean" },
    ]);
  }
});
