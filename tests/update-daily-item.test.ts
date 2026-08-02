import assert from "node:assert/strict";
import test from "node:test";
import {
  mapUpdateDailyItemResponse,
  updateDailyItem,
} from "../src/lib/family-sharing/update-daily-item";
import type {
  UpdateDailyItemClient,
  UpdateDailyItemInput,
} from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";

const input: UpdateDailyItemInput = {
  familyId,
  childId,
  sessionDate: "2026-08-02",
  dailySessionId: sessionId,
  dailyItemId: itemId,
  expectedVersion: 4,
  requiredQuantity: 3,
  observedQuantity: 2,
};

function itemPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    daily_item_id: itemId,
    session_id: sessionId,
    daily_session_id: sessionId,
    family_id: familyId,
    item_template_id: "55555555-5555-4555-8555-555555555555",
    kind: "regular",
    is_ad_hoc: false,
    name: "着替え",
    required_quantity: 3,
    observed_quantity: 2,
    shortage_count: 1,
    quantity: 3,
    unit: "枚",
    rough_state: null,
    is_checked: true,
    is_prepared: false,
    is_deferred: false,
    is_carryover: false,
    carryover_pending_shortage_count: null,
    carried_from_daily_item_id: null,
    carryover_processed_at: null,
    carryover_resolved_at: null,
    due_date: null,
    sort_order: 0,
    version: 5,
    updated_by_member_id: null,
    updated_by_user_id: null,
    updated_by_display_name: "ママ",
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:10:00.000Z",
    ...overrides,
  };
}

function preparedSessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    session_id: sessionId,
    family_id: familyId,
    child_id: childId,
    session_date: "2026-08-02",
    version: 3,
    is_checked: true,
    checked_by_member_id: null,
    checked_by_user_id: null,
    checked_by_display_name: "ママ",
    checked_at: "2026-08-02T00:05:00.000Z",
    is_prepared: true,
    prepared_by_member_id: null,
    prepared_by_user_id: null,
    prepared_by_display_name: "パパ",
    prepared_at: "2026-08-02T00:15:00.000Z",
    thanks_sent_at: null,
    thanks_sent_by_member_id: null,
    thanks_sent_by_user_id: null,
    thanks_sent_by_display_name: null,
    thanks_received_by_member_id: null,
    thanks_received_by_user_id: null,
    thanks_received_by_display_name: null,
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:15:00.000Z",
    ...overrides,
  };
}

function clientReturning(
  data: unknown,
  error: unknown = null,
  calls: unknown[] = [],
): UpdateDailyItemClient {
  return {
    async rpc(functionName, args) {
      calls.push({ functionName, args });
      return { data, error };
    },
  };
}

test("calls update_daily_item with the exact observed quantity contract", async () => {
  const calls: unknown[] = [];
  const result = await updateDailyItem(
    clientReturning(
      { status: "success", item: itemPayload(), session: null },
      null,
      calls,
    ),
    input,
  );

  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    {
      functionName: "update_daily_item",
      args: {
        p_family_id: familyId,
        p_child_id: childId,
        p_session_date: "2026-08-02",
        p_daily_item_id: itemId,
        p_expected_version: 4,
        p_action: "set_observed_quantity",
        p_value: { observed_quantity: 2 },
      },
    },
  ]);
  if (result.status === "success") {
    assert.equal(result.item.version, 5);
    assert.equal(result.item.observedQuantity, 2);
    assert.equal(result.item.shortageCount, 1);
    assert.equal("changed" in result.item, false);
  }
});

test("rejects invalid input without calling the RPC", async () => {
  const invalidInputs: UpdateDailyItemInput[] = [
    { ...input, familyId: "invalid" },
    { ...input, childId: "invalid" },
    { ...input, sessionDate: "2026-02-30" },
    { ...input, dailySessionId: "invalid" },
    { ...input, dailyItemId: "invalid" },
    { ...input, expectedVersion: 0 },
    { ...input, expectedVersion: NaN },
    { ...input, expectedVersion: Infinity },
    { ...input, expectedVersion: 1.5 },
    { ...input, expectedVersion: 2_147_483_648 },
    { ...input, observedQuantity: NaN },
    { ...input, observedQuantity: Infinity },
    { ...input, observedQuantity: 1.5 },
    { ...input, observedQuantity: -1 },
    { ...input, observedQuantity: 4 },
    { ...input, requiredQuantity: 2_147_483_648 },
  ];

  for (const value of [null, "2"]) {
    const malformedVersion = { ...input };
    Object.defineProperty(malformedVersion, "expectedVersion", { value });
    invalidInputs.push(malformedVersion);
    const malformedQuantity = { ...input };
    Object.defineProperty(malformedQuantity, "observedQuantity", { value });
    invalidInputs.push(malformedQuantity);
  }

  for (const invalidInput of invalidInputs) {
    const calls: unknown[] = [];
    const result = await updateDailyItem(
      clientReturning(null, null, calls),
      invalidInput,
    );
    assert.equal(result.status, "client_error");
    assert.equal(calls.length, 0);
  }
});

