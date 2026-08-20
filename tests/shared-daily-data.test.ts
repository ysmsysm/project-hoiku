import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCheckedSessionToSharedDailyState,
  applyCompletedSessionToSharedDailyState,
  applyDeletedItemReloadToSharedDailyState,
  applyThanksSessionToSharedDailyState,
  applyUpdatedItemsToSharedDailyState,
  applyUpdatedItemToSharedDailyState,
  applyQuantityReloadToSharedDailyState,
  getSharedPreparationBulkMutationPlan,
  getSharedDailyItemDeletionTarget,
  loadSharedDailyDataForDate,
  mapLoadDailyDataResultToSharedDailyState,
  isSharedDailyCheckCurrent,
} from "../src/lib/family-sharing/shared-daily-data";
import type {
  DailyDataClient,
  DailyItem,
  DailySession,
} from "../src/types/daily";
import type { SharedDailyState } from "../src/types/shared-daily";
import {
  createHomeLockerItems,
  deriveHomeSharedDailyState,
} from "../src/lib/home-daily-initial-state";
import { completeDailyCheck } from "../src/lib/family-sharing/complete-daily-check";

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

test("applies one validated item to the canonical session and re-derives views", async () => {
  const secondItemId = "66666666-6666-4666-8666-666666666666";
  const secondTemplateId = "77777777-7777-4777-8777-777777777777";
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [
        itemPayload(),
        itemPayload({
          id: secondItemId,
          daily_item_id: secondItemId,
          item_template_id: secondTemplateId,
          name: "タオル",
        }),
      ],
    }),
    input,
  );
  assert.equal(state.status, "success");
  if (state.status !== "success") {
    return;
  }

  const untouchedItem = state.session.items[1];
  const updatedItem: DailyItem = {
    ...state.session.items[0],
    observedQuantity: 2,
    shortageCount: 1,
    version: 5,
  };
  const applied = applyUpdatedItemToSharedDailyState(
    state,
    {
      familyId,
      childId,
      sessionDate,
      dailySessionId: sessionId,
      dailyItemId: itemId,
      expectedVersion: 4,
    },
    updatedItem,
  );

  assert.notEqual(applied, state);
  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.equal(applied.session.items[0], updatedItem);
    assert.equal(applied.session.items[1], untouchedItem);
    assert.equal(applied.checkView.items[0].observedQuantity, 2);
    assert.equal(applied.checkView.items[0].version, 5);
    assert.equal(applied.preparationSession.items[0].count, 1);
    assert.equal(applied.preparationSession.items[0].dailyItemVersion, 5);
  }

});

test("applies prepared and deferred item transitions through the shared mapper", async () => {
  const transitions = [
    { isPrepared: true, isDeferred: false },
    { isPrepared: false, isDeferred: false },
    { isPrepared: false, isDeferred: true },
    { isPrepared: true, isDeferred: false },
  ];

  for (const transition of transitions) {
    const state = await loadSharedDailyDataForDate(
      clientReturning({
        status: "success",
        session: sessionPayload(),
        items: [itemPayload(), itemPayload({
          id: "66666666-6666-4666-8666-666666666666",
          daily_item_id: "66666666-6666-4666-8666-666666666666",
          item_template_id: "77777777-7777-4777-8777-777777777777",
        })],
      }),
      input,
    );
    assert.equal(state.status, "success");
    if (state.status !== "success") {
      continue;
    }
    const untouchedItem = state.session.items[1];
    const updatedItem: DailyItem = {
      ...state.session.items[0],
      ...transition,
      version: 5,
    };
    const applied = applyUpdatedItemToSharedDailyState(
      state,
      {
        familyId,
        childId,
        sessionDate,
        dailySessionId: sessionId,
        dailyItemId: itemId,
        expectedVersion: 4,
      },
      updatedItem,
    );

    assert.equal(applied.status, "success");
    if (applied.status === "success") {
      assert.equal(applied.session.items[0], updatedItem);
      assert.equal(applied.session.items[1], untouchedItem);
      assert.equal(applied.checkView.items[0].version, 5);
      assert.equal(
        applied.preparationSession.items[0].checked,
        transition.isPrepared,
      );
      assert.equal(
        applied.preparationSession.items[0].later,
        transition.isDeferred,
      );
      assert.equal(
        applied.preparationSession.items[0].dailyItemVersion,
        5,
      );
    }
  }
});

test("does not apply stale or out-of-scope daily item results", async () => {
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [itemPayload()],
    }),
    input,
  );
  assert.equal(state.status, "success");
  if (state.status !== "success") {
    return;
  }
  const updatedItem: DailyItem = {
    ...state.session.items[0],
    observedQuantity: 2,
    shortageCount: 1,
    version: 5,
  };
  const scope = {
    familyId,
    childId,
    sessionDate,
    dailySessionId: sessionId,
    dailyItemId: itemId,
    expectedVersion: 4,
  };
  const otherId = "66666666-6666-4666-8666-666666666666";

  const cases: Array<[SharedDailyState, typeof scope, DailyItem]> = [
    [{ status: "not_found", sessionDate }, scope, updatedItem],
    [state, { ...scope, familyId: otherId }, updatedItem],
    [state, { ...scope, childId: otherId }, updatedItem],
    [state, { ...scope, sessionDate: "2026-08-03" }, updatedItem],
    [state, { ...scope, dailySessionId: otherId }, updatedItem],
    [state, { ...scope, dailyItemId: otherId }, updatedItem],
    [state, { ...scope, expectedVersion: 3 }, updatedItem],
    [state, scope, { ...updatedItem, familyId: otherId }],
    [state, scope, { ...updatedItem, dailySessionId: otherId }],
    [state, scope, { ...updatedItem, dailyItemId: otherId }],
    [
      state,
      { ...scope, dailyItemId: otherId },
      { ...updatedItem, dailyItemId: otherId },
    ],
  ];

  for (const [current, requestScope, item] of cases) {
    assert.equal(
      applyUpdatedItemToSharedDailyState(current, requestScope, item),
      current,
    );
  }
});

