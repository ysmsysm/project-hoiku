import assert from "node:assert/strict";
import test from "node:test";
import {
  mapUpdateDailyPreparationItemsResponse,
  updateDailyPreparationItems,
} from "../src/lib/family-sharing/update-daily-preparation-items";
import type {
  DailyDataClient,
  DailyPreparationItemUpdate,
} from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const firstItemId = "44444444-4444-4444-8444-444444444444";
const secondItemId = "55555555-5555-4555-8555-555555555555";
const memberId = "66666666-6666-4666-8666-666666666666";
const userId = "77777777-7777-4777-8777-777777777777";

function updatedItemPayload(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    daily_item_id: id,
    session_id: sessionId,
    daily_session_id: sessionId,
    family_id: familyId,
    item_template_id: "88888888-8888-4888-8888-888888888888",
    kind: "spot",
    is_ad_hoc: false,
    name: "連絡帳",
    required_quantity: 1,
    observed_quantity: null,
    shortage_count: null,
    quantity: 1,
    unit: "個",
    rough_state: null,
    is_checked: true,
    is_prepared: true,
    is_deferred: false,
    is_carryover: false,
    carryover_pending_shortage_count: null,
    carried_from_daily_item_id: null,
    carryover_processed_at: null,
    carryover_resolved_at: null,
    due_date: null,
    sort_order: 0,
    version: 2,
    updated_by_member_id: memberId,
    updated_by_user_id: userId,
    updated_by_display_name: "ママ",
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:10:00.000Z",
    changed: true,
    ...overrides,
  };
}

function conflictPayload(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    daily_item_id: id,
    expected_version: 1,
    current_version: 2,
    is_prepared: true,
    is_deferred: false,
    updated_by_member_id: memberId,
    updated_by_user_id: userId,
    updated_by_display_name: "ママ",
    updated_at: "2026-07-28T00:10:00.000Z",
    ...overrides,
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

const input = (updates: DailyPreparationItemUpdate[]) => ({
  familyId,
  childId,
  sessionDate: "2026-07-28",
  updates,
});

test("maps changed and no-op items from a successful batch response", async () => {
  const response = {
    status: "success",
    requested_count: 2,
    changed_count: 1,
    unchanged_count: 1,
    items: [
      updatedItemPayload(firstItemId),
      updatedItemPayload(secondItemId, {
        changed: false,
        version: 7,
        is_prepared: false,
        updated_by_member_id: null,
        updated_by_user_id: null,
        updated_by_display_name: null,
      }),
    ],
    conflicts: [],
    session: null,
  };
  const result = await updateDailyPreparationItems(
    clientReturning(response),
    input([
      { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
      { dailyItemId: secondItemId, expectedVersion: 7, isPrepared: false },
    ]),
  );

  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.requestedCount, 2);
    assert.equal(result.changedCount, 1);
    assert.equal(result.unchangedCount, 1);
    assert.equal(result.items[0].changed, true);
    assert.equal(result.items[0].updatedByMemberId, memberId);
    assert.equal(result.items[1].changed, false);
    assert.equal(result.items[1].version, 7);
  }
});

test("converts batch input to the exact snake_case RPC arguments", async () => {
  const calls: unknown[] = [];
  await updateDailyPreparationItems(
    clientReturning(
      {
        status: "success",
        requested_count: 1,
        changed_count: 1,
        unchanged_count: 0,
        items: [updatedItemPayload(firstItemId)],
        conflicts: [],
        session: null,
      },
      null,
      calls,
    ),
    input([
      { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
    ]),
  );

  assert.deepEqual(calls, [
    {
      functionName: "update_daily_preparation_items",
      args: {
        p_family_id: familyId,
        p_child_id: childId,
        p_session_date: "2026-07-28",
        p_updates: [
          {
            daily_item_id: firstItemId,
            expected_version: 1,
            is_prepared: true,
          },
        ],
      },
    },
  ]);
});

test("maps one or multiple conflicts without treating them as transport errors", () => {
  const result = mapUpdateDailyPreparationItemsResponse({
    status: "conflict",
    requested_count: 2,
    changed_count: 0,
    unchanged_count: 2,
    items: [],
    conflicts: [
      conflictPayload(firstItemId),
      conflictPayload(secondItemId, {
        expected_version: 3,
        current_version: 5,
        is_prepared: false,
        is_deferred: true,
      }),
    ],
    session: null,
  });

  assert.equal(result.status, "conflict");
  if (result.status === "conflict") {
    assert.deepEqual(result.conflicts[0], {
      dailyItemId: firstItemId,
      expectedVersion: 1,
      currentVersion: 2,
      isPrepared: true,
      isDeferred: false,
      updatedByMemberId: memberId,
      updatedByUserId: userId,
      updatedByDisplayName: "ママ",
      updatedAt: "2026-07-28T00:10:00.000Z",
    });
    assert.equal(result.conflicts[1].currentVersion, 5);
    assert.equal(result.conflicts[1].isDeferred, true);
  }
});

test("maps actual batch business error statuses and optional reasons", () => {
  const cases = [
    { status: "forbidden", reason: undefined },
    { status: "not_found", reason: "session_not_found" },
    { status: "invalid_state", reason: "session_prepared" },
  ] as const;

  cases.forEach(({ status, reason }) => {
    const result = mapUpdateDailyPreparationItemsResponse({
      status,
      ...(reason ? { reason } : {}),
      requested_count: 1,
      changed_count: 0,
      unchanged_count: 1,
      items: [],
      conflicts: [],
      session: null,
    });
    assert.equal(result.status, status);
    if (
      result.status === "forbidden" ||
      result.status === "not_found" ||
      result.status === "invalid_state"
    ) {
      assert.equal(result.reason, reason);
    }
  });
});

test("separates Supabase RPC errors from business errors", async () => {
  const result = await updateDailyPreparationItems(
    clientReturning(null, { code: "PGRST000", message: "network failed" }),
    input([
      { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
    ]),
  );

  assert.deepEqual(result, {
    status: "transport_error",
    error: {
      kind: "rpc_error",
      code: "PGRST000",
      message: "network failed",
    },
  });
});

test("converts rejected batch RPC promises into transport errors", async () => {
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
  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error("proxy property access failed");
      },
    },
  );

  for (const reason of [
    hostileMessage,
    hostileToString,
    hostileProxy,
    new Error("offline"),
    "request rejected",
  ]) {
    const result = await updateDailyPreparationItems(
      clientRejecting(reason),
      input([
        {
          dailyItemId: firstItemId,
          expectedVersion: 1,
          isPrepared: true,
        },
      ]),
    );
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "rpc_error");
      assert.equal(result.error.message.length > 0, true);
    }
  }
});

