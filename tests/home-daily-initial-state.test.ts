import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canApplyHomeLocalDailyHydration,
  canNavigateHomeAfterSharedCompleteCheck,
  canRenderHomeCompleteCheckAction,
  canRunHomeCompleteCheckMutation,
  canRunHomeLocalCompleteCheck,
  canRunHomeCompletePreparationMutation,
  canRunHomeLocalDailyMutation,
  canRunHomeObservedQuantityMutation,
  canRunHomePreparationBulkMutation,
  canRunHomePreparationItemMutation,
  canRunHomeSendThanksMutation,
  completeHomeLocalDailyHydration,
  createHomeLockerItems,
  createHomeDailyInitialState,
  deriveHomeSharedDailyState,
  getHomeSharedThanksDisplay,
  getHomeLocalDailySourceKey,
  getHomeDailyItemMutationErrorView,
  getHomePreparationBulkTooManyItemsView,
  getHomeSharedDailyStatusView,
  getHomeSharedDailyPropSync,
  getHomeSharedDailyStateSyncKey,
  initialHomeLocalDailyHydrationState,
  isHomeLocalDailyHydrationReady,
  isHomeSharedDailyDisplayState,
  isHomeSharedThanksSelf,
  loadHomeLocalDailyInitialState,
  shouldRunHomeLocalDailyAutoEffects,
  startHomeLocalDailyHydration,
} from "../src/lib/home-daily-initial-state";
import type { HomeDataSource } from "../src/lib/home-data-source";
import type { AppRepository } from "../src/lib/repositories/AppRepository";
import type { DailyItem, DailySession } from "../src/types/daily";
import type { SharedDailyState } from "../src/types/shared-daily";
import type { CustomizableItem } from "../src/types/preparation";
import { mapDailySessionToCheckView } from "../src/lib/family-sharing/daily-data-view";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const dailyItemId = "44444444-4444-4444-8444-444444444444";
const itemTemplateId = "55555555-5555-4555-8555-555555555555";
const sessionDate = "2026-08-02";
const homeClientSource = readFileSync("app/HomeClient.tsx", "utf8");
const progressDotsSource = readFileSync(
  "src/components/ui/ProgressDots.tsx",
  "utf8",
);
const shortageInputListSource = readFileSync(
  "src/components/ShortageInputList.tsx",
  "utf8",
);
const preparationChecklistSource = readFileSync(
  "src/components/PreparationChecklist.tsx",
  "utf8",
);

const durableItems: CustomizableItem[] = [
  {
    id: itemTemplateId,
    name: "着替え",
    unit: "枚",
    count: 3,
    category: "持ち物",
  },
];

const sharedInitialData = {
  childId,
  childProfile: {
    name: "そうた",
    iconType: "default" as const,
    iconId: "default-baby" as const,
    iconUrl: null,
    birthday: null,
    photoUrl: null,
  },
  customItems: durableItems,
  roughStates: {},
};

function dailyItem(): DailyItem {
  return {
    dailyItemId,
    dailySessionId: sessionId,
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
    isPrepared: true,
    isDeferred: false,
    isCarryover: false,
    carryoverPendingShortageCount: null,
    carriedFromDailyItemId: null,
    carryoverProcessedAt: null,
    carryoverResolvedAt: null,
    dueDate: null,
    sortOrder: 0,
    version: 7,
    deletedAt: null,
    updatedByMemberId: null,
    updatedByUserId: null,
    updatedByDisplayName: "パパ",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:05:00.000Z",
  };
}

function dailySession(): DailySession {
  return {
    dailySessionId: sessionId,
    familyId,
    childId,
    sessionDate,
    version: 2,
    isChecked: true,
    checkedAt: "2026-08-02T00:05:00.000Z",
    checkedByMemberId: null,
    checkedByUserId: null,
    checkedByDisplayName: "パパ",
    isCompleted: false,
    completedAt: null,
    completedByMemberId: null,
    completedByUserId: null,
    completedByDisplayName: null,
    thanksSent: false,
    thanksSentAt: null,
    thanksSentByMemberId: null,
    thanksSentByUserId: null,
    thanksSentByDisplayName: null,
    thanksReceivedByMemberId: null,
    thanksReceivedByUserId: null,
    thanksReceivedByDisplayName: null,
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:05:00.000Z",
    items: [dailyItem()],
  };
}

function successState(): Extract<SharedDailyState, { status: "success" }> {
  return {
    status: "success",
    sessionDate,
    session: dailySession(),
    preparationSession: {
      date: sessionDate,
      checkedBy: "パパ",
      confirmedAt: "2026-08-02T00:05:00.000Z",
      completedAt: null,
      items: [
        {
          id: itemTemplateId,
          dailyItemId,
          itemTemplateId,
          dailyItemVersion: 7,
          dailyKind: "regular",
          name: "着替え",
          unit: "枚",
          count: 2,
          checked: true,
          later: false,
          carryover: false,
          source: "locker",
          dueDate: null,
        },
      ],
      thanksSent: false,
    },
    checkView: {
      items: [
        {
          id: itemTemplateId,
          dailyItemId,
          itemTemplateId,
          version: 7,
          name: "着替え",
          unit: "枚",
          requiredQuantity: 3,
          observedQuantity: 1,
          isChecked: true,
        },
      ],
    },
  };
}

function nonSuccessStates(): SharedDailyState[] {
  return [
    { status: "not_found", sessionDate },
    { status: "forbidden", sessionDate },
    { status: "invalid_state", sessionDate },
    {
      status: "transport_error",
      sessionDate,
      error: { kind: "rpc_error", message: "offline" },
    },
    {
      status: "invalid_response",
      sessionDate,
      error: {
        kind: "invalid_response",
        message: "invalid",
        issues: [{ path: "response", code: "invalid" }],
      },
    },
    {
      status: "invalid_input",
      sessionDate,
      error: {
        kind: "invalid_input",
        message: "invalid",
        issues: [{ path: "familyId", code: "invalid_uuid" }],
      },
    },
  ];
}

function sharedDataSource(
  initialDailyData: SharedDailyState,
): Extract<HomeDataSource, { mode: "shared" }> {
  return {
    mode: "shared",
    familyId,
    currentMemberId: "11111111-1111-4111-8111-111111111111",
    initialData: sharedInitialData,
    initialDailyData,
    childProfileEditable: true,
    durableItemsEditable: false,
  };
}

test("local mode keeps default UI state until every local daily value is loaded", () => {
  const initialState = createHomeDailyInitialState(
    { mode: "local" },
    durableItems,
  );

  if (initialState.mode !== "local") {
    assert.fail("expected local state");
  }

  assert.deepEqual(initialState, {
    mode: "local",
    sharedDailyState: null,
    checkView: null,
    checkCounts: { [itemTemplateId]: 0 },
    session: {
      checkedBy: "ママ",
      confirmedAt: null,
      completedAt: null,
      items: [],
      thanksSent: false,
    },
  });
  const calls: string[] = [];
  const localState = loadHomeLocalDailyInitialState(
    { mode: "local" },
    {
      loadCheckCounts(defaultCounts) {
        calls.push("checkCounts");
        return { ...defaultCounts, [itemTemplateId]: 2 };
      },
      loadPreparationSession() {
        calls.push("session");
        return { ...initialState.session, checkedBy: "ママ" };
      },
      loadTodayOnlyTemporaryItems() {
        calls.push("temporaryItems");
        return [];
      },
      loadSpotAdditions() {
        calls.push("spotAdditions");
        return [];
      },
      loadSpotDeadlines() {
        calls.push("spotDeadlines");
        return {};
      },
    },
    initialState.checkCounts,
  );

  assert.deepEqual(calls, [
    "checkCounts",
    "session",
    "temporaryItems",
    "spotAdditions",
    "spotDeadlines",
  ]);
  assert.equal(localState?.checkCounts[itemTemplateId], 2);
});

test("shared success initializes canonical, check, and preparation state", () => {
  const initialDailyData = successState();
  const result = createHomeDailyInitialState(
    sharedDataSource(initialDailyData),
    durableItems,
  );

  assert.equal(result.sharedDailyState, initialDailyData);
  assert.equal(result.mode, "shared-success");
  if (result.mode !== "shared-success") {
    assert.fail("expected shared success");
  }
  assert.equal(result.sharedDailyState.status, "success");
  assert.deepEqual(result.checkCounts, { [itemTemplateId]: 1 });
  assert.notEqual(result.checkCounts[itemTemplateId], 2);
  assert.equal(result.checkView.items[0].dailyItemId, dailyItemId);
  assert.equal(result.checkView.items[0].itemTemplateId, itemTemplateId);
  assert.equal(result.checkView.items[0].version, 7);
  assert.equal(result.checkView.items[0].isChecked, true);
  assert.equal(result.session, initialDailyData.preparationSession);
  assert.equal(result.session.date, sessionDate);
  assert.equal(result.session.items[0].id, itemTemplateId);
  assert.equal(result.session.items[0].dailyItemId, dailyItemId);
  assert.equal(result.session.items[0].dailyItemVersion, 7);
  assert.equal(result.session.items[0].checked, true);
  assert.equal(result.session.items[0].later, false);
});