test("selects every visible non-deferred preparation item and enforces the bulk bounds", async () => {
  const items = [
    itemPayload(),
    itemPayload({
      id: "66666666-6666-4666-8666-666666666666",
      daily_item_id: "66666666-6666-4666-8666-666666666666",
      kind: "spot",
      required_quantity: 2,
      is_prepared: true,
    }),
    itemPayload({
      id: "77777777-7777-4777-8777-777777777777",
      daily_item_id: "77777777-7777-4777-8777-777777777777",
      kind: "rough",
      rough_state: "refill",
      required_quantity: 1,
      is_carryover: true,
    }),
    itemPayload({
      id: "88888888-8888-4888-8888-888888888888",
      daily_item_id: "88888888-8888-4888-8888-888888888888",
      is_deferred: true,
    }),
    itemPayload({
      id: "99999999-9999-4999-8999-999999999999",
      daily_item_id: "99999999-9999-4999-8999-999999999999",
      observed_quantity: 3,
      shortage_count: 0,
    }),
  ];
  const state = await loadSharedDailyDataForDate(
    clientReturning({ status: "success", session: sessionPayload(), items }),
    input,
  );
  assert.equal(state.status, "success");
  if (state.status !== "success") return;

  const plan = getSharedPreparationBulkMutationPlan(state.session);
  assert.equal(plan.status, "ready");
  if (plan.status === "ready") {
    assert.equal(plan.desiredPrepared, true);
    assert.deepEqual(
      plan.updates.map((update) => update.dailyItemId),
      items.slice(0, 3).map((item) => item.daily_item_id),
    );
    assert.equal(plan.updates.every((update) => update.isPrepared), true);

    const allPreparedPlan = getSharedPreparationBulkMutationPlan({
      ...state.session,
      items: state.session.items.map((item) => ({
        ...item,
        isPrepared: true,
      })),
    });
    assert.equal(allPreparedPlan.status, "ready");
    if (allPreparedPlan.status === "ready") {
      assert.equal(allPreparedPlan.desiredPrepared, false);
      assert.equal(
        allPreparedPlan.updates.every((update) => !update.isPrepared),
        true,
      );
    }
  }

  assert.equal(
    getSharedPreparationBulkMutationPlan({ ...state.session, items: [] }).status,
    "empty",
  );
  const oneHundred = Array.from({ length: 100 }, (_, index) => ({
    ...state.session.items[0],
    dailyItemId: `aaaaaaaa-aaaa-4aaa-8aaa-${index
      .toString(16)
      .padStart(12, "0")}`,
  }));
  assert.equal(
    getSharedPreparationBulkMutationPlan({
      ...state.session,
      items: oneHundred,
    }).status,
    "ready",
  );
  assert.equal(
    getSharedPreparationBulkMutationPlan({
      ...state.session,
      items: [
        ...oneHundred,
        {
          ...state.session.items[0],
          dailyItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      ],
    }).status,
    "too_many",
  );
  assert.equal(
    getSharedPreparationBulkMutationPlan({
      ...state.session,
      items: [
        state.session.items[0],
        { ...state.session.items[0] },
      ],
    }).status,
    "invalid",
  );
  assert.equal(
    getSharedPreparationBulkMutationPlan({
      ...state.session,
      items: [
        { ...state.session.items[0], dailyItemId: "" },
      ],
    }).status,
    "invalid",
  );
  assert.equal(
    getSharedPreparationBulkMutationPlan({
      ...state.session,
      items: [{ ...state.session.items[0], version: 0 }],
    }).status,
    "invalid",
  );
});

test("atomically applies multiple changed items in one batch", async () => {
  const secondItemId = "66666666-6666-4666-8666-666666666666";
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [
        itemPayload(),
        itemPayload({ id: secondItemId, daily_item_id: secondItemId }),
      ],
    }),
    input,
  );
  assert.equal(state.status, "success");
  if (state.status !== "success") return;

  const updates = state.session.items.map((item) => ({
    dailyItemId: item.dailyItemId,
    expectedVersion: item.version,
    isPrepared: true,
  }));
  const returned = state.session.items.map((item) => ({
    ...item,
    isPrepared: true,
    isDeferred: false,
    version: item.version + 1,
    changed: true,
  }));
  const applied = applyUpdatedItemsToSharedDailyState(
    state,
    { familyId, childId, sessionDate, dailySessionId: sessionId, updates },
    returned,
    2,
  );

  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.equal(applied.session.items.every((item) => item.isPrepared), true);
    assert.equal(
      applied.preparationSession.items.every((item) => item.checked),
      true,
    );
  }
});

