import assert from "node:assert/strict";
import test from "node:test";
import {
  loadDailyData,
  mapLoadDailyDataResponse,
} from "../src/lib/family-sharing/daily-data";
import type { DailyDataClient } from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";

function itemPayload(
  id = itemId,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    daily_item_id: id,
    session_id: sessionId,
    daily_session_id: sessionId,
    family_id: familyId,
    item_template_id: "55555555-5555-4555-8555-555555555555",
    kind: "regular",
    is_ad_hoc: false,
    name: "着替え",
    required_quantity: 2,
    observed_quantity: 0,
    shortage_count: 2,
    quantity: 2,
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
    version: 1,
    updated_by_member_id: null,
    updated_by_user_id: null,
    updated_by_display_name: null,
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function sessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    session_id: sessionId,
    family_id: familyId,
    child_id: childId,
    session_date: "2026-07-28",
    version: 3,
    is_checked: true,
    checked_by_member_id: "66666666-6666-4666-8666-666666666666",
    checked_by_user_id: "77777777-7777-4777-8777-777777777777",
    checked_by_display_name: "パパ",
    checked_at: "2026-07-28T00:05:00.000Z",
    is_prepared: false,
    prepared_by_member_id: null,
    prepared_by_user_id: null,
    prepared_by_display_name: null,
    prepared_at: null,
    thanks_sent_at: null,
    thanks_sent_by_member_id: null,
    thanks_sent_by_user_id: null,
    thanks_sent_by_display_name: null,
    thanks_received_by_member_id: null,
    thanks_received_by_user_id: null,
    thanks_received_by_display_name: null,
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:05:00.000Z",
    ...overrides,
  };
}

function successPayload(items = [itemPayload()]) {
  return {
    status: "success",
    session: sessionPayload(),
    items,
  };
}

function clientReturning(
  data: unknown,
  error: unknown = null,
  calls: unknown[] = [],
): DailyDataClient {
  return {
    async rpc(functionName, args) {
      calls.push({ functionName, args });
      return { data, error };
    },
  };
}

function clientRejecting(reason: unknown): DailyDataClient {
  return {
    rpc() {
      return Promise.reject(reason);
    },
  };
}

test("loads and maps one daily session with multiple items", async () => {
  const secondId = "88888888-8888-4888-8888-888888888888";
  const result = await loadDailyData(
    clientReturning(
      successPayload([
        itemPayload(),
        itemPayload(secondId, { name: "連絡帳", sort_order: 1 }),
      ]),
    ),
    { familyId, childId, sessionDate: "2026-07-28" },
  );

  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.session.dailySessionId, sessionId);
    assert.equal(result.session.items.length, 2);
    assert.deepEqual(
      result.session.items.map((item) => item.dailyItemId),
      [itemId, secondId],
    );
    assert.equal(result.session.checkedAt, "2026-07-28T00:05:00.000Z");
    assert.equal(result.session.completedAt, null);
    assert.equal(result.session.thanksSent, false);
  }
});

test("calls load_daily_data with the exact snake_case RPC arguments", async () => {
  const calls: unknown[] = [];
  await loadDailyData(clientReturning(successPayload(), null, calls), {
    familyId,
    childId,
    sessionDate: "2026-07-28",
  });

  assert.deepEqual(calls, [
    {
      functionName: "load_daily_data",
      args: {
        p_family_id: familyId,
        p_child_id: childId,
        p_session_date: "2026-07-28",
      },
    },
  ]);
});

test("returns every load_daily_data business status without treating it as transport failure", async () => {
  for (const status of ["forbidden", "not_found", "invalid_state"] as const) {
    const result = await loadDailyData(
      clientReturning({ status, session: null, items: [] }),
      { familyId, childId, sessionDate: "2026-07-28" },
    );
    assert.deepEqual(result, { status });
  }
});

