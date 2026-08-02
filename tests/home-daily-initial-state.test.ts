import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canApplyHomeLocalDailyHydration,
  canRenderHomeCompleteCheckAction,
  canRunHomeLocalCompleteCheck,
  canRunHomeLocalDailyMutation,
  canRunHomeObservedQuantityMutation,
  completeHomeLocalDailyHydration,
  createHomeLockerItems,
  createHomeDailyInitialState,
  deriveHomeSharedDailyState,
  getHomeLocalDailySourceKey,
  getHomeObservedQuantityMutationErrorView,
  getHomeSharedDailyStatusView,
  getHomeSharedDailyPropSync,
  getHomeSharedDailyStateSyncKey,
  initialHomeLocalDailyHydrationState,
  isHomeLocalDailyHydrationReady,
  isHomeSharedDailyDisplayState,
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

test("observed quantity mutation errors are user-safe and reloadable when needed", () => {
  const conflict = getHomeObservedQuantityMutationErrorView({
    status: "conflict",
    item: dailyItem(),
  });
  assert.equal(conflict.canReload, true);
  assert.match(conflict.title, /他の端末/);

  const prepared = getHomeObservedQuantityMutationErrorView({
    status: "invalid_state",
    reason: "session_prepared",
  });
  assert.match(prepared.title, /準備完了後/);

  const invalidResponse = getHomeObservedQuantityMutationErrorView({
    status: "transport_error",
    error: {
      kind: "invalid_response",
      message: "internal update_daily_item failure",
      issues: [{ path: "familyId", code: familyId }],
    },
  });
  assert.equal(invalidResponse.canReload, true);
  assert.doesNotMatch(
    JSON.stringify(invalidResponse),
    /update_daily_item|familyId|11111111/,
  );

  const rpcError = getHomeObservedQuantityMutationErrorView({
    status: "transport_error",
    error: { kind: "rpc_error", message: "internal network detail" },
  });
  assert.equal(rpcError.canReload, false);
  assert.match(rpcError.title, /通信/);
  assert.notEqual(rpcError.title, invalidResponse.title);

  assert.equal(
    getHomeObservedQuantityMutationErrorView({ status: "forbidden" })
      .canReload,
    false,
  );
  assert.equal(
    getHomeObservedQuantityMutationErrorView({ status: "not_found" })
      .canReload,
    true,
  );
  assert.match(
    getHomeObservedQuantityMutationErrorView({
      status: "invalid_state",
    }).title,
    /現在の状態/,
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
  assert.match(
    preparationChecklistSource,
    /onClick=\{onCheckAll\}[\s\S]*?disabled=\{disabled\}/,
  );
  assert.match(
    preparationChecklistSource,
    /disabled=\{disabled \|\| item\.checked\}/,
  );
  assert.match(homeClientSource, /disabled=\{!canRunLocalDailyMutation\}/);
  assert.match(
    homeClientSource,
    /disabled=\{!canRunObservedQuantityMutation\}/,
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
    /dailyMode !== "shared-success"[\s\S]*?updateDailyItem\(/,
  );
  assert.match(
    homeClientSource,
    /pendingObservedQuantityRequestsRef\.current\.has\(dailyItemId\)/,
  );
  assert.match(
    homeClientSource,
    /observedQuantityMountedRef\.current = true/,
  );
  assert.match(
    homeClientSource,
    /observedQuantityScopeGenerationRef\.current !== requestScopeGeneration/,
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
    'dailyMode !== "shared-success"',
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
  assert.equal(quantityHandlerSource.match(/updateDailyItem\(/g)?.length, 1);
  assert.doesNotMatch(quantityHandlerSource, /router\.refresh\(\)/);
  assert.match(
    homeClientSource,
    /observedQuantityMutationError\.canReload[\s\S]*?router\.refresh\(\)/,
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
    /applyCustomItemDeletion\(itemId, dataSource\.mode === "local"\)/,
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