test("replaces the full canonical session only after validated preparation completion", async () => {
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [itemPayload({ is_prepared: true })],
    }),
    input,
  );
  const completed = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 3,
        is_prepared: true,
        prepared_at: "2026-07-29T00:10:00.000Z",
        prepared_by_member_id: familyId,
        prepared_by_user_id: childId,
        prepared_by_display_name: "ママ",
      }),
      items: [
        itemPayload({
          is_prepared: true,
          is_carryover: true,
          carryover_resolved_at: "2026-07-29T00:10:00.000Z",
          version: 5,
        }),
      ],
    }),
    input,
  );
  assert.equal(state.status, "success");
  assert.equal(completed.status, "success");
  if (state.status !== "success" || completed.status !== "success") return;

  const scope = {
    familyId,
    childId,
    sessionDate,
    dailySessionId: sessionId,
    expectedSessionVersion: 2,
    completedSessionVersion: 3,
    changed: true,
  };
  const applied = applyCompletedSessionToSharedDailyState(
    state,
    scope,
    completed.session,
  );
  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.equal(applied.session, completed.session);
    assert.equal(applied.preparationSession.completedAt, "2026-07-29T00:10:00.000Z");
    assert.equal(applied.preparationSession.items[0].dailyItemVersion, 5);
    assert.equal(applied.session.items[0].carryoverResolvedAt, "2026-07-29T00:10:00.000Z");
    assert.equal(applied.checkView.items[0].version, 5);
  }

  for (const invalidScope of [
    { ...scope, familyId: childId },
    { ...scope, childId: familyId },
    { ...scope, sessionDate: "2026-07-30" },
    { ...scope, dailySessionId: itemId },
    { ...scope, expectedSessionVersion: 1 },
    { ...scope, completedSessionVersion: 4 },
  ]) {
    assert.equal(
      applyCompletedSessionToSharedDailyState(
        state,
        invalidScope,
        completed.session,
      ),
      state,
    );
  }
  const invalidItemScope = {
    ...completed.session,
    items: [{ ...completed.session.items[0], familyId: childId }],
  };
  const duplicateItems = {
    ...completed.session,
    items: [completed.session.items[0], completed.session.items[0]],
  };
  assert.equal(
    applyCompletedSessionToSharedDailyState(state, scope, invalidItemScope),
    state,
  );
  assert.equal(
    applyCompletedSessionToSharedDailyState(state, scope, duplicateItems),
    state,
  );
  assert.equal(
    applyCompletedSessionToSharedDailyState(
      { status: "not_found", sessionDate },
      scope,
      completed.session,
    ).status,
    "not_found",
  );
});

test("completed preparation reload reflects only prepared items for owner and member check views", async () => {
  const deferredItemId = "77777777-7777-4777-8777-777777777777";
  const deferredTemplateId = "88888888-8888-4888-8888-888888888888";
  const completedPayload = {
    status: "success",
    session: sessionPayload({
      version: 3,
      is_prepared: true,
      prepared_at: "2026-07-29T00:10:00.000Z",
      prepared_by_member_id: familyId,
      prepared_by_user_id: childId,
      prepared_by_display_name: "miri",
    }),
    items: [
      itemPayload({
        observed_quantity: 3,
        shortage_count: 0,
        is_prepared: true,
        version: 5,
      }),
      itemPayload({
        id: deferredItemId,
        daily_item_id: deferredItemId,
        item_template_id: deferredTemplateId,
        observed_quantity: 1,
        shortage_count: 2,
        is_prepared: false,
        is_deferred: true,
        version: 5,
      }),
    ],
  };

  for (const role of ["owner", "member"] as const) {
    const loaded = await loadSharedDailyDataForDate(
      clientReturning(completedPayload),
      input,
    );
    assert.equal(loaded.status, "success", role);
    if (loaded.status !== "success") continue;

    const home = deriveHomeSharedDailyState(loaded);
    assert.equal(home.mode, "shared-success", role);
    if (home.mode !== "shared-success") continue;
    assert.deepEqual(home.checkCounts, {
      [templateId]: 3,
      [deferredTemplateId]: 1,
    });
    assert.deepEqual(
      createHomeLockerItems({
        mode: "shared-success",
        checkView: home.checkView,
      }).map((item) => ({ id: item.id, count: item.shortageCount })),
      [
        { id: templateId, count: 3 },
        { id: deferredTemplateId, count: 1 },
      ],
      role,
    );

    const reloaded = await loadSharedDailyDataForDate(
      clientReturning(completedPayload),
      input,
    );
    assert.equal(reloaded.status, "success", `${role} reload`);
    if (reloaded.status === "success") {
      assert.deepEqual(
        reloaded.checkView.items.map((item) => item.observedQuantity),
        [3, 1],
        `${role} reload`,
      );
    }
  }
});

