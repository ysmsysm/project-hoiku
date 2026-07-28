import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSharedDailyDataForDate,
  mapLoadDailyDataResultToSharedDailyState,
} from "../src/lib/family-sharing/shared-daily-data";
import type {
  DailyDataClient,
  DailySession,
} from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";
const templateId = "55555555-5555-4555-8555-555555555555";
const sessionDate = "2026-07-29";
const input = { familyId, childId, sessionDate };

function itemPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    daily_item_id: itemId,
    session_id: sessionId,
    daily_session_id: sessionId,
    family_id: familyId,
    item_template_id: templateId,
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
    is_carryover: false,
    carryover_pending_shortage_count: null,
    carried_from_daily_item_id: null,
    carryover_processed_at: null,
    carryover_resolved_at: null,
    due_date: null,
    sort_order: 0,
    version: 4,
    updated_by_member_id: null,
    updated_by_user_id: null,
    updated_by_display_name: null,
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:05:00.000Z",
    ...overrides,
  };
}

function sessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    session_id: sessionId,
    family_id: familyId,
    child_id: childId,
    session_date: sessionDate,
    version: 2,
    is_checked: true,
    checked_by_member_id: null,
    checked_by_user_id: null,
    checked_by_display_name: "パパ",
    checked_at: "2026-07-29T00:05:00.000Z",
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
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:05:00.000Z",
    ...overrides,
  };
}

function clientReturning(
  data: unknown,
  error: unknown = null,
  calls: string[] = [],
): DailyDataClient {
  return {
    async rpc(functionName) {
      calls.push(functionName);
      return { data, error };
    },
  };
}

test("loads canonical session and derives preparation and check views", async () => {
  const calls: string[] = [];
  const state = await loadSharedDailyDataForDate(
    clientReturning(
      {
        status: "success",
        session: sessionPayload(),
        items: [itemPayload()],
      },
      null,
      calls,
    ),
    input,
  );

  assert.equal(state.status, "success");
  assert.deepEqual(calls, ["load_daily_data"]);
  if (state.status === "success") {
    assert.equal(state.sessionDate, sessionDate);
    assert.equal(state.session.sessionDate, sessionDate);
    assert.equal(state.preparationSession.date, sessionDate);
    assert.equal(state.session.dailySessionId, sessionId);
    assert.equal(state.preparationSession.date, sessionDate);
    assert.equal(state.preparationSession.items[0].dailyItemId, itemId);
    assert.equal(state.checkView.items[0].observedQuantity, 1);

    const remapped = mapLoadDailyDataResultToSharedDailyState(
      { status: "success", session: state.session },
      "2026-07-28",
    );
    assert.equal(remapped.status, "success");
    if (remapped.status === "success") {
      assert.equal(remapped.sessionDate, sessionDate);
      assert.equal(remapped.session.sessionDate, sessionDate);
      assert.equal(remapped.preparationSession.date, sessionDate);
    }
  }
});

test("keeps every business status distinct, including normal not_found", async () => {
  for (const status of [
    "not_found",
    "forbidden",
    "invalid_state",
  ] as const) {
    const state = await loadSharedDailyDataForDate(
      clientReturning({ status, session: null, items: [] }),
      input,
    );
    assert.deepEqual(state, { status, sessionDate });
  }
});

test("separates RPC errors and invalid responses", async () => {
  const rpcError = await loadSharedDailyDataForDate(
    clientReturning(null, {
      code: "PGRST000",
      message: "fetch failed",
    }),
    input,
  );
  assert.deepEqual(rpcError, {
    status: "transport_error",
    sessionDate,
    error: {
      kind: "rpc_error",
      code: "PGRST000",
      message: "fetch failed",
    },
  });

  const invalidResponse = await loadSharedDailyDataForDate(
    clientReturning({ status: "success", session: null, items: [] }),
    input,
  );
  assert.equal(invalidResponse.status, "invalid_response");
});

test("preserves invalid input without calling the RPC client", async () => {
  const calls: string[] = [];
  const state = await loadSharedDailyDataForDate(
    clientReturning(null, null, calls),
    { ...input, familyId: "not-a-uuid" },
  );

  assert.equal(state.status, "invalid_input");
  assert.deepEqual(calls, []);
  if (state.status === "invalid_input") {
    assert.equal(state.error.kind, "invalid_input");
  }
});

test("does not leak hostile client rejection or touch localStorage", async () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("localStorage must not be read");
    },
  });
  const client: DailyDataClient = {
    rpc() {
      return Promise.reject({
        get message() {
          throw new Error("hostile");
        },
      });
    },
  };

  try {
    const state = await loadSharedDailyDataForDate(client, input);
    assert.equal(state.status, "transport_error");
    if (state.status === "transport_error") {
      assert.equal(state.error.kind, "rpc_error");
    }
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test("converts unexpected view mapper failure into invalid_response", () => {
  const session = {} as DailySession;
  Object.defineProperty(session, "items", {
    get() {
      throw new Error("unexpected mapper failure");
    },
  });

  const state = mapLoadDailyDataResultToSharedDailyState(
    { status: "success", session },
    sessionDate,
  );

  assert.deepEqual(state, {
    status: "invalid_response",
    sessionDate,
    error: {
      kind: "invalid_response",
      message: "Could not derive shared daily views",
      issues: [{ path: "session", code: "view_mapping_failed" }],
    },
  });
});