test("requires the success item IDs to exactly match the request", async () => {
  const otherItemId = "99999999-9999-4999-8999-999999999999";
  const cases = [
    {
      updates: [
        { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
      ],
      items: [updatedItemPayload(otherItemId)],
    },
    {
      updates: [
        { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
        { dailyItemId: secondItemId, expectedVersion: 1, isPrepared: true },
      ],
      items: [
        updatedItemPayload(firstItemId),
        updatedItemPayload(firstItemId),
      ],
    },
    {
      updates: [
        { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
        { dailyItemId: secondItemId, expectedVersion: 1, isPrepared: true },
      ],
      items: [updatedItemPayload(firstItemId)],
    },
  ];

  for (const testCase of cases) {
    const result = await updateDailyPreparationItems(
      clientReturning({
        status: "success",
        requested_count: testCase.updates.length,
        changed_count: testCase.items.length,
        unchanged_count: testCase.updates.length - testCase.items.length,
        items: testCase.items,
        conflicts: [],
        session: null,
      }),
      input(testCase.updates),
    );
    assert.equal(result.status, "transport_error");
  }
});

test("requires each success item to belong to the requested family", async () => {
  const result = await updateDailyPreparationItems(
    clientReturning({
      status: "success",
      requested_count: 1,
      changed_count: 1,
      unchanged_count: 0,
      items: [
        updatedItemPayload(firstItemId, {
          family_id: "99999999-9999-4999-8999-999999999999",
        }),
      ],
      conflicts: [],
      session: null,
    }),
    input([
      { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
    ]),
  );
  assert.equal(result.status, "transport_error");
});

test("compares UUID request scope with PostgreSQL case semantics", async () => {
  const result = await updateDailyPreparationItems(
    clientReturning({
      status: "success",
      requested_count: 1,
      changed_count: 1,
      unchanged_count: 0,
      items: [updatedItemPayload(firstItemId)],
      conflicts: [],
      session: null,
    }),
    {
      familyId: familyId.toUpperCase(),
      childId,
      sessionDate: "2026-07-28",
      updates: [
        {
          dailyItemId: firstItemId.toUpperCase(),
          expectedVersion: 1,
          isPrepared: true,
        },
      ],
    },
  );
  assert.equal(result.status, "success");
});

test("validates conflict IDs and expected versions against the request", async () => {
  const otherItemId = "99999999-9999-4999-8999-999999999999";
  const updates = [
    { dailyItemId: firstItemId, expectedVersion: 1, isPrepared: true },
    { dailyItemId: secondItemId, expectedVersion: 3, isPrepared: false },
  ];
  const cases = [
    [conflictPayload(otherItemId)],
    [conflictPayload(firstItemId), conflictPayload(firstItemId)],
    [conflictPayload(secondItemId, { expected_version: 2 })],
  ];
  for (const conflicts of cases) {
    const result = await updateDailyPreparationItems(
      clientReturning({
        status: "conflict",
        requested_count: 2,
        changed_count: 0,
        unchanged_count: 2,
        items: [],
        conflicts,
        session: null,
      }),
      input(updates),
    );
    assert.equal(result.status, "transport_error");
  }

  const subset = await updateDailyPreparationItems(
    clientReturning({
      status: "conflict",
      requested_count: 2,
      changed_count: 0,
      unchanged_count: 2,
      items: [],
      conflicts: [conflictPayload(secondItemId, { expected_version: 3 })],
      session: null,
    }),
    input(updates),
  );
  assert.equal(subset.status, "conflict");
});

test("rejects malformed and unexpected batch responses", () => {
  const invalidResponses = [
    null,
    { status: "other" },
    {
      status: "success",
      requested_count: 1,
      changed_count: 1,
      unchanged_count: 1,
      items: [],
      conflicts: [],
      session: null,
    },
    {
      status: "success",
      requested_count: 1,
      changed_count: 1,
      unchanged_count: 0,
      items: [updatedItemPayload(firstItemId, { changed: "yes" })],
      conflicts: [],
      session: null,
    },
    {
      status: "conflict",
      requested_count: 1,
      changed_count: 0,
      unchanged_count: 1,
      items: [],
      conflicts: [
        conflictPayload(firstItemId, {
          updated_at: "2026-02-31T00:00:00Z",
        }),
      ],
      session: null,
    },
    {
      status: "not_found",
      requested_count: 1,
      changed_count: 1,
      unchanged_count: 0,
      items: [],
      conflicts: [],
      session: null,
    },
    {
      status: "success",
      requested_count: 2_147_483_648,
      changed_count: 2_147_483_648,
      unchanged_count: 0,
      items: [],
      conflicts: [],
      session: null,
    },
  ];

  invalidResponses.forEach((response) => {
    assert.equal(
      mapUpdateDailyPreparationItemsResponse(response).status,
      "transport_error",
    );
  });
});

test("rejects more than 100 updates before calling Supabase", async () => {
  const calls: unknown[] = [];
  const updates = Array.from({ length: 101 }, (_, index) => ({
    dailyItemId: `aaaaaaaa-aaaa-4aaa-8aaa-${index
      .toString(16)
      .padStart(12, "0")}`,
    expectedVersion: 1,
    isPrepared: true,
  }));
  const result = await updateDailyPreparationItems(
    clientReturning(null, null, calls),
    input(updates),
  );

  assert.equal(result.status, "client_error");
  assert.equal(calls.length, 0);
  if (result.status === "client_error") {
    assert.equal(
      result.error.issues.some((issue) => issue.code === "too_many_updates"),
      true,
    );
  }
});

test("rejects invalid update fields and duplicate daily item IDs", async () => {
  const calls: unknown[] = [];
  const result = await updateDailyPreparationItems(
    clientReturning(null, null, calls),
    input([
      {
        dailyItemId: "bad",
        expectedVersion: 0,
        isPrepared: "true" as unknown as boolean,
      },
      {
        dailyItemId: firstItemId,
        expectedVersion: 1,
        isPrepared: true,
      },
      {
        dailyItemId: firstItemId.toUpperCase(),
        expectedVersion: 2,
        isPrepared: false,
      },
    ]),
  );

  assert.equal(result.status, "client_error");
  assert.equal(calls.length, 0);
  if (result.status === "client_error") {
    assert.deepEqual(
      new Set(result.error.issues.map((issue) => issue.code)),
      new Set([
        "invalid_uuid",
        "invalid_positive_integer",
        "invalid_boolean",
        "duplicate_daily_item_id",
      ]),
    );
  }
});

test("accepts the maximum expected version and rejects integer overflow", async () => {
  const accepted = await updateDailyPreparationItems(
    clientReturning({
      status: "success",
      requested_count: 1,
      changed_count: 0,
      unchanged_count: 1,
      items: [
        updatedItemPayload(firstItemId, {
          changed: false,
          version: 2_147_483_647,
        }),
      ],
      conflicts: [],
      session: null,
    }),
    input([
      {
        dailyItemId: firstItemId,
        expectedVersion: 2_147_483_647,
        isPrepared: true,
      },
    ]),
  );
  assert.equal(accepted.status, "success");

  const calls: unknown[] = [];
  const rejected = await updateDailyPreparationItems(
    clientReturning(null, null, calls),
    input([
      {
        dailyItemId: firstItemId,
        expectedVersion: 2_147_483_648,
        isPrepared: true,
      },
    ]),
  );
  assert.equal(rejected.status, "client_error");
  assert.equal(calls.length, 0);
});

test("sends an empty array because the low-level wrapper preserves the DB contract", async () => {
  const calls: unknown[] = [];
  const result = await updateDailyPreparationItems(
    clientReturning(
      {
        status: "success",
        requested_count: 0,
        changed_count: 0,
        unchanged_count: 0,
        items: [],
        conflicts: [],
        session: null,
      },
      null,
      calls,
    ),
    input([]),
  );

  assert.equal(result.status, "success");
  assert.equal(calls.length, 1);
  assert.deepEqual(
    (calls[0] as { args: { p_updates: unknown[] } }).args.p_updates,
    [],
  );
});