test("completed quantity correction applies a full canonical reload for owner and member", async () => {
  for (const role of ["owner", "member"] as const) {
    const before = await loadSharedDailyDataForDate(
      clientReturning({
        status: "success",
        session: sessionPayload({
          version: 3,
          is_prepared: true,
          prepared_at: "2026-07-29T00:10:00.000Z",
          prepared_by_member_id: familyId,
          prepared_by_user_id: childId,
          prepared_by_display_name: "miri",
        }),
        items: [itemPayload({ observed_quantity: 3, shortage_count: 0 })],
      }),
      input,
    );
    const after = await loadSharedDailyDataForDate(
      clientReturning({
        status: "success",
        session: sessionPayload({
          version: 3,
          is_prepared: true,
          prepared_at: "2026-07-29T00:10:00.000Z",
          prepared_by_member_id: familyId,
          prepared_by_user_id: childId,
          prepared_by_display_name: "miri",
        }),
        items: [
          itemPayload({
            observed_quantity: 2,
            shortage_count: 1,
            version: 5,
          }),
        ],
      }),
      input,
    );
    assert.equal(before.status, "success", role);
    assert.equal(after.status, "success", role);
    if (before.status !== "success" || after.status !== "success") continue;

    const applied = applyQuantityReloadToSharedDailyState(
      before,
      {
        familyId,
        childId,
        sessionDate,
        dailySessionId: sessionId,
        dailyItemId: itemId,
        expectedVersion: 4,
        responseVersion: 5,
        observedQuantity: 2,
        requestScopeKey: "scope",
        currentScopeKey: "scope",
        requestScopeGeneration: 2,
        currentScopeGeneration: 2,
      },
      after.session,
    );
    assert.equal(applied.status, "success", role);
    if (applied.status === "success") {
      assert.equal(applied.checkView.items[0].observedQuantity, 2, role);
      assert.equal(applied.session.isCompleted, true, role);
    }

    const reloaded = await loadSharedDailyDataForDate(
      clientReturning({
        status: "success",
        session: sessionPayload({
          version: 3,
          is_prepared: true,
          prepared_at: "2026-07-29T00:10:00.000Z",
          prepared_by_member_id: familyId,
          prepared_by_user_id: childId,
          prepared_by_display_name: "miri",
        }),
        items: [
          itemPayload({
            observed_quantity: 2,
            shortage_count: 1,
            version: 5,
          }),
        ],
      }),
      input,
    );
    assert.equal(reloaded.status, "success", `${role} reload`);
    if (reloaded.status === "success") {
      assert.equal(reloaded.checkView.items[0].observedQuantity, 2);
    }
  }
});

test("accepts retry-safe no-op completion without requiring expected plus one", async () => {
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [itemPayload({ is_prepared: true })],
    }),
    input,
  );
  const completed = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 8,
        is_prepared: true,
        prepared_at: "2026-07-29T00:10:00.000Z",
      }),
      items: [itemPayload({ is_prepared: true })],
    }),
    input,
  );
  assert.equal(state.status, "success");
  assert.equal(completed.status, "success");
  if (state.status !== "success" || completed.status !== "success") return;
  const applied = applyCompletedSessionToSharedDailyState(
    state,
    {
      familyId,
      childId,
      sessionDate,
      dailySessionId: sessionId,
      expectedSessionVersion: 2,
      completedSessionVersion: 8,
      changed: false,
    },
    completed.session,
  );
  assert.equal(applied.status, "success");
  if (applied.status === "success") assert.equal(applied.session.version, 8);
});

test("replaces the full canonical session only after validated daily check completion", async () => {
  const unchecked = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 2,
        is_checked: false,
        checked_at: null,
        checked_by_member_id: null,
        checked_by_user_id: null,
        checked_by_display_name: null,
      }),
      items: [itemPayload({ is_checked: false, observed_quantity: 0 })],
    }),
    input,
  );
  const checked = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 3,
        checked_by_member_id: familyId,
        checked_by_user_id: childId,
        checked_by_display_name: "パパ",
      }),
      items: [
        itemPayload({
          version: 7,
          is_checked: false,
          observed_quantity: 2,
          shortage_count: 1,
        }),
      ],
    }),
    input,
  );
  assert.equal(unchecked.status, "success");
  assert.equal(checked.status, "success");
  if (unchecked.status !== "success" || checked.status !== "success") return;

  const scope = {
    familyId,
    childId,
    sessionDate,
    dailySessionId: sessionId,
    expectedSessionVersion: 2,
    responseSessionVersion: 3,
    changed: true,
    requestScopeKey: "scope-a",
    currentScopeKey: "scope-a",
    requestScopeGeneration: 4,
    currentScopeGeneration: 4,
  };
  const applied = applyCheckedSessionToSharedDailyState(
    unchecked,
    scope,
    checked.session,
  );
  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.equal(applied.session, checked.session);
    assert.equal(applied.session.checkedAt, "2026-07-29T00:05:00.000Z");
    assert.equal(applied.session.checkedByMemberId, familyId);
    assert.equal(applied.checkView.items[0].observedQuantity, 2);
    assert.equal(applied.checkView.items[0].version, 7);
    assert.equal(applied.preparationSession.confirmedAt, checked.session.checkedAt);
    assert.equal(applied.preparationSession.checkedBy, "パパ");
    assert.equal(applied.preparationSession.items[0].count, 1);
    assert.equal(applied.preparationSession.items[0].dailyItemVersion, 7);
    const derived = deriveHomeSharedDailyState(applied);
    assert.equal(derived.checkCounts[templateId], 2);
    assert.equal(
      createHomeLockerItems({
        mode: "shared-success",
        checkView: derived.checkView,
      })[0].shortageCount,
      2,
    );
  }

  for (const invalidScope of [
    { ...scope, familyId: childId },
    { ...scope, childId: familyId },
    { ...scope, sessionDate: "2026-07-30" },
    { ...scope, dailySessionId: itemId },
    { ...scope, expectedSessionVersion: 1 },
    { ...scope, responseSessionVersion: 4 },
    { ...scope, requestScopeKey: "stale" },
    { ...scope, requestScopeGeneration: 3 },
  ]) {
    assert.equal(
      applyCheckedSessionToSharedDailyState(
        unchecked,
        invalidScope,
        checked.session,
      ),
      unchecked,
    );
  }
  assert.equal(
    applyCheckedSessionToSharedDailyState(unchecked, scope, {
      ...checked.session,
      items: [checked.session.items[0], checked.session.items[0]],
    }),
    unchecked,
  );
  assert.equal(
    applyCheckedSessionToSharedDailyState(unchecked, scope, {
      ...checked.session,
      items: [{ ...checked.session.items[0], familyId: childId }],
    }),
    unchecked,
  );
  assert.equal(
    applyCheckedSessionToSharedDailyState(unchecked, scope, {
      ...checked.session,
      dailySessionId: itemId,
    }),
    unchecked,
  );
  assert.equal(
    applyCheckedSessionToSharedDailyState(unchecked, scope, {
      ...checked.session,
      checkedByMemberId: null,
    }),
    unchecked,
  );
  assert.equal(
    applyCheckedSessionToSharedDailyState(unchecked, scope, {
      ...checked.session,
      completedByMemberId: familyId,
    }),
    unchecked,
  );
  assert.equal(
    applyCheckedSessionToSharedDailyState(unchecked, scope, {
      ...checked.session,
      thanksSentByMemberId: familyId,
    }),
    unchecked,
  );
});