test("separates Supabase RPC errors from business statuses", async () => {
  const result = await loadDailyData(
    clientReturning(null, { code: "PGRST000", message: "fetch failed" }),
    { familyId, childId, sessionDate: "2026-07-28" },
  );

  assert.deepEqual(result, {
    status: "transport_error",
    error: {
      kind: "rpc_error",
      code: "PGRST000",
      message: "fetch failed",
    },
  });
});

test("converts rejected load RPC promises into transport errors", async () => {
  const hostileMessage = Object.defineProperty({}, "message", {
    get() {
      throw new Error("message getter failed");
    },
  });
  const hostileToString = {
    toString() {
      throw new Error("toString failed");
    },
  };
  const hostileArray: unknown[] = [];
  hostileArray.toString = () => {
    throw new Error("array toString failed");
  };
  const hostileFunction = () => undefined;
  hostileFunction.toString = () => {
    throw new Error("function toString failed");
  };
  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error("proxy property access failed");
      },
    },
  );
  const reasons = [
    hostileMessage,
    hostileToString,
    hostileArray,
    hostileFunction,
    hostileProxy,
    null,
    undefined,
    Symbol("rejected"),
    42,
    true,
    new Error("offline"),
    "request rejected",
  ];

  for (const reason of reasons) {
    const result = await loadDailyData(clientRejecting(reason), {
      familyId,
      childId,
      sessionDate: "2026-07-28",
    });
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "rpc_error");
      assert.equal(result.error.message.length > 0, true);
    }
  }
});

test("rejects a successful load response outside the requested scope", async () => {
  const otherId = "99999999-9999-4999-8999-999999999999";
  const payloads = [
    {
      ...successPayload(),
      session: sessionPayload({ family_id: otherId }),
    },
    {
      ...successPayload(),
      session: sessionPayload({ child_id: otherId }),
    },
    {
      ...successPayload(),
      session: sessionPayload({ session_date: "2026-07-27" }),
    },
    successPayload([itemPayload(itemId, { family_id: otherId })]),
    successPayload([
      itemPayload(itemId, {
        session_id: otherId,
        daily_session_id: otherId,
      }),
    ]),
  ];

  for (const payload of payloads) {
    const result = await loadDailyData(clientReturning(payload), {
      familyId,
      childId,
      sessionDate: "2026-07-28",
    });
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "invalid_response");
    }
  }
});

test("rejects invalid scope input before calling Supabase", async () => {
  const calls: unknown[] = [];
  const result = await loadDailyData(
    clientReturning(successPayload(), null, calls),
    { familyId: "bad", childId, sessionDate: "2026-02-30" },
  );

  assert.equal(result.status, "client_error");
  assert.equal(calls.length, 0);
});

test("rejects unexpected statuses and malformed success responses", () => {
  assert.equal(
    mapLoadDailyDataResponse({
      status: "conflict",
      session: null,
      items: [],
    }).status,
    "transport_error",
  );
  assert.equal(
    mapLoadDailyDataResponse({
      status: "success",
      session: sessionPayload(),
      items: {},
    }).status,
    "transport_error",
  );
  assert.equal(
    mapLoadDailyDataResponse({
      status: "success",
      session: null,
      items: [],
    }).status,
    "transport_error",
  );
  assert.equal(
    mapLoadDailyDataResponse({
      status: "not_found",
      session: sessionPayload(),
      items: [],
    }).status,
    "transport_error",
  );
  assert.equal(
    mapLoadDailyDataResponse({
      status: "not_found",
      session: null,
      items: [itemPayload()],
    }).status,
    "transport_error",
  );
});

test("uses the shared daily item mapper for load response items", () => {
  const result = mapLoadDailyDataResponse(
    successPayload([itemPayload(itemId, { version: 0 })]),
  );

  assert.equal(result.status, "transport_error");
  if (result.status === "transport_error") {
    assert.equal(result.error.kind, "invalid_response");
    if (result.error.kind === "invalid_response") {
      assert.equal(
        result.error.issues.some(
          (issue) =>
            issue.path === "items[0].version" &&
            issue.code === "invalid_positive_integer",
        ),
        true,
      );
    }
  }
});