test("shared success preserves a deferred preparation item", () => {
  const initialDailyData = successState();
  initialDailyData.preparationSession.items[0] = {
    ...initialDailyData.preparationSession.items[0],
    checked: false,
    later: true,
  };

  const result = createHomeDailyInitialState(
    sharedDataSource(initialDailyData),
    durableItems,
  );

  assert.equal(result.mode, "shared-success");
  if (result.mode !== "shared-success") {
    assert.fail("expected shared success");
  }
  assert.equal(result.session.items[0].checked, false);
  assert.equal(result.session.items[0].later, true);
  assert.equal(result.session.items[0].dailyItemId, dailyItemId);
  assert.equal(result.session.items[0].dailyItemVersion, 7);
});

test("shared non-success states remain distinct without a local session", () => {
  for (const state of nonSuccessStates()) {
    const result = createHomeDailyInitialState(
      sharedDataSource(state),
      durableItems,
    );

    assert.equal(result.mode, "shared-non-success");
    if (result.mode !== "shared-non-success") {
      assert.fail("expected shared non-success");
    }
    assert.equal(result.sharedDailyState, state);
    assert.equal(result.checkView, null);
    assert.equal(result.checkCounts, null);
    assert.equal(result.session, null);
  }
});

test("shared-error initial state has no daily session or derived values", () => {
  assert.deepEqual(
    createHomeDailyInitialState(
      { mode: "shared-error", reason: "settings-query-failed" },
      durableItems,
    ),
    {
      mode: "shared-error",
      sharedDailyState: null,
      checkView: null,
      checkCounts: null,
      session: null,
    },
  );
});

test("canonical shared state can replace success and non-success without stale derived values", () => {
  const firstSuccess = successState();
  const firstDerived = deriveHomeSharedDailyState(firstSuccess);

  assert.equal(firstDerived.mode, "shared-success");
  assert.equal(firstDerived.session, firstSuccess.preparationSession);
  assert.equal(firstDerived.checkCounts[itemTemplateId], 1);

  const notFound: SharedDailyState = { status: "not_found", sessionDate };
  const nonSuccessDerived = deriveHomeSharedDailyState(notFound);

  assert.equal(nonSuccessDerived.mode, "shared-non-success");
  assert.equal(nonSuccessDerived.sharedDailyState, notFound);
  assert.equal(nonSuccessDerived.session, null);
  assert.equal(nonSuccessDerived.checkView, null);
  assert.equal(nonSuccessDerived.checkCounts, null);

  const nextSuccess = successState();
  nextSuccess.checkView.items[0] = {
    ...nextSuccess.checkView.items[0],
    observedQuantity: 2,
    isChecked: false,
    version: 8,
  };
  nextSuccess.preparationSession = {
    ...nextSuccess.preparationSession,
    checkedBy: "ママ",
  };
  const nextDerived = deriveHomeSharedDailyState(nextSuccess);

  assert.equal(nextDerived.mode, "shared-success");
  assert.equal(nextDerived.session, nextSuccess.preparationSession);
  assert.equal(nextDerived.checkCounts[itemTemplateId], 2);
  assert.equal(nextDerived.checkView.items[0].isChecked, false);
  assert.equal(nextDerived.checkView.items[0].version, 8);
});

test("shared prop sync ignores an unchanged initial prop but accepts new server state and mode changes", () => {
  const initial = successState();
  const initialKey = getHomeSharedDailyStateSyncKey(initial);

  const unchanged = getHomeSharedDailyPropSync(
    initialKey,
    sharedDataSource(initial),
  );
  assert.equal(unchanged.shouldSync, false);
  assert.equal(unchanged.state, initial);

  const serverReload = successState();
  serverReload.session = {
    ...serverReload.session,
    dailySessionId: "66666666-6666-4666-8666-666666666666",
    sessionDate: "2026-08-03",
  };
  serverReload.sessionDate = "2026-08-03";
  serverReload.checkView.items[0] = {
    ...serverReload.checkView.items[0],
    version: 8,
  };

  const reloaded = getHomeSharedDailyPropSync(
    initialKey,
    sharedDataSource(serverReload),
  );
  assert.equal(reloaded.shouldSync, true);
  assert.equal(reloaded.state, serverReload);
  assert.notEqual(reloaded.initialKey, initialKey);

  const local = getHomeSharedDailyPropSync(reloaded.initialKey, {
    mode: "local",
  });
  assert.deepEqual(local, {
    initialKey: null,
    state: null,
    shouldSync: true,
  });
  assert.equal(
    getHomeSharedDailyPropSync(null, { mode: "local" }).shouldSync,
    false,
  );
});

test("locker display items preserve shared checked metadata and local behavior", () => {
  const checked = successState().checkView;
  const uncheckedWithoutTemplate = {
    ...checked.items[0],
    id: dailyItemId,
    itemTemplateId: null,
    observedQuantity: 2,
    isChecked: false,
    version: 8,
  };
  const sharedItems = createHomeLockerItems({
    mode: "shared-success",
    checkView: { items: [checked.items[0], uncheckedWithoutTemplate] },
  });

  assert.deepEqual(sharedItems[0], {
    id: itemTemplateId,
    dailyItemId,
    itemTemplateId,
    dailyItemVersion: 7,
    isChecked: true,
    name: "着替え",
    unit: "枚",
    requiredCount: 3,
    shortageCount: 1,
  });
  assert.equal(sharedItems[1].id, dailyItemId);
  assert.equal(sharedItems[1].itemTemplateId, null);
  assert.equal(sharedItems[1].dailyItemVersion, 8);
  assert.equal(sharedItems[1].isChecked, false);
  assert.equal(sharedItems[1].shortageCount, 2);

  assert.deepEqual(
    createHomeLockerItems({
      mode: "local",
      items: durableItems,
      checkCounts: { [itemTemplateId]: 2 },
    }),
    [
      {
        id: itemTemplateId,
        name: "着替え",
        unit: "枚",
        requiredCount: 3,
        shortageCount: 2,
      },
    ],
  );
});

test("locker display derives only regular check items and keeps isChecked independent from isPrepared", () => {
  const session = dailySession();
  session.items[0] = {
    ...session.items[0],
    isChecked: false,
    isPrepared: true,
  };
  session.items.push({
    ...dailyItem(),
    dailyItemId: "77777777-7777-4777-8777-777777777777",
    itemTemplateId: "88888888-8888-4888-8888-888888888888",
    kind: "spot",
    observedQuantity: null,
    shortageCount: null,
    isChecked: true,
  });
  const checkView = mapDailySessionToCheckView(session);
  const items = createHomeLockerItems({
    mode: "shared-success",
    checkView,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].dailyItemId, dailyItemId);
  assert.equal(items[0].isChecked, false);
});

test("shared non-success has no locker fallback or complete-check action", () => {
  for (const state of nonSuccessStates()) {
    const derived = deriveHomeSharedDailyState(state);

    assert.equal(derived.mode, "shared-non-success");
    assert.deepEqual(
      createHomeLockerItems({ mode: "shared-non-success" }),
      [],
    );
    const actionState = {
      dailyMode: derived.mode,
      hasSession: derived.session !== null,
      hasCheckView: derived.checkView !== null,
      localHydrationReady: false,
    };
    assert.equal(canRenderHomeCompleteCheckAction(actionState), false);
    assert.equal(canRunHomeLocalCompleteCheck(actionState), false);
  }
});

test("only local mode permits local daily mutations", () => {
  assert.equal(canRunHomeLocalDailyMutation("local"), true);
  assert.equal(canRunHomeLocalDailyMutation("shared-success"), false);
  assert.equal(canRunHomeLocalDailyMutation("shared-non-success"), false);
  assert.equal(canRunHomeLocalDailyMutation("shared-error"), false);

  for (const state of nonSuccessStates()) {
    const derived = deriveHomeSharedDailyState(state);
    assert.equal(canRunHomeLocalDailyMutation(derived.mode), false);
  }
});

test("observed quantity capability includes only local and shared success", () => {
  assert.equal(canRunHomeObservedQuantityMutation("local"), true);
  assert.equal(canRunHomeObservedQuantityMutation("shared-success"), true);
  assert.equal(
    canRunHomeObservedQuantityMutation("shared-non-success"),
    false,
  );
  assert.equal(canRunHomeObservedQuantityMutation("shared-error"), false);

  for (const state of nonSuccessStates()) {
    const derived = deriveHomeSharedDailyState(state);
    assert.equal(canRunHomeObservedQuantityMutation(derived.mode), false);
    assert.equal(canRunHomeLocalDailyMutation(derived.mode), false);
  }
});