test("preparation newer than check requires recheck and preserves preparation after reload", async () => {
  for (const role of ["owner", "member"] as const) {
    const stale = await loadSharedDailyDataForDate(
      clientReturning({
        status: "success",
        session: sessionPayload({
          version: 4,
          checked_at: "2026-07-29T00:05:00.000Z",
          checked_by_member_id: familyId,
          checked_by_user_id: childId,
          checked_by_display_name: "first",
          is_prepared: true,
          prepared_at: "2026-07-29T00:10:00.000Z",
          prepared_by_member_id: childId,
          prepared_by_user_id: familyId,
          prepared_by_display_name: "preparer",
        }),
        items: [
          itemPayload({
            observed_quantity: 3,
            shortage_count: 0,
            is_prepared: true,
            version: 5,
          }),
        ],
      }),
      input,
    );
    const recheckedPayload = sessionPayload({
      version: 5,
      checked_at: "2026-07-29T00:15:00.000Z",
      checked_by_member_id: childId,
      checked_by_user_id: familyId,
      checked_by_display_name: "latest",
      is_prepared: true,
      prepared_at: "2026-07-29T00:10:00.000Z",
      prepared_by_member_id: childId,
      prepared_by_user_id: familyId,
      prepared_by_display_name: "preparer",
    });
    const calls: string[] = [];
    const completed = await completeDailyCheck(
      {
        async rpc(functionName, args) {
          calls.push(functionName);
          assert.deepEqual(args, {
            p_family_id: familyId,
            p_child_id: childId,
            p_session_date: sessionDate,
            p_expected_version: 4,
          });
          return {
            data: { status: "success", session: recheckedPayload },
            error: null,
          };
        },
      },
      { familyId, childId, sessionDate, expectedSessionVersion: 4 },
    );
    assert.equal(completed.status, "success", role);
    if (completed.status !== "success") continue;

    const rechecked = await loadSharedDailyDataForDate(
      clientReturning({
        status: "success",
        session: recheckedPayload,
        items: [
          itemPayload({
            observed_quantity: 3,
            shortage_count: 0,
            is_prepared: true,
            version: 5,
          }),
        ],
      }),
      input,
    );
    assert.equal(stale.status, "success", role);
    assert.equal(rechecked.status, "success", role);
    assert.deepEqual(calls, ["complete_daily_check"], role);
    if (stale.status !== "success" || rechecked.status !== "success") continue;
    assert.equal(isSharedDailyCheckCurrent(stale.session), false, role);

    const applied = applyCheckedSessionToSharedDailyState(
      stale,
      {
        familyId,
        childId,
        sessionDate,
        dailySessionId: sessionId,
        expectedSessionVersion: 4,
        responseSessionVersion: completed.session.version,
        changed: completed.changed,
        requestScopeKey: "scope",
        currentScopeKey: "scope",
        requestScopeGeneration: 3,
        currentScopeGeneration: 3,
      },
      rechecked.session,
    );
    assert.equal(applied.status, "success", role);
    if (applied.status === "success") {
      assert.equal(isSharedDailyCheckCurrent(applied.session), true, role);
      assert.equal(applied.session.checkedByDisplayName, "latest", role);
      assert.equal(applied.session.completedByDisplayName, "preparer", role);
      assert.equal(
        applied.session.completedAt,
        "2026-07-29T00:10:00.000Z",
        role,
      );
      assert.equal(applied.checkView.items[0].observedQuantity, 3, role);
    }
    assert.equal(isSharedDailyCheckCurrent(rechecked.session), true, role);
  }
});