test("normalizes RPC rejection and response errors", async () => {
  const rejectingClient: UpdateDailyItemClient = {
    rpc() {
      return Promise.reject(new Error("network unavailable"));
    },
  };
  const rejected = await updateDailyItem(rejectingClient, input);
  assert.equal(rejected.status, "transport_error");

  const responseError = await updateDailyItem(
    clientReturning(null, { code: "PGRST000", message: "fetch failed" }),
    input,
  );
  assert.equal(responseError.status, "transport_error");
  if (responseError.status === "transport_error") {
    assert.equal(responseError.error.kind, "rpc_error");
  }
});

test("maps conflict item without applying or retrying it", async () => {
  const calls: unknown[] = [];
  const result = await updateDailyItem(
    clientReturning(
      {
        status: "conflict",
        item: itemPayload({ version: 7, observed_quantity: 1, shortage_count: 2 }),
        session: null,
      },
      null,
      calls,
    ),
    input,
  );

  assert.equal(result.status, "conflict");
  assert.equal(calls.length, 1);
  if (result.status === "conflict") {
    assert.equal(result.item.version, 7);
    assert.equal(result.item.observedQuantity, 1);
  }
});

test("keeps every business status distinct and exposes only session_prepared", async () => {
  for (const status of ["forbidden", "not_found"] as const) {
    const result = await updateDailyItem(
      clientReturning({ status, item: null, session: null }),
      input,
    );
    assert.deepEqual(result, { status });
  }

  const prepared = await updateDailyItem(
    clientReturning({
      status: "invalid_state",
      reason: "session_prepared",
      item: null,
      session: preparedSessionPayload(),
    }),
    input,
  );
  assert.deepEqual(prepared, {
    status: "invalid_state",
    reason: "session_prepared",
  });

  const unknownReason = await updateDailyItem(
    clientReturning({
      status: "invalid_state",
      reason: "internal_detail",
      item: null,
      session: null,
    }),
    input,
  );
  assert.deepEqual(unknownReason, { status: "invalid_state" });

  for (const session of [
    {},
    preparedSessionPayload({ child_id: familyId }),
    preparedSessionPayload({ is_prepared: false, prepared_at: null }),
  ]) {
    const invalidPrepared = await updateDailyItem(
      clientReturning({
        status: "invalid_state",
        reason: "session_prepared",
        item: null,
        session,
      }),
      input,
    );
    assert.equal(invalidPrepared.status, "transport_error");
  }
});

test("rejects invalid and hostile response envelopes without throwing", async () => {
  const invalidValues: unknown[] = [
    null,
    [],
    {},
    { status: "success", item: null, session: null },
    { status: "forbidden", item: {}, session: null },
  ];
  for (const value of invalidValues) {
    const result = await updateDailyItem(clientReturning(value), input);
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "invalid_response");
    }
  }

  const hostile = {};
  Object.defineProperty(hostile, "status", {
    get() {
      throw new Error("hostile getter");
    },
  });
  const mapped = mapUpdateDailyItemResponse(hostile, input);
  assert.equal(mapped.status, "transport_error");

  const hostileResponse = { data: null, error: null };
  Object.defineProperty(hostileResponse, "error", {
    get() {
      throw new Error("hostile response error getter");
    },
  });
  const hostileClient: UpdateDailyItemClient = {
    rpc() {
      return Promise.resolve(hostileResponse);
    },
  };
  const hostileResult = await updateDailyItem(hostileClient, input);
  assert.equal(hostileResult.status, "transport_error");
});

test("rejects success and conflict items outside the requested scope", async () => {
  const successMismatches = [
    { daily_item_id: "66666666-6666-4666-8666-666666666666", id: "66666666-6666-4666-8666-666666666666" },
    { family_id: "66666666-6666-4666-8666-666666666666" },
    { session_id: "66666666-6666-4666-8666-666666666666", daily_session_id: "66666666-6666-4666-8666-666666666666" },
    { kind: "spot" },
    { required_quantity: 4 },
    { version: 6 },
    { observed_quantity: 1 },
    { shortage_count: 2 },
  ];
  for (const overrides of successMismatches) {
    const result = await updateDailyItem(
      clientReturning({
        status: "success",
        item: itemPayload(overrides),
        session: null,
      }),
      input,
    );
    assert.equal(result.status, "transport_error");
  }

  for (const overrides of [
    {
      id: "66666666-6666-4666-8666-666666666666",
      daily_item_id: "66666666-6666-4666-8666-666666666666",
      version: 7,
    },
    {
      family_id: "66666666-6666-4666-8666-666666666666",
      version: 7,
    },
    {
      session_id: "66666666-6666-4666-8666-666666666666",
      daily_session_id: "66666666-6666-4666-8666-666666666666",
      version: 7,
    },
    { required_quantity: 4, version: 7 },
    { version: input.expectedVersion },
  ]) {
    const conflictMismatch = await updateDailyItem(
      clientReturning({
        status: "conflict",
        item: itemPayload(overrides),
        session: null,
      }),
      input,
    );
    assert.equal(conflictMismatch.status, "transport_error");
  }
});