test("preparation item capability includes only local and shared success", () => {
  assert.equal(canRunHomePreparationItemMutation("local"), true);
  assert.equal(canRunHomePreparationItemMutation("shared-success"), true);
  assert.equal(canRunHomePreparationItemMutation("shared-non-success"), false);
  assert.equal(canRunHomePreparationItemMutation("shared-error"), false);

  for (const state of nonSuccessStates()) {
    const derived = deriveHomeSharedDailyState(state);
    assert.equal(canRunHomePreparationItemMutation(derived.mode), false);
    assert.equal(canRunHomeLocalDailyMutation(derived.mode), false);
  }
});

test("preparation bulk capability includes only local and shared success", () => {
  assert.equal(canRunHomePreparationBulkMutation("local"), true);
  assert.equal(canRunHomePreparationBulkMutation("shared-success"), true);
  assert.equal(canRunHomePreparationBulkMutation("shared-non-success"), false);
  assert.equal(canRunHomePreparationBulkMutation("shared-error"), false);
});

test("complete preparation capability includes only local and shared success", () => {
  assert.equal(canRunHomeCompletePreparationMutation("local"), true);
  assert.equal(canRunHomeCompletePreparationMutation("shared-success"), true);
  assert.equal(canRunHomeCompletePreparationMutation("shared-non-success"), false);
  assert.equal(canRunHomeCompletePreparationMutation("shared-error"), false);
});

test("complete check capability includes only local and shared success", () => {
  assert.equal(canRunHomeCompleteCheckMutation("local"), true);
  assert.equal(canRunHomeCompleteCheckMutation("shared-success"), true);
  assert.equal(canRunHomeCompleteCheckMutation("shared-non-success"), false);
  assert.equal(canRunHomeCompleteCheckMutation("shared-error"), false);
});

test("complete check navigation requires the actually applied session and current scope", () => {
  const state = successState();
  const navigation = {
    requestScopeKey: "scope-a",
    currentScopeKey: "scope-a",
    requestScopeGeneration: 3,
    currentScopeGeneration: 3,
    dailySessionId: state.session.dailySessionId,
    responseVersion: state.session.version,
    appliedSession: state.session,
  };
  assert.equal(canNavigateHomeAfterSharedCompleteCheck(state, navigation), true);
  assert.equal(
    canNavigateHomeAfterSharedCompleteCheck(state, {
      ...navigation,
      appliedSession: { ...state.session },
    }),
    false,
  );
  for (const invalid of [
    { ...navigation, currentScopeKey: "scope-b" },
    { ...navigation, currentScopeGeneration: 4 },
    { ...navigation, dailySessionId: dailyItemId },
    { ...navigation, responseVersion: state.session.version + 1 },
  ]) {
    assert.equal(canNavigateHomeAfterSharedCompleteCheck(state, invalid), false);
  }
  const uncheckedSession = {
    ...state.session,
    isChecked: false,
    checkedAt: null,
  };
  assert.equal(
    canNavigateHomeAfterSharedCompleteCheck(
      { ...state, session: uncheckedSession },
      { ...navigation, appliedSession: uncheckedSession },
    ),
    false,
  );
  assert.equal(canNavigateHomeAfterSharedCompleteCheck(null, navigation), false);
});

test("send thanks capability includes only local and shared success", () => {
  assert.equal(canRunHomeSendThanksMutation("local"), true);
  assert.equal(canRunHomeSendThanksMutation("shared-success"), true);
  assert.equal(canRunHomeSendThanksMutation("shared-non-success"), false);
  assert.equal(canRunHomeSendThanksMutation("shared-error"), false);
});

test("shared thanks self detection compares normalized member UUIDs", () => {
  const memberId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  assert.equal(
    isHomeSharedThanksSelf(memberId, memberId.toLowerCase()),
    true,
  );
  assert.equal(
    isHomeSharedThanksSelf(
      memberId,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ),
    false,
  );
  assert.equal(isHomeSharedThanksSelf(memberId, null), false);
});

test("shared thanks display distinguishes the sender and recipient", () => {
  const ownerMemberId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const memberMemberId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const memberSentThanks = {
    thanksSent: true,
    thanksSentByMemberId: memberMemberId,
    thanksReceivedByMemberId: ownerMemberId,
  };

  assert.equal(
    getHomeSharedThanksDisplay(memberMemberId.toUpperCase(), memberSentThanks),
    "sent",
  );
  assert.equal(
    getHomeSharedThanksDisplay(ownerMemberId, memberSentThanks),
    "received",
  );
  assert.equal(
    getHomeSharedThanksDisplay(ownerMemberId, {
      ...memberSentThanks,
      thanksSentByMemberId: ownerMemberId,
      thanksReceivedByMemberId: memberMemberId,
    }),
    "sent",
  );
  assert.equal(
    getHomeSharedThanksDisplay(memberMemberId, {
      ...memberSentThanks,
      thanksSentByMemberId: ownerMemberId,
      thanksReceivedByMemberId: memberMemberId,
    }),
    "received",
  );
  assert.equal(
    getHomeSharedThanksDisplay(memberMemberId, {
      ...memberSentThanks,
      thanksSent: false,
    }),
    null,
  );
  assert.equal(
    getHomeSharedThanksDisplay("cccccccc-cccc-4ccc-8ccc-cccccccccccc", memberSentThanks),
    null,
  );
});

test("daily item mutation errors are operation-specific, safe, and reloadable", () => {
  const conflict = getHomeDailyItemMutationErrorView(
    { status: "conflict", item: dailyItem() },
    "quantity",
  );
  assert.equal(conflict.canReload, true);
  assert.match(conflict.title, /他の端末/);

  const prepared = getHomeDailyItemMutationErrorView(
    { status: "invalid_state", reason: "session_prepared" },
    "prepared",
  );
  assert.match(prepared.title, /準備完了後/);
  assert.match(prepared.title, /準備状態/);
  assert.match(
    getHomeDailyItemMutationErrorView(
      { status: "client_error", error: { kind: "invalid_input", message: "x", issues: [] } },
      "deferred",
    ).title,
    /「あとで」の状態/,
  );

  const invalidResponse = getHomeDailyItemMutationErrorView(
    {
      status: "transport_error",
      error: {
        kind: "invalid_response",
        message: "internal update_daily_item failure",
        issues: [{ path: "familyId", code: familyId }],
      },
    },
    "quantity",
  );
  assert.equal(invalidResponse.canReload, true);
  assert.doesNotMatch(
    JSON.stringify(invalidResponse),
    /update_daily_item|familyId|11111111/,
  );

  const rpcError = getHomeDailyItemMutationErrorView(
    {
      status: "transport_error",
      error: { kind: "rpc_error", message: "internal network detail" },
    },
    "quantity",
  );
  assert.equal(rpcError.canReload, false);
  assert.match(rpcError.title, /通信/);
  assert.notEqual(rpcError.title, invalidResponse.title);

  assert.equal(
    getHomeDailyItemMutationErrorView({ status: "forbidden" }, "quantity")
      .canReload,
    false,
  );
  assert.equal(
    getHomeDailyItemMutationErrorView({ status: "not_found" }, "quantity")
      .canReload,
    true,
  );
  assert.match(
    getHomeDailyItemMutationErrorView(
      { status: "invalid_state" },
      "quantity",
    ).title,
    /現在の状態/,
  );

  const bulk = getHomeDailyItemMutationErrorView(
    {
      status: "not_found",
      requestedCount: 2,
      changedCount: 0,
      unchangedCount: 2,
    },
    "bulk_prepared",
  );
  assert.match(bulk.title, /対象のデータ/);
  const tooMany = getHomePreparationBulkTooManyItemsView();
  assert.equal(tooMany.canReload, false);
  assert.match(tooMany.body, /項目が多い/);
  assert.match(tooMany.body, /個別/);
  assert.doesNotMatch(JSON.stringify(tooMany), /100|RPC|DB|update_daily/);

  const incompleteCheck = getHomeDailyItemMutationErrorView(
    { status: "invalid_state", changed: false, reason: "daily_check_incomplete" },
    "complete_preparation",
  );
  const incompleteItems = getHomeDailyItemMutationErrorView(
    {
      status: "invalid_state",
      changed: false,
      reason: "preparation_items_incomplete",
    },
    "complete_preparation",
  );
  assert.match(incompleteCheck.body, /確認を完了/);
  assert.match(incompleteItems.body, /未完了の項目/);
  assert.doesNotMatch(
    JSON.stringify([incompleteCheck, incompleteItems]),
    /daily_check_incomplete|preparation_items_incomplete/,
  );
});