test("accepts checked no-op and empty full item collections only at the start version", async () => {
  const unchecked = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 2,
        is_checked: false,
        checked_at: null,
        checked_by_member_id: null,
        checked_by_user_id: null,
        checked_by_display_name: null,
      }),
      items: [],
    }),
    input,
  );
  const checked = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 2,
        checked_by_member_id: familyId,
        checked_by_user_id: childId,
        checked_by_display_name: "パパ",
      }),
      items: [],
    }),
    input,
  );
  assert.equal(unchecked.status, "success");
  assert.equal(checked.status, "success");
  if (unchecked.status !== "success" || checked.status !== "success") return;
  const scope = {
    familyId,
    childId,
    sessionDate,
    dailySessionId: sessionId,
    expectedSessionVersion: 2,
    responseSessionVersion: 2,
    changed: false,
    requestScopeKey: "scope-a",
    currentScopeKey: "scope-a",
    requestScopeGeneration: 1,
    currentScopeGeneration: 1,
  };
  const applied = applyCheckedSessionToSharedDailyState(
    unchecked,
    scope,
    checked.session,
  );
  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.deepEqual(applied.session.items, []);
    assert.deepEqual(applied.checkView.items, []);
    assert.deepEqual(applied.preparationSession.items, []);
  }
  assert.equal(
    applyCheckedSessionToSharedDailyState(
      unchecked,
      { ...scope, responseSessionVersion: 3 },
      { ...checked.session, version: 3 },
    ),
    unchecked,
  );
});

test("replaces the whole canonical state with a validated thanks reload", async () => {
  const preparerMemberId = "66666666-6666-4666-8666-666666666666";
  const preparerUserId = "77777777-7777-4777-8777-777777777777";
  const senderMemberId = "88888888-8888-4888-8888-888888888888";
  const senderUserId = "99999999-9999-4999-8999-999999999999";
  const completedFields = {
    checked_by_member_id: senderMemberId,
    checked_by_user_id: senderUserId,
    checked_by_display_name: "Checker",
    is_prepared: true,
    prepared_at: "2026-07-29T00:10:00.000Z",
    prepared_by_member_id: preparerMemberId,
    prepared_by_user_id: preparerUserId,
    prepared_by_display_name: "Preparer",
  };
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({ version: 2, ...completedFields }),
      items: [itemPayload({ is_prepared: true })],
    }),
    input,
  );
  const reloaded = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 3,
        ...completedFields,
        thanks_sent_at: "2026-07-29T00:15:00.000Z",
        thanks_sent_by_member_id: senderMemberId,
        thanks_sent_by_user_id: senderUserId,
        thanks_sent_by_display_name: "Sender",
        thanks_received_by_member_id: preparerMemberId,
        thanks_received_by_user_id: preparerUserId,
        thanks_received_by_display_name: "Preparer",
      }),
      items: [
        itemPayload({
          version: 5,
          is_prepared: true,
          observed_quantity: 2,
          shortage_count: 1,
        }),
      ],
    }),
    input,
  );
  assert.equal(state.status, "success");
  assert.equal(reloaded.status, "success");
  if (state.status !== "success" || reloaded.status !== "success") return;

  const scope = {
    familyId,
    childId,
    sessionDate,
    dailySessionId: sessionId,
    expectedSessionVersion: 2,
    responseSessionVersion: 3,
    changed: true,
    requestScopeKey: "scope-a",
    currentScopeKey: "scope-a",
    requestScopeGeneration: 4,
    currentScopeGeneration: 4,
  };
  const applied = applyThanksSessionToSharedDailyState(
    state,
    scope,
    reloaded.session,
  );
  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.equal(applied.session, reloaded.session);
    assert.equal(applied.session.thanksSent, true);
    assert.equal(applied.session.thanksSentByMemberId, senderMemberId);
    assert.equal(applied.preparationSession.thanksSent, true);
    assert.equal(applied.preparationSession.items[0].dailyItemVersion, 5);
    assert.equal(applied.checkView.items[0].observedQuantity, 2);
  }

  for (const invalidScope of [
    { ...scope, familyId: childId },
    { ...scope, childId: familyId },
    { ...scope, sessionDate: "2026-07-30" },
    { ...scope, dailySessionId: itemId },
    { ...scope, expectedSessionVersion: 1 },
    { ...scope, responseSessionVersion: 4 },
    { ...scope, requestScopeKey: "stale" },
    { ...scope, requestScopeGeneration: 3 },
  ]) {
    assert.equal(
      applyThanksSessionToSharedDailyState(state, invalidScope, reloaded.session),
      state,
    );
  }
  assert.equal(
    applyThanksSessionToSharedDailyState(state, scope, {
      ...reloaded.session,
      items: [reloaded.session.items[0], reloaded.session.items[0]],
    }),
    state,
  );
  assert.equal(
    applyThanksSessionToSharedDailyState(state, scope, {
      ...reloaded.session,
      items: [{ ...reloaded.session.items[0], familyId: childId }],
    }),
    state,
  );
  assert.equal(
    applyThanksSessionToSharedDailyState(state, scope, {
      ...reloaded.session,
      thanksReceivedByMemberId: senderMemberId,
    }),
    state,
  );
  assert.equal(
    applyThanksSessionToSharedDailyState(state, scope, {
      ...reloaded.session,
      checkedByMemberId: null,
    }),
    state,
  );
  const incompleteCurrentState: SharedDailyState = {
    ...state,
    session: {
      ...state.session,
      isCompleted: false,
      completedAt: null,
    },
  };
  assert.equal(
    applyThanksSessionToSharedDailyState(
      incompleteCurrentState,
      scope,
      reloaded.session,
    ),
    incompleteCurrentState,
  );
});