test("thanks mutation errors are safe and classify refresh availability", () => {
  for (const [reason, canReload] of [
    ["preparation_incomplete", true],
    ["recipient_missing", true],
    ["self_recipient", false],
    ["invalid_input", false],
  ] as const) {
    const view = getHomeDailyItemMutationErrorView(
      { status: "invalid_state", changed: false, reason },
      "send_thanks",
    );
    assert.equal(view.canReload, canReload);
    assert.doesNotMatch(JSON.stringify(view), new RegExp(reason));
  }
  const invalidResponse = getHomeDailyItemMutationErrorView(
    {
      status: "transport_error",
      error: {
        kind: "invalid_response",
        message: "send_daily_thanks leaked detail",
        issues: [{ path: familyId, code: "version_4" }],
      },
    },
    "send_thanks",
  );
  assert.equal(invalidResponse.canReload, true);
  assert.doesNotMatch(
    JSON.stringify(invalidResponse),
    /send_daily_thanks|11111111|version_4/,
  );
});

test("complete check errors are generic, safe, and refresh only when useful", () => {
  const conflict = getHomeDailyItemMutationErrorView(
    { status: "conflict", changed: false, session: dailySession() },
    "complete_check",
  );
  const invalidState = getHomeDailyItemMutationErrorView(
    { status: "invalid_state", changed: false },
    "complete_check",
  );
  const invalidInput = getHomeDailyItemMutationErrorView(
    {
      status: "client_error",
      error: {
        kind: "invalid_input",
        message: "complete_daily_check raw input",
        issues: [{ path: familyId, code: "version_4" }],
      },
    },
    "complete_check",
  );
  const invalidResponse = getHomeDailyItemMutationErrorView(
    {
      status: "transport_error",
      error: {
        kind: "invalid_response",
        message: "complete_daily_check raw response",
        issues: [{ path: familyId, code: "version_4" }],
      },
    },
    "complete_check",
  );
  assert.equal(conflict.canReload, true);
  assert.equal(invalidState.canReload, true);
  assert.equal(invalidInput.canReload, false);
  assert.equal(invalidResponse.canReload, true);
  assert.match(invalidState.title, /確認完了できる状態/);
  assert.match(invalidResponse.title, /確認結果を確認できません/);
  assert.doesNotMatch(
    JSON.stringify([conflict, invalidState, invalidInput, invalidResponse]),
    /complete_daily_check|11111111|version_4|invalid_state/,
  );
});

test("shared daily status views keep all six statuses distinct and user-safe", () => {
  const views = nonSuccessStates().map((state) => {
    assert.equal(isHomeSharedDailyDisplayState(state), true);
    if (!isHomeSharedDailyDisplayState(state)) {
      assert.fail("expected a displayable shared daily state");
    }

    const view = getHomeSharedDailyStatusView(state);
    assert.equal(view.status, state.status);
    assert.equal("error" in view, false);
    assert.doesNotMatch(JSON.stringify(view), /offline|familyId|invalid_uuid/);
    return view;
  });

  assert.equal(new Set(views.map((view) => view.status)).size, 6);
  assert.equal(new Set(views.map((view) => view.title)).size, 6);
  assert.equal(views.find((view) => view.status === "not_found")?.category, "business");
  assert.equal(views.find((view) => view.status === "forbidden")?.category, "business");
  assert.equal(views.find((view) => view.status === "invalid_state")?.category, "business");
  assert.equal(views.find((view) => view.status === "transport_error")?.category, "transport");
  assert.equal(views.find((view) => view.status === "invalid_response")?.category, "response");
  assert.equal(views.find((view) => view.status === "invalid_input")?.category, "input");
});