test("accepts a validated thanks no-op reload without expected-plus-one", async () => {
  const preparerMemberId = "66666666-6666-4666-8666-666666666666";
  const senderMemberId = "88888888-8888-4888-8888-888888888888";
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 2,
        checked_by_member_id: senderMemberId,
        checked_by_user_id: familyId,
        checked_by_display_name: "Checker",
        is_prepared: true,
        prepared_at: "2026-07-29T00:10:00.000Z",
        prepared_by_member_id: preparerMemberId,
        prepared_by_user_id: childId,
        prepared_by_display_name: "Preparer",
      }),
      items: [itemPayload({ is_prepared: true })],
    }),
    input,
  );
  const reloaded = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload({
        version: 12,
        checked_by_member_id: senderMemberId,
        checked_by_user_id: familyId,
        checked_by_display_name: "Checker",
        is_prepared: true,
        prepared_at: "2026-07-29T00:10:00.000Z",
        prepared_by_member_id: preparerMemberId,
        prepared_by_user_id: childId,
        prepared_by_display_name: "Preparer",
        thanks_sent_at: "2026-07-29T00:15:00.000Z",
        thanks_sent_by_member_id: senderMemberId,
        thanks_sent_by_user_id: familyId,
        thanks_sent_by_display_name: "Sender",
        thanks_received_by_member_id: preparerMemberId,
        thanks_received_by_user_id: childId,
        thanks_received_by_display_name: "Preparer",
      }),
      items: [itemPayload({ is_prepared: true })],
    }),
    input,
  );
  assert.equal(state.status, "success");
  assert.equal(reloaded.status, "success");
  if (state.status !== "success" || reloaded.status !== "success") return;
  const applied = applyThanksSessionToSharedDailyState(
    state,
    {
      familyId,
      childId,
      sessionDate,
      dailySessionId: sessionId,
      expectedSessionVersion: 2,
      responseSessionVersion: 12,
      changed: false,
      requestScopeKey: "scope-a",
      currentScopeKey: "scope-a",
      requestScopeGeneration: 1,
      currentScopeGeneration: 1,
    },
    reloaded.session,
  );
  assert.equal(applied.status, "success");
  if (applied.status === "success") assert.equal(applied.session.version, 12);
});

test("atomically applies changed batch items while preserving no-op and unrelated references", async () => {
  const secondItemId = "66666666-6666-4666-8666-666666666666";
  const thirdItemId = "77777777-7777-4777-8777-777777777777";
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [
        itemPayload(),
        itemPayload({
          id: secondItemId,
          daily_item_id: secondItemId,
          version: 7,
          is_prepared: true,
        }),
        itemPayload({ id: thirdItemId, daily_item_id: thirdItemId }),
      ],
    }),
    input,
  );
  assert.equal(state.status, "success");
  if (state.status !== "success") return;

  const noOpItem = state.session.items[1];
  const unrelatedItem = state.session.items[2];
  const changedItem = {
    ...state.session.items[0],
    isPrepared: true,
    isDeferred: false,
    version: 5,
    changed: true,
  };
  const returnedNoOp = { ...noOpItem, changed: false };
  const scope = {
    familyId,
    childId,
    sessionDate,
    dailySessionId: sessionId,
    updates: [
      { dailyItemId: itemId, expectedVersion: 4, isPrepared: true },
      { dailyItemId: secondItemId, expectedVersion: 7, isPrepared: true },
    ],
  };
  const applied = applyUpdatedItemsToSharedDailyState(
    state,
    scope,
    [changedItem, returnedNoOp],
    1,
  );

  assert.notEqual(applied, state);
  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.equal(applied.session.items[0].isPrepared, true);
    assert.equal(applied.session.items[0].version, 5);
    assert.equal(applied.session.items[1], noOpItem);
    assert.equal(applied.session.items[2], unrelatedItem);
    assert.equal(applied.preparationSession.items[0].checked, true);
    assert.equal(applied.preparationSession.items[0].dailyItemVersion, 5);
    assert.equal(applied.checkView.items[0].version, 5);
  }

  const invalidCases = [
    { scope: { ...scope, familyId: thirdItemId }, items: [changedItem, returnedNoOp], count: 1 },
    { scope: { ...scope, childId: thirdItemId }, items: [changedItem, returnedNoOp], count: 1 },
    { scope: { ...scope, sessionDate: "2026-07-30" }, items: [changedItem, returnedNoOp], count: 1 },
    { scope: { ...scope, dailySessionId: thirdItemId }, items: [changedItem, returnedNoOp], count: 1 },
    { scope: { ...scope, updates: scope.updates.map((update) => ({ ...update, expectedVersion: 3 })) }, items: [changedItem, returnedNoOp], count: 1 },
    { scope, items: [changedItem], count: 1 },
    { scope, items: [changedItem, changedItem], count: 2 },
    { scope, items: [changedItem, returnedNoOp], count: 2 },
  ];
  for (const invalid of invalidCases) {
    assert.equal(
      applyUpdatedItemsToSharedDailyState(
        state,
        invalid.scope,
        invalid.items,
        invalid.count,
      ),
      state,
    );
  }
  assert.equal(
    applyUpdatedItemsToSharedDailyState(
      { status: "not_found", sessionDate },
      scope,
      [changedItem, returnedNoOp],
      1,
    ).status,
    "not_found",
  );
});

test("resolves one active template-backed daily deletion target from canonical state", async () => {
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [itemPayload()],
    }),
    input,
  );
  assert.equal(getSharedDailyItemDeletionTarget(state, templateId).status, "ready");
  assert.deepEqual(
    getSharedDailyItemDeletionTarget(state, "88888888-8888-4888-8888-888888888888"),
    { status: "none", dailyItemId: null, expectedDailyItemVersion: null },
  );
  if (state.status !== "success") return;
  assert.equal(
    getSharedDailyItemDeletionTarget(
      {
        ...state,
        session: {
          ...state.session,
          items: [...state.session.items, { ...state.session.items[0] }],
        },
      },
      templateId,
    ).status,
    "invalid",
  );
  assert.equal(
    getSharedDailyItemDeletionTarget(
      {
        ...state,
        session: {
          ...state.session,
          items: [{ ...state.session.items[0], version: 0 }],
        },
      },
      templateId,
    ).status,
    "invalid",
  );
});

test("applies a full deletion reload only when target, scope, generation, and session version remain current", async () => {
  const otherItemId = "88888888-8888-4888-8888-888888888888";
  const otherTemplateId = "99999999-9999-4999-8999-999999999999";
  const state = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [
        itemPayload(),
        itemPayload({
          id: otherItemId,
          daily_item_id: otherItemId,
          item_template_id: otherTemplateId,
          version: 8,
        }),
      ],
    }),
    input,
  );
  const reloaded = await loadSharedDailyDataForDate(
    clientReturning({
      status: "success",
      session: sessionPayload(),
      items: [
        itemPayload({
          id: otherItemId,
          daily_item_id: otherItemId,
          item_template_id: otherTemplateId,
          version: 9,
          observed_quantity: 2,
          shortage_count: 1,
        }),
      ],
    }),
    input,
  );
  assert.equal(state.status, "success");
  assert.equal(reloaded.status, "success");
  if (state.status !== "success" || reloaded.status !== "success") return;
  const scope = {
    familyId,
    childId,
    sessionDate,
    dailySessionId: sessionId,
    startSessionVersion: 2,
    itemTemplateId: templateId,
    dailyItemId: itemId,
    expectedDailyItemVersion: 4,
    requestScopeKey: "scope-a",
    currentScopeKey: "scope-a",
    requestScopeGeneration: 4,
    currentScopeGeneration: 4,
  };
  const applied = applyDeletedItemReloadToSharedDailyState(
    state,
    scope,
    reloaded.session,
  );
  assert.notEqual(applied, state);
  assert.equal(applied.status, "success");
  if (applied.status === "success") {
    assert.deepEqual(
      applied.session.items.map((item) => item.dailyItemId),
      [otherItemId],
    );
    assert.equal(applied.session.items[0].version, 9);
    assert.equal(applied.checkView.items[0].observedQuantity, 2);
    assert.equal(applied.preparationSession.items[0].dailyItemVersion, 9);
  }

  const targetOnlyState = {
    ...state,
    session: { ...state.session, items: [state.session.items[0]] },
  };
  const emptyReload = { ...reloaded.session, items: [] };
  assert.equal(
    applyDeletedItemReloadToSharedDailyState(
      targetOnlyState,
      scope,
      emptyReload,
    ).status,
    "success",
  );

  const invalidScopes = [
    { ...scope, familyId: otherItemId },
    { ...scope, childId: otherItemId },
    { ...scope, sessionDate: "2026-07-30" },
    { ...scope, dailySessionId: otherItemId },
    { ...scope, startSessionVersion: 3 },
    { ...scope, dailyItemId: otherItemId },
    { ...scope, expectedDailyItemVersion: 5 },
    { ...scope, currentScopeKey: "scope-b" },
    { ...scope, currentScopeGeneration: 5 },
  ];
  for (const invalidScope of invalidScopes) {
    assert.equal(
      applyDeletedItemReloadToSharedDailyState(
        state,
        invalidScope,
        reloaded.session,
      ),
      state,
    );
  }
  assert.equal(
    applyDeletedItemReloadToSharedDailyState(
      state,
      scope,
      { ...reloaded.session, items: [...reloaded.session.items, state.session.items[0]] },
    ),
    state,
  );
  const newerReload = {
    ...reloaded.session,
    version: scope.startSessionVersion + 1,
  };
  assert.notEqual(
    applyDeletedItemReloadToSharedDailyState(state, scope, newerReload),
    state,
  );
  assert.equal(
    applyDeletedItemReloadToSharedDailyState(
      state,
      scope,
      { ...reloaded.session, version: scope.startSessionVersion - 1 },
    ),
    state,
  );
  assert.equal(
    applyDeletedItemReloadToSharedDailyState(
      state,
      scope,
      {
        ...reloaded.session,
        items: [reloaded.session.items[0], { ...reloaded.session.items[0] }],
      },
    ),
    state,
  );
});