test("daily mutation controls propagate native disabled state", () => {
  assert.match(progressDotsSource, /disabled\?: boolean/);
  assert.equal(
    progressDotsSource.match(/disabled=\{disabled\}/g)?.length,
    2,
  );
  assert.match(preparationChecklistSource, /disabled\?: boolean/);
  assert.match(preparationChecklistSource, /itemActionsDisabled\?: boolean/);
  assert.match(preparationChecklistSource, /bulkActionDisabled\?: boolean/);
  assert.match(preparationChecklistSource, /completeActionDisabled\?: boolean/);
  assert.match(preparationChecklistSource, /disabledItemIds\?: ReadonlySet<string>/);
  assert.match(
    preparationChecklistSource,
    /onClick=\{onCheckAll\}[\s\S]*?disabled=\{disabled \|\| bulkActionDisabled\}/,
  );
  assert.match(
    preparationChecklistSource,
    /disabled=\{isItemActionDisabled \|\| item\.checked\}/,
  );
  assert.match(
    preparationChecklistSource,
    /disabled=\{disabled \|\| completeActionDisabled\}/,
  );
  assert.match(homeClientSource, /bulkActionDisabled=\{isPreparationBulkDisabled\}/);
  assert.match(
    homeClientSource,
    /sharedPreparationBulkPlan\?\.status !== "ready"[\s\S]*?hasInvalidSharedPreparationBulkItem[\s\S]*?isSharedPreparationBulkPending/,
  );
  assert.match(
    homeClientSource,
    /completeActionDisabled=\{[\s\S]*?canRunSharedCompletePreparation/,
  );
  assert.match(
    homeClientSource,
    /itemActionsDisabled=\{[\s\S]*?!canRunPreparationItemMutation[\s\S]*?isSharedSessionMutationPending/,
  );
  assert.match(
    homeClientSource,
    /disabled=\{[\s\S]*?!canRunObservedQuantityMutation[\s\S]*?isSharedSessionMutationPending/,
  );
  assert.match(
    homeClientSource,
    /disabledItemIds=\{disabledObservedQuantityItemIds\}/,
  );
  assert.match(shortageInputListSource, /item\.dailyItemId \?\? item\.id/);
  assert.match(homeClientSource, /dailyMode === "shared-non-success"/);
  assert.match(homeClientSource, /router\.refresh\(\)/);
  assert.doesNotMatch(homeClientSource, /window\.location\.reload\(\)/);
});

test("shared preparation handlers reuse the item lock and preserve local save boundaries", () => {
  const runnerSource = homeClientSource.slice(
    homeClientSource.indexOf("const runSharedDailyItemMutation = async"),
    homeClientSource.indexOf("const updateShortageCount = async"),
  );
  assert.match(
    runnerSource,
    /getCurrentSharedDailySession\(\)[\s\S]*?canonicalItem[\s\S]*?canonicalItem\?\.version !== input\.expectedVersion/,
  );
  assert.match(
    runnerSource,
    /pendingDailyItemMutationRequestsRef\.current\.has\(dailyItemId\)/,
  );
  assert.match(
    runnerSource,
    /pendingDailyItemMutationRequestsRef\.current\.set\(dailyItemId, requestToken\)/,
  );
  assert.match(
    runnerSource,
    /pendingDailyItemMutationRequestsRef\.current\.get\(dailyItemId\) ===[\s\S]*?requestToken/,
  );
  assert.match(runnerSource, /dailyItemMutationClientRef\.current/);
  assert.match(runnerSource, /updateDailyItem\([\s\S]*?input/);
  assert.match(
    runnerSource,
    /dailyItemMutationScopeKeyRef\.current !== requestScopeKey/,
  );
  assert.match(
    runnerSource,
    /dailyItemMutationScopeGenerationRef\.current !== requestScopeGeneration/,
  );
  assert.match(
    runnerSource,
    /result\.status === "success"[\s\S]*?setSharedDailyState\(\(current\) =>[\s\S]*?applyUpdatedItemToSharedDailyState/,
  );
  assert.doesNotMatch(runnerSource, /router\.refresh\(\)|appRepository/);

  const preparedHandlerSource = homeClientSource.slice(
    homeClientSource.indexOf("const togglePreparationItem = async"),
    homeClientSource.indexOf("const checkAllPreparationItems"),
  );
  assert.match(
    preparedHandlerSource,
    /dailyMode === "local"[\s\S]*?updateSession\(nextSession\)[\s\S]*?canRunPreparationItemMutation/,
  );
  assert.match(preparedHandlerSource, /action: "set_prepared"/);
  assert.match(preparedHandlerSource, /nextPrepared = !canonicalItem\.isPrepared/);
  assert.match(
    preparedHandlerSource,
    /isPreparedDailyItemMutationNoOp[\s\S]*?runSharedDailyItemMutation\(input, "prepared"\)/,
  );
  assert.equal(preparedHandlerSource.match(/updateSession\(/g)?.length, 1);
  assert.doesNotMatch(preparedHandlerSource, /savePreparationSession|localStorage/);

  const deferredHandlerSource = homeClientSource.slice(
    homeClientSource.indexOf("const togglePreparationItemLater = async"),
    homeClientSource.indexOf("const runSharedCompletePreparation = async"),
  );
  assert.match(
    deferredHandlerSource,
    /dailyMode === "local"[\s\S]*?checked: false,[\s\S]*?later: !item\.later[\s\S]*?updateSession\(nextSession\)/,
  );
  assert.match(deferredHandlerSource, /action: "set_deferred"/);
  assert.match(deferredHandlerSource, /nextDeferred = !canonicalItem\.isDeferred/);
  assert.match(
    deferredHandlerSource,
    /isDeferredDailyItemMutationNoOp[\s\S]*?runSharedDailyItemMutation\(input, "deferred"\)/,
  );
  assert.equal(deferredHandlerSource.match(/updateSession\(/g)?.length, 1);
  assert.doesNotMatch(deferredHandlerSource, /savePreparationSession|localStorage/);

  const batchRunnerSource = homeClientSource.slice(
    homeClientSource.indexOf(
      "const runSharedDailyPreparationItemsMutation = async",
    ),
    homeClientSource.indexOf("const updateShortageCount = async"),
  );
  assert.match(batchRunnerSource, /getCurrentSharedDailySession\(\)/);
  assert.match(batchRunnerSource, /getSharedPreparationBulkMutationPlan/);
  assert.match(batchRunnerSource, /plan\.status !== "ready"/);
  assert.match(
    batchRunnerSource,
    /targetIds\.some[\s\S]*pendingDailyItemMutationRequestsRef\.current\.has/,
  );
  assert.match(
    batchRunnerSource,
    /const requestToken = Symbol\("bulk-prepared"\)/,
  );
  assert.match(
    batchRunnerSource,
    /targetIds\.forEach[\s\S]*pendingDailyItemMutationRequestsRef\.current\.set/,
  );
  assert.match(batchRunnerSource, /updateDailyPreparationItems\(/);
  assert.match(batchRunnerSource, /applyUpdatedItemsToSharedDailyState/);
  assert.match(
    batchRunnerSource,
    /getHomeDailyItemMutationErrorView\(result, "bulk_prepared"\)/,
  );
  assert.match(
    batchRunnerSource,
    /pendingDailyItemMutationRequestsRef\.current\.get\(dailyItemId\) ===[\s\S]*requestToken/,
  );
  assert.doesNotMatch(
    batchRunnerSource,
    /router\.refresh|appRepository|savePreparationSession/,
  );

  const bulkHandlerSource = homeClientSource.slice(
    homeClientSource.indexOf("const checkAllPreparationItems"),
    homeClientSource.indexOf("const togglePreparationItemLater"),
  );
  assert.match(
    bulkHandlerSource,
    /dailyMode === "shared-success"[\s\S]*void runSharedDailyPreparationItemsMutation\(\)/,
  );
  assert.match(
    bulkHandlerSource,
    /dailyMode !== "local"[\s\S]*updateSession\(nextSession\)/,
  );
});

test("the same pending daily item set disables quantity and preparation controls", () => {
  assert.match(
    homeClientSource,
    /const disabledObservedQuantityItemIds = useMemo[\s\S]*?new Set\(pendingDailyItemMutationItemIds\)/,
  );
  assert.match(
    homeClientSource,
    /const disabledPreparationItemIds = useMemo[\s\S]*?new Set\(pendingDailyItemMutationItemIds\)/,
  );
  assert.match(
    homeClientSource,
    /disabledItemIds=\{disabledObservedQuantityItemIds\}/,
  );
  assert.match(
    homeClientSource,
    /disabledItemIds=\{disabledPreparationItemIds\}/,
  );
  assert.match(
    preparationChecklistSource,
    /const itemMutationId = item\.dailyItemId \?\? item\.id/,
  );
  assert.match(
    preparationChecklistSource,
    /disabledItemIds\.has\(itemMutationId\)/,
  );
  assert.match(
    preparationChecklistSource,
    /disabled=\{isItemActionDisabled\}[\s\S]*?disabled=\{isItemActionDisabled \|\| item\.checked\}/,
  );
});

test("completed shared quantity uses RPC then canonical load without a local fallback", () => {
  const runnerSource = homeClientSource.slice(
    homeClientSource.indexOf("const runSharedDailyItemMutation = async"),
    homeClientSource.indexOf("const runSharedDailyPreparationItemsMutation"),
  );
  assert.match(
    runnerSource,
    /result\.status === "success"[\s\S]*?operation === "quantity"[\s\S]*?input\.action === "set_observed_quantity"[\s\S]*?loadDailyData\([\s\S]*?applyQuantityReloadToSharedDailyState/,
  );
  assert.match(
    runnerSource,
    /pendingDailyItemMutationRequestsRef\.current\.get\(dailyItemId\) !==[\s\S]*?requestToken/,
  );
  assert.doesNotMatch(runnerSource, /appRepository|localStorage/);
  assert.match(
    homeClientSource,
    /disabled=\{[\s\S]*?!canRunObservedQuantityMutation[\s\S]*?isSharedSessionMutationPending/,
  );
});

test("preparation completion remains guarded and mutation errors render once across daily tabs", () => {
  assert.match(
    preparationChecklistSource,
    /useEffect\(\(\) => \{[\s\S]*?if \(disabled \|\| completeActionDisabled\)[\s\S]*?setIsConfirmOpen\(false\)/,
  );
  assert.match(
    preparationChecklistSource,
    /const confirmCompletion[\s\S]*?if \(disabled \|\| completeActionDisabled\)/,
  );
  assert.match(preparationChecklistSource, /completeActionPending/);
  assert.match(preparationChecklistSource, /completeActionPending[\s\S]*?"保存中"/);
  assert.match(
    preparationChecklistSource,
    /type="button"[\s\S]*?disabled=\{isItemActionDisabled\}/,
  );
  assert.equal(
    homeClientSource.match(
      /activeTab !== "settings" &&[\s\S]{0,100}dailyMode === "shared-success" &&[\s\S]{0,100}displayedDailyItemMutationError/g,
    )
      ?.length,
    1,
  );
  assert.equal(
    homeClientSource.match(/\{displayedDailyItemMutationError\.title\}/g)
      ?.length,
    1,
  );
});

test("shared completion uses session pending, full reload, and whole canonical replacement", () => {
  const completeSource = homeClientSource.slice(
    homeClientSource.indexOf("const runSharedCompletePreparation = async"),
    homeClientSource.indexOf("const sendThanks"),
  );
  const sharedSource = completeSource.slice(
    0,
    completeSource.indexOf("if (!canRunLocalDailyMutation || !session)"),
  );
  const localSource = completeSource.slice(sharedSource.length);
  assert.match(sharedSource, /getCurrentSharedDailySession\(\)/);
  assert.match(sharedSource, /pendingDailyItemMutationRequestsRef\.current\.size > 0/);
  assert.match(sharedSource, /sharedSessionMutationRequestRef\.current/);
  assert.match(sharedSource, /Symbol\("complete-preparation"\)/);
  assert.match(sharedSource, /completeDailyPreparation\(client, input\)/);
  assert.match(sharedSource, /await loadDailyData\(client/);
  assert.match(sharedSource, /setSharedDailyState\(\(current\) =>/);
  assert.match(sharedSource, /applyCompletedSessionToSharedDailyState/);
  assert.match(sharedSource, /dailyItemMutationScopeGenerationRef/);
  assert.match(sharedSource, /sharedSessionMutationRequestRef\.current\?\.token === requestToken/);
  assert.doesNotMatch(sharedSource, /router\.refresh\(\)|appRepository|updateSession\(/);
  assert.match(completeSource, /void runSharedCompletePreparation\(\)/);
  assert.match(localSource, /updateSession\(/);
  assert.match(localSource, /appRepository\.saveCheckCounts/);
  assert.match(localSource, /updateSpotAdditions/);
  assert.match(localSource, /updateSpotDeadlines/);
  assert.match(localSource, /updateTemporaryTodayOnlyItems/);
});

test("complete pending is a bidirectional item and batch mutation lock", () => {
  const singleRunner = homeClientSource.slice(
    homeClientSource.indexOf("const runSharedDailyItemMutation = async"),
    homeClientSource.indexOf("const runSharedDailyPreparationItemsMutation = async"),
  );
  const batchRunner = homeClientSource.slice(
    homeClientSource.indexOf("const runSharedDailyPreparationItemsMutation = async"),
    homeClientSource.indexOf("const updateShortageCount = async"),
  );
  assert.match(singleRunner, /if \(sharedSessionMutationRequestRef\.current\)/);
  assert.match(batchRunner, /if \(sharedSessionMutationRequestRef\.current\)/);
  const shortageInput = homeClientSource.slice(
    homeClientSource.indexOf("<ShortageInputList"),
    homeClientSource.indexOf("<ReusableCard", homeClientSource.indexOf("<ShortageInputList")),
  );
  assert.match(
    shortageInput,
    /disabled=\{[\s\S]*?!canRunObservedQuantityMutation[\s\S]*?isSharedSessionMutationPending/,
  );
  assert.doesNotMatch(
    shortageInput,
    /isSharedDailyPreparationCompleted|session\?\.completedAt/,
  );
  assert.match(
    homeClientSource,
    /itemActionsDisabled=\{[\s\S]{0,180}isSharedSessionMutationPending[\s\S]{0,180}isSharedDailyPreparationCompleted/,
  );
  assert.match(homeClientSource, /completeActionPending=\{isCompletePreparationPending\}/);
  assert.match(
    homeClientSource,
    /dailyMutationBrowserClientRef\.current \?\? createSupabaseClient\(\)/,
  );
});

test("shared complete check uses guarded session pending, full reload, and apply-confirmed navigation", () => {
  const sharedRunner = homeClientSource.slice(
    homeClientSource.indexOf("const runSharedCompleteCheck = async"),
    homeClientSource.indexOf("const completeCheck = ()"),
  );
  const completeHandler = homeClientSource.slice(
    homeClientSource.indexOf("const completeCheck = ()"),
    homeClientSource.indexOf("const togglePreparationItem"),
  );
  assert.match(sharedRunner, /getCurrentSharedDailySession\(\)/);
  assert.match(sharedRunner, /currentSharedSession\.isChecked/);
  assert.match(sharedRunner, /currentSharedSession\.checkedAt !== null/);
  assert.match(sharedRunner, /currentSharedSession\.isCompleted/);
  assert.match(sharedRunner, /currentSharedSession\.completedAt !== null/);
  assert.match(sharedRunner, /pendingDailyItemMutationRequestsRef\.current\.size > 0/);
  assert.match(sharedRunner, /sharedSessionMutationRequestRef\.current/);
  assert.doesNotMatch(
    sharedRunner.slice(0, sharedRunner.indexOf("const requestScopeKey")),
    /items\.length|isDeferred|shortageCount|observedQuantity/,
  );
  assert.match(sharedRunner, /operation: "complete_check"/);
  assert.match(sharedRunner, /Symbol\("complete-check"\)/);
  assert.match(sharedRunner, /scopeKey: requestScopeKey/);
  assert.match(sharedRunner, /generation: requestScopeGeneration/);
  assert.match(sharedRunner, /startVersion: currentSharedSession\.version/);
  assert.match(
    sharedRunner,
    /completeDailyCheck\(dailyCheckClientRef\.current, input\)/,
  );
  assert.match(
    sharedRunner,
    /await loadDailyData\(dailyPreparationItemsClientRef\.current/,
  );
  assert.match(sharedRunner, /applyCheckedSessionToSharedDailyState/);
  assert.match(sharedRunner, /nextState === currentSharedState/);
  assert.match(sharedRunner, /sharedCompleteCheckNavigationRequestRef\.current =/);
  assert.match(sharedRunner, /setSharedDailyState\(\(current\) =>/);
  assert.match(sharedRunner, /sharedSessionMutationRequestRef\.current !== request/);
  assert.match(sharedRunner, /sharedSessionMutationRequestRef\.current === request/);
  assert.match(sharedRunner, /title: "確認結果を確認できませんでした"/);
  assert.doesNotMatch(
    sharedRunner,
    /router\.refresh|appRepository|updateSession\(|ensure_daily_session|process_daily_carryovers/,
  );
  assert.match(
    completeHandler,
    /dailyMode === "shared-success"[\s\S]*?void runSharedCompleteCheck\(\)/,
  );
  assert.match(completeHandler, /appRepository\.createPreparationSession/);
  assert.match(completeHandler, /buildPreparationItems/);
  assert.match(completeHandler, /updateSession\(nextSession\)/);
  assert.match(completeHandler, /setActiveTab\("items"\)/);
});

test("complete check navigation and button wait for canonical apply", () => {
  const navigationEffect = homeClientSource.slice(
    homeClientSource.indexOf(
      "const navigation = sharedCompleteCheckNavigationRequestRef.current",
    ),
    homeClientSource.indexOf("roughStatesRef.current = roughStates"),
  );
  assert.match(navigationEffect, /canNavigateHomeAfterSharedCompleteCheck/);
  assert.match(navigationEffect, /currentScopeKey: dailyItemMutationScopeKeyRef\.current/);
  assert.match(
    navigationEffect,
    /currentScopeGeneration: dailyItemMutationScopeGenerationRef\.current/,
  );
  assert.match(navigationEffect, /appliedSession: navigation\.appliedSession/);
  assert.match(navigationEffect, /setActiveTab\("items"\)/);

  assert.match(homeClientSource, /sharedDailyState\.session\.version < 2_147_483_647/);
  assert.match(homeClientSource, /pendingDailyItemMutationItemIds\.size === 0/);
  assert.match(homeClientSource, /aria-busy=\{isCompleteCheckPending \|\| undefined\}/);
  assert.match(homeClientSource, /"✓ 確認済み"/);
  assert.match(homeClientSource, /"保存中…"/);
  assert.match(
    homeClientSource,
    /dailyMode === "local"[\s\S]{0,100}\? !canRunLocalCompleteCheck[\s\S]{0,100}: !canRunSharedCompleteCheck/,
  );
});

test("shared thanks uses a guarded session mutation, full reload, and canonical replacement", () => {
  const sharedRunner = homeClientSource.slice(
    homeClientSource.indexOf("const runSharedSendThanks = async"),
    homeClientSource.indexOf("const sendThanks = ()"),
  );
  const sendHandler = homeClientSource.slice(
    homeClientSource.indexOf("const sendThanks = ()"),
    homeClientSource.indexOf("const showZeroQuantityToast"),
  );
  assert.match(sharedRunner, /getCurrentSharedDailySession\(\)/);
  assert.match(
    sharedRunner,
    /isHomeSharedThanksSelf\(\s*dataSource\.currentMemberId,\s*currentSharedSession\.completedByMemberId,\s*\)/,
  );
  assert.match(sharedRunner, /pendingDailyItemMutationRequestsRef\.current\.size > 0/);
  assert.match(sharedRunner, /sharedSessionMutationRequestRef\.current/);
  assert.match(sharedRunner, /operation: "send_thanks"/);
  assert.match(sharedRunner, /scopeKey: requestScopeKey/);
  assert.match(sharedRunner, /generation: requestScopeGeneration/);
  assert.match(sharedRunner, /startVersion: currentSharedSession\.version/);
  assert.match(sharedRunner, /Symbol\("send-thanks"\)/);
  assert.match(sharedRunner, /sendDailyThanks\(dailyThanksClientRef\.current, input\)/);
  assert.match(sharedRunner, /await loadDailyData\(dailyPreparationItemsClientRef\.current/);
  assert.match(sharedRunner, /applyThanksSessionToSharedDailyState/);
  assert.match(sharedRunner, /responseSessionVersion: result\.session\.version/);
  assert.match(sharedRunner, /changed: result\.changed/);
  assert.match(sharedRunner, /sharedSessionMutationRequestRef\.current !== request/);
  assert.match(sharedRunner, /dailyItemMutationScopeGenerationRef\.current !== request\.generation/);
  assert.match(sharedRunner, /sharedSessionMutationRequestRef\.current === request/);
  assert.match(sharedRunner, /title: "送信結果を確認できませんでした"/);
  assert.doesNotMatch(sharedRunner, /router\.refresh|appRepository|updateSession\(/);
  assert.match(sendHandler, /dailyMode === "shared-success"[\s\S]*?void runSharedSendThanks\(\)/);
  assert.match(sendHandler, /thanksSent: !session\.thanksSent/);
  assert.match(sendHandler, /updateSession\(/);
});

test("thanks UI distinguishes received state, hides unsent self thanks, and disables pending sends", () => {
  assert.match(
    homeClientSource,
    /!sharedThanksSession\.thanksSent[\s\S]*?isHomeSharedThanksSelf\([\s\S]*?dataSource\.currentMemberId[\s\S]*?sharedThanksSession\.completedByMemberId/,
  );
  assert.match(
    homeClientSource,
    /sharedThanksSession\?\.thanksSent[\s\S]*?sharedThanksDisplay !== null[\s\S]*?!isUnsentSharedSelfThanks/,
  );
  assert.match(homeClientSource, /sharedThanksSession\.thanksSent \|\|/);
  assert.match(homeClientSource, /isSharedSessionMutationPending/);
  assert.match(homeClientSource, /aria-busy=\{isSendThanksPending \|\| undefined\}/);
  assert.match(homeClientSource, /"✓ ありがとう済み"/);
  assert.match(homeClientSource, /"✓ ありがとうが届きました"/);
  assert.match(homeClientSource, /"♡ ありがとう"/);
  assert.match(homeClientSource, /"送信中…"/);
});

test("session mutation generalization keeps check, complete, thanks, and delete mutually exclusive", () => {
  assert.match(
    homeClientSource,
    /type SharedSessionMutationOperation =\s*\| "complete_check"\s*\| "complete_preparation"\s*\| "send_thanks"\s*\| "delete_item"/,
  );
  assert.match(
    homeClientSource,
    /sharedSessionMutationPendingOperation === "complete_check"/,
  );
  assert.match(
    homeClientSource,
    /sharedSessionMutationPendingOperation === "complete_preparation"/,
  );
  assert.match(
    homeClientSource,
    /sharedSessionMutationPendingOperation === "send_thanks"/,
  );
  assert.match(
    homeClientSource,
    /sharedSessionMutationPendingOperation === "delete_item"/,
  );
  assert.match(
    homeClientSource,
    /sharedSessionMutationRequestRef\.current = null[\s\S]*?setSharedSessionMutationPendingOperation\(null\)/,
  );
  assert.equal(
    homeClientSource.match(/dailyMutationBrowserClientRef\.current \?\? createSupabaseClient\(\)/g)?.length,
    7,
  );
});

test("local daily save boundaries and template cleanup are mode guarded", () => {
  for (const handler of [
    "updateSession",
    "updateSpotAdditions",
    "updateSpotDeadlines",
    "updateTemporaryTodayOnlyItems",
  ]) {
    assert.match(
      homeClientSource,
      new RegExp(
        `const ${handler} = \\([\\s\\S]{0,160}if \\(!canRunLocalDailyMutation\\)`,
      ),
    );
  }

  assert.match(
    homeClientSource,
    /const updateShortageCount = async[\s\S]*?dailyMode === "local"[\s\S]*?appRepository\.saveCheckCounts/,
  );
  assert.match(
    homeClientSource,
    /const getCurrentSharedDailySession[\s\S]*?dailyMode !== "shared-success"[\s\S]*?const runSharedDailyItemMutation[\s\S]*?updateDailyItem\(/,
  );
  assert.match(
    homeClientSource,
    /pendingDailyItemMutationRequestsRef\.current\.has\(dailyItemId\)/,
  );
  assert.match(
    homeClientSource,
    /dailyItemMutationMountedRef\.current = true/,
  );
  assert.match(
    homeClientSource,
    /dailyItemMutationScopeGenerationRef\.current !== requestScopeGeneration/,
  );
  assert.match(
    homeClientSource,
    /result\.status === "success"[\s\S]*?applyUpdatedItemToSharedDailyState/,
  );
  const quantityHandlerSource = homeClientSource.slice(
    homeClientSource.indexOf("const updateShortageCount = async"),
    homeClientSource.indexOf("const toggleRoughState = async"),
  );
  const sharedQuantityBranchIndex = quantityHandlerSource.indexOf(
    "const currentSharedSession = getCurrentSharedDailySession()",
  );
  assert.notEqual(sharedQuantityBranchIndex, -1);
  assert.equal(
    quantityHandlerSource.match(/appRepository\.saveCheckCounts/g)?.length,
    1,
  );
  assert.ok(
    quantityHandlerSource.indexOf("appRepository.saveCheckCounts") <
      sharedQuantityBranchIndex,
  );
  assert.doesNotMatch(
    quantityHandlerSource.slice(sharedQuantityBranchIndex),
    /setShortageCounts|appRepository/,
  );
  assert.match(quantityHandlerSource, /runSharedDailyItemMutation\(input, "quantity"\)/);
  assert.doesNotMatch(quantityHandlerSource, /router\.refresh\(\)/);
  assert.match(
    homeClientSource,
    /displayedDailyItemMutationError\.canReload[\s\S]*?router\.refresh\(\)/,
  );

  assert.match(
    homeClientSource,
    /dataSource\.mode === "local" && category ===/,
  );
  assert.match(
    homeClientSource,
    /const applyCustomItemDeletion[\s\S]*?if \(saveLocalDailyCleanup\) \{[\s\S]*?saveCheckCounts[\s\S]*?saveSpotAdditions[\s\S]*?savePreparationSession[\s\S]*?saveSpotDeadlines/,
  );
  assert.match(
    homeClientSource,
    /appRepository\.saveCustomItems\(nextItems\);\s*applyCustomItemDeletion\(itemId, true\)/,
  );
});

test("shared durable deletion uses only the atomic RPC, reloads canonical daily data, and preserves local and ad-hoc boundaries", () => {
  assert.match(
    homeClientSource,
    /const runSharedCustomItemDelete = async[\s\S]*?getSharedDailyItemDeletionTarget\([\s\S]*?deleteDailyItem\([\s\S]*?loadDailyData\([\s\S]*?applyDeletedItemReloadToSharedDailyState\(/,
  );
  assert.match(
    homeClientSource,
    /expectedTemplateUpdatedAt: request\.templateUpdatedAt[\s\S]*?dailyItemId: request\.dailyItemId[\s\S]*?expectedDailyItemVersion: request\.dailyItemVersion/,
  );
  assert.match(
    homeClientSource,
    /let dailyItemId: string \| null = null;[\s\S]*?currentSharedState\?\.status === "not_found"/,
  );
  assert.match(
    homeClientSource,
    /const currentSharedState = sharedDailyStateRef\.current;[\s\S]*?request\.dailySessionId !== null &&[\s\S]*?request\.dailyItemId !== null &&[\s\S]*?result\.dailyItem\?\.dailySessionId/,
  );
  assert.match(homeClientSource, /loaded\.status !== "not_found"/);
  assert.match(
    homeClientSource,
    /sharedSessionMutationRequestRef\.current !== request[\s\S]*?dailyItemMutationScopeKeyRef\.current !== request\.scopeKey[\s\S]*?dailyItemMutationScopeGenerationRef\.current !== request\.generation/,
  );
  assert.match(
    homeClientSource,
    /customItemsRef\.current\.find\([\s\S]*?updatedAt !==\s*request\.templateUpdatedAt/,
  );
  assert.match(
    homeClientSource,
    /if \(sharedSessionMutationRequestRef\.current === request\)[\s\S]*?setSharedSessionMutationPendingOperation\(null\)/,
  );
  assert.match(
    homeClientSource,
    /const deleteToken = Symbol\(itemId\)[\s\S]*?\.set\(itemId, deleteToken\)[\s\S]*?\.get\(itemId\) === deleteToken[\s\S]*?\.delete\(itemId\)/,
  );
  assert.match(homeClientSource, /applyCustomItemDeletion\(itemId, false\)/);
  assert.doesNotMatch(homeClientSource, /saveSharedItemTemplateDelete/);
  assert.doesNotMatch(homeClientSource, /deleteDailyItem\([\s\S]{0,900}appRepository/);

  const localDeleteStart = homeClientSource.indexOf(
    "const deleteCustomItem = async",
  );
  const todayOnlyStart = homeClientSource.indexOf(
    "const toggleNewCustomItemWeekday",
  );
  const deleteSource = homeClientSource.slice(localDeleteStart, todayOnlyStart);
  assert.match(
    deleteSource,
    /dataSource\.mode === "shared"[\s\S]*?await runSharedCustomItemDelete\(itemId\);[\s\S]*?return;[\s\S]*?appRepository\.saveCustomItems/,
  );
  assert.doesNotMatch(deleteSource, /setSpotAdditions|setTemporaryTodayOnlyItems/);
  assert.match(
    homeClientSource,
    /disabled=\{[\s\S]*?isSharedSessionMutationPending[\s\S]*?isItemSettingsMutationPending[\s\S]*?\}[\s\S]*?aria-busy=\{isDeleteItemPending \|\| undefined\}/,
  );
});

test("shared durable deletion errors are classified into safe settings messages", () => {
  const conflict = getHomeDailyItemMutationErrorView(
    {
      status: "conflict",
      changed: false,
      template: {
        itemTemplateId: familyId,
        familyId,
        childId,
        isActive: true,
        updatedAt: "2026-08-05T00:00:00.000Z",
      },
      dailyItem: null,
    },
    "delete_item",
  );
  const completed = getHomeDailyItemMutationErrorView(
    {
      status: "invalid_state",
      changed: false,
      reason: "session_completed",
    },
    "delete_item",
  );
  const carryover = getHomeDailyItemMutationErrorView(
    {
      status: "invalid_state",
      changed: false,
      reason: "carryover_linked",
    },
    "delete_item",
  );
  const reloadFailure = getHomeDailyItemMutationErrorView(
    {
      status: "transport_error",
      error: {
        kind: "invalid_response",
        message: "delete_family_item_template_for_day raw",
        issues: [{ path: familyId, code: "version_3" }],
      },
    },
    "delete_item",
  );
  assert.equal(conflict.canReload, true);
  assert.equal(completed.canReload, false);
  assert.equal(carryover.canReload, false);
  assert.equal(reloadFailure.canReload, true);
  assert.doesNotMatch(
    JSON.stringify([conflict, completed, carryover, reloadFailure]),
    /delete_family_item_template_for_day|11111111|version_3|carryover_linked/,
  );
});

test("shared settings saves reload server updated_at tokens before later deletion", () => {
  assert.match(
    homeClientSource,
    /const reloadSharedDurableSettings = async[\s\S]*?loadSharedSettingsWithClient\([\s\S]*?setCustomItems\(loaded\.data\.customItems\)/,
  );
  assert.match(
    homeClientSource,
    /saveHomeCustomItemAdd\([\s\S]*?await reloadSharedDurableSettings\(\)/,
  );
  assert.match(
    homeClientSource,
    /saveHomeRoughState\([\s\S]*?await reloadSharedDurableSettings\(\)/,
  );
  assert.match(
    homeClientSource,
    /saveHomeCustomItemEdit\([\s\S]*?await reloadSharedDurableSettings\(\)/,
  );
  assert.match(
    homeClientSource,
    /saveHomeCustomItemSortOrder\([\s\S]*?await reloadSharedDurableSettings\(\)/,
  );
  assert.match(
    homeClientSource,
    /canApplyHomeSharedSettingsReload\([\s\S]*?requestSequence: reloadSequence[\s\S]*?currentSequence: sharedSettingsReloadSequenceRef\.current/,
  );
  assert.match(
    homeClientSource,
    /requestScopeGeneration,[\s\S]*?currentScopeGeneration: dailyItemMutationScopeGenerationRef\.current/,
  );
  assert.doesNotMatch(homeClientSource, /updatedAt: undefined/);
});

test("shared template edits use locked RPC clients, current tokens, and request guards", () => {
  assert.match(homeClientSource, /updateSharedItemTemplate\(/);
  assert.match(homeClientSource, /updateSharedRoughItemState\(/);
  assert.match(homeClientSource, /updateSharedSpotItemTemplate\(/);
  assert.match(
    homeClientSource,
    /customItemsRef\.current\.find\([\s\S]*?isDailyDataIsoDateTime\(currentItem\.updatedAt\)/,
  );
  assert.match(
    homeClientSource,
    /customItemEditStartTokenRef\.current\.updatedAt !== currentItem\.updatedAt/,
  );
  assert.match(
    homeClientSource,
    /isCurrentHomeSharedSettingsRequest\([\s\S]*?currentToken: settingsMutationInFlightItemIdsRef\.current\.get\(item\.id\)/,
  );
  assert.match(
    homeClientSource,
    /isCurrentHomeSharedSettingsRequest\([\s\S]*?currentToken: settingsMutationInFlightItemIdsRef\.current\.get\(itemId\)/,
  );
  assert.match(homeClientSource, /getSharedTemplateMutationErrorMessage\(/);
  assert.match(
    homeClientSource,
    /customItemAddInFlightRef\.current !== null \|\|[\s\S]*?customItemSortOrderSaveInFlightRef\.current !== null/,
  );
  assert.match(
    homeClientSource,
    /requestToken: addRequestToken[\s\S]*?requestScopeGeneration: addRequestScopeGeneration/,
  );
  assert.match(
    homeClientSource,
    /requestToken: sortRequestToken[\s\S]*?requestScopeGeneration: sortRequestScopeGeneration/,
  );
  assert.doesNotMatch(
    homeClientSource,
    /update_family_spot_item_template_weekdays/,
  );
});

test("shared success renders but cannot run the local complete-check action", () => {
  const derived = deriveHomeSharedDailyState(successState());
  const actionState = {
    dailyMode: derived.mode,
    hasSession: derived.session !== null,
    hasCheckView: derived.checkView !== null,
    localHydrationReady: false,
  };

  assert.equal(canRenderHomeCompleteCheckAction(actionState), true);
  assert.equal(canRunHomeLocalCompleteCheck(actionState), false);
});

test("local complete-check and automatic effects require current hydration", () => {
  const dataSource: HomeDataSource = { mode: "local" };
  const sourceKey = getHomeLocalDailySourceKey(dataSource);
  assert.equal(sourceKey, "local");
  if (!sourceKey) {
    assert.fail("expected local source key");
  }

  const idleAction = {
    dailyMode: "local" as const,
    hasSession: true,
    hasCheckView: false,
    localHydrationReady: false,
  };
  assert.equal(canRenderHomeCompleteCheckAction(idleAction), false);
  assert.equal(canRunHomeLocalCompleteCheck(idleAction), false);
  assert.equal(
    shouldRunHomeLocalDailyAutoEffects(
      dataSource,
      initialHomeLocalDailyHydrationState,
      sourceKey,
    ),
    false,
  );

  const loading = startHomeLocalDailyHydration(sourceKey, 1);
  const ready = completeHomeLocalDailyHydration(loading, sourceKey, 1);
  assert.equal(isHomeLocalDailyHydrationReady(ready, sourceKey), true);
  assert.equal(
    shouldRunHomeLocalDailyAutoEffects(dataSource, ready, sourceKey),
    true,
  );
  const readyAction = { ...idleAction, localHydrationReady: true };
  assert.equal(canRenderHomeCompleteCheckAction(readyAction), true);
  assert.equal(canRunHomeLocalCompleteCheck(readyAction), true);
});

test("local-shared-local round trip does not reuse ready hydration", () => {
  const localDataSource: HomeDataSource = { mode: "local" };
  const sharedData = sharedDataSource(successState());
  const sourceKey = getHomeLocalDailySourceKey(localDataSource)!;
  const firstReady = completeHomeLocalDailyHydration(
    startHomeLocalDailyHydration(sourceKey, 1),
    sourceKey,
    1,
  );
  assert.equal(
    shouldRunHomeLocalDailyAutoEffects(
      localDataSource,
      firstReady,
      sourceKey,
    ),
    true,
  );
  assert.equal(getHomeLocalDailySourceKey(sharedData), null);
  assert.equal(
    shouldRunHomeLocalDailyAutoEffects(sharedData, firstReady, null),
    false,
  );

  const secondMountHydration = initialHomeLocalDailyHydrationState;
  assert.equal(
    shouldRunHomeLocalDailyAutoEffects(
      localDataSource,
      secondMountHydration,
      sourceKey,
    ),
    false,
  );
  const secondLoading = startHomeLocalDailyHydration(sourceKey, 2);
  assert.equal(
    shouldRunHomeLocalDailyAutoEffects(
      localDataSource,
      secondLoading,
      sourceKey,
    ),
    false,
  );
  const secondReady = completeHomeLocalDailyHydration(
    secondLoading,
    sourceKey,
    2,
  );
  assert.equal(
    shouldRunHomeLocalDailyAutoEffects(
      localDataSource,
      secondReady,
      sourceKey,
    ),
    true,
  );
});

test("stale local hydration results cannot complete the current request", () => {
  const sourceKey = "local";
  const currentLoading = startHomeLocalDailyHydration(sourceKey, 2);

  assert.equal(
    canApplyHomeLocalDailyHydration(currentLoading, sourceKey, 1),
    false,
  );
  assert.equal(
    completeHomeLocalDailyHydration(currentLoading, sourceKey, 1),
    currentLoading,
  );
  assert.equal(
    canApplyHomeLocalDailyHydration(currentLoading, sourceKey, 2),
    true,
  );
  assert.deepEqual(
    completeHomeLocalDailyHydration(currentLoading, sourceKey, 2),
    { status: "ready", sourceKey, requestId: 2 },
  );
});

test("shared and shared-error never call a local daily repository", () => {
  let calls = 0;
  const repository = new Proxy(
    {},
    {
      get() {
        calls += 1;
        throw new Error("local daily repository must not be read");
      },
    },
  ) as Pick<
    AppRepository,
    | "loadCheckCounts"
    | "loadPreparationSession"
    | "loadTodayOnlyTemporaryItems"
    | "loadSpotAdditions"
    | "loadSpotDeadlines"
  >;

  for (const state of nonSuccessStates()) {
    assert.equal(
      loadHomeLocalDailyInitialState(
        sharedDataSource(state),
        repository,
        {},
      ),
      null,
    );
  }
  assert.equal(
    loadHomeLocalDailyInitialState(
      { mode: "shared-error", reason: "settings-query-failed" },
      repository,
      {},
    ),
    null,
  );
  assert.equal(calls, 0);
});
