import assert from "node:assert/strict";
import test from "node:test";
import {
  getDailyItemPreparationCount,
  isDailyItemVisibleInPreparation,
  mapDailySessionToCheckView,
  mapDailySessionToPreparationSession,
} from "../src/lib/family-sharing/daily-data-view";
import type { DailyItem, DailySession } from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const templateId = "44444444-4444-4444-8444-444444444444";
let nextItemNumber = 0;

function dailyItem(overrides: Partial<DailyItem> = {}): DailyItem {
  nextItemNumber += 1;
  const suffix = nextItemNumber.toString(16).padStart(12, "0");
  return {
    dailyItemId: `55555555-5555-4555-8555-${suffix}`,
    dailySessionId: sessionId,
    familyId,
    itemTemplateId: templateId,
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
    isCarryover: false,
    carryoverPendingShortageCount: null,
    carriedFromDailyItemId: null,
    carryoverProcessedAt: null,
    carryoverResolvedAt: null,
    dueDate: null,
    sortOrder: 0,
    version: 4,
    deletedAt: null,
    updatedByMemberId: null,
    updatedByUserId: null,
    updatedByDisplayName: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:05:00.000Z",
    ...overrides,
  };
}

function dailySession(
  items: DailyItem[],
  overrides: Partial<DailySession> = {},
): DailySession {
  return {
    dailySessionId: sessionId,
    familyId,
    childId,
    sessionDate: "2026-07-29",
    version: 2,
    isChecked: true,
    checkedAt: "2026-07-29T00:05:00.000Z",
    checkedByMemberId: null,
    checkedByUserId: null,
    checkedByDisplayName: "パパ",
    isCompleted: true,
    completedAt: "2026-07-29T01:00:00.000Z",
    completedByMemberId: null,
    completedByUserId: null,
    completedByDisplayName: "パパ",
    thanksSent: true,
    thanksSentAt: "2026-07-29T01:05:00.000Z",
    thanksSentByMemberId: null,
    thanksSentByUserId: null,
    thanksSentByDisplayName: "パパ",
    thanksReceivedByMemberId: null,
    thanksReceivedByUserId: null,
    thanksReceivedByDisplayName: null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T01:05:00.000Z",
    items,
    ...overrides,
  };
}

test("maps template identity and shared metadata without confusing daily IDs", () => {
  const templateItem = dailyItem();
  const adHocItem = dailyItem({
    itemTemplateId: null,
    kind: "spot",
    isAdHoc: true,
    requiredQuantity: 2,
    shortageCount: null,
    observedQuantity: null,
    isChecked: false,
    dueDate: "2026-08-01",
    version: 7,
  });
  const mapped = mapDailySessionToPreparationSession(
    dailySession([templateItem, adHocItem]),
  );

  assert.equal(mapped.items[0].id, templateId);
  assert.equal(mapped.items[0].dailyItemId, templateItem.dailyItemId);
  assert.equal(mapped.items[0].dailyItemVersion, 4);
  assert.equal(mapped.items[0].dailyKind, "regular");
  assert.equal(mapped.items[1].id, adHocItem.dailyItemId);
  assert.equal(mapped.items[1].dailyItemId, adHocItem.dailyItemId);
  assert.equal(mapped.items[1].itemTemplateId, null);
  assert.equal(mapped.items[1].dailyItemVersion, 7);
  assert.equal(mapped.items[1].dueDate, "2026-08-01");
});

test("maps prepared and deferred state while ignoring check-screen state", () => {
  const items = [
    dailyItem({
      isChecked: true,
      isPrepared: false,
      isDeferred: true,
    }),
    dailyItem({
      isChecked: false,
      isPrepared: true,
      isDeferred: false,
    }),
  ];
  const mapped = mapDailySessionToPreparationSession(dailySession(items));

  assert.equal(mapped.items.length, 2);
  assert.deepEqual(
    mapped.items.map((item) => ({
      checked: item.checked,
      later: item.later,
    })),
    [
      { checked: false, later: true },
      { checked: true, later: false },
    ],
  );
});

test("uses SQL-compatible regular shortage and carryover counts", () => {
  const currentShortage = dailyItem({
    shortageCount: 2,
    carryoverPendingShortageCount: 5,
  });
  const derivedShortage = dailyItem({
    requiredQuantity: 4,
    observedQuantity: 1,
    shortageCount: null,
    carryoverPendingShortageCount: 2,
  });
  const nullObserved = dailyItem({
    requiredQuantity: 3,
    observedQuantity: null,
    shortageCount: null,
  });
  const noShortage = dailyItem({
    requiredQuantity: 3,
    observedQuantity: 3,
    shortageCount: 0,
    carryoverPendingShortageCount: 0,
  });

  assert.equal(getDailyItemPreparationCount(currentShortage), 5);
  assert.equal(getDailyItemPreparationCount(derivedShortage), 3);
  assert.equal(getDailyItemPreparationCount(nullObserved), 3);
  assert.equal(isDailyItemVisibleInPreparation(noShortage), false);
  assert.deepEqual(
    mapDailySessionToPreparationSession(
      dailySession([
        currentShortage,
        derivedShortage,
        nullObserved,
        noShortage,
      ]),
    ).items.map((item) => item.count),
    [5, 3, 3],
  );
});

test("applies spot visibility, count, due date, and source mapping", () => {
  const visible = dailyItem({
    itemTemplateId: null,
    kind: "spot",
    isAdHoc: true,
    requiredQuantity: 2,
    isChecked: false,
    dueDate: "2026-08-02",
  });
  const zero = dailyItem({
    kind: "spot",
    requiredQuantity: 0,
    isChecked: false,
  });
  const mapped = mapDailySessionToPreparationSession(
    dailySession([visible, zero]),
  );

  assert.equal(mapped.items.length, 1);
  assert.equal(mapped.items[0].id, visible.dailyItemId);
  assert.equal(mapped.items[0].count, 2);
  assert.equal(mapped.items[0].source, "spot");
  assert.equal(mapped.items[0].dueDate, "2026-08-02");
});

test("applies rough refill and carryover visibility", () => {
  const refill = dailyItem({
    kind: "rough",
    roughState: "refill",
    requiredQuantity: 2,
  });
  const enough = dailyItem({
    kind: "rough",
    roughState: "enough",
    requiredQuantity: 2,
  });
  const low = dailyItem({
    kind: "rough",
    roughState: "low",
    requiredQuantity: 2,
  });
  const zero = dailyItem({
    kind: "rough",
    roughState: "refill",
    requiredQuantity: 0,
  });
  const carryover = dailyItem({
    kind: "rough",
    roughState: "enough",
    requiredQuantity: 1,
    isCarryover: true,
  });
  const mapped = mapDailySessionToPreparationSession(
    dailySession([refill, enough, low, zero, carryover]),
  );

  assert.deepEqual(
    mapped.items.map((item) => ({
      id: item.dailyItemId,
      count: item.count,
      source: item.source,
      carryover: item.carryover,
    })),
    [
      {
        id: refill.dailyItemId,
        count: 2,
        source: "stock",
        carryover: false,
      },
      {
        id: carryover.dailyItemId,
        count: 1,
        source: "stock",
        carryover: true,
      },
    ],
  );
});

test("maps session fields, actor fallback, and preserves item order and input", () => {
  const first = dailyItem({ name: "first", sortOrder: 20 });
  const second = dailyItem({ name: "second", sortOrder: -10 });
  const session = dailySession([first, second], {
    checkedByDisplayName: null,
  });
  const before = structuredClone(session);

  const mapped = mapDailySessionToPreparationSession(session);

  assert.equal(mapped.date, "2026-07-29");
  assert.equal(mapped.confirmedAt, "2026-07-29T00:05:00.000Z");
  assert.equal(mapped.checkedBy, "");
  assert.equal(mapped.completedAt, "2026-07-29T01:00:00.000Z");
  assert.equal(mapped.thanksSent, true);
  assert.deepEqual(
    mapped.items.map((item) => item.name),
    ["first", "second"],
  );
  assert.deepEqual(session, before);
});

test("maps only regular confirmation items using observed quantity", () => {
  const regular = dailyItem({
    requiredQuantity: 5,
    observedQuantity: 4,
    shortageCount: 1,
    isChecked: false,
    version: 9,
  });
  const spot = dailyItem({ kind: "spot", requiredQuantity: 2 });
  const rough = dailyItem({
    kind: "rough",
    roughState: "refill",
    requiredQuantity: 2,
  });
  const zeroRegular = dailyItem({
    kind: "regular",
    requiredQuantity: 0,
    observedQuantity: 0,
    shortageCount: 0,
  });

  const view = mapDailySessionToCheckView(
    dailySession([regular, spot, rough, zeroRegular]),
  );

  assert.deepEqual(view.items, [
    {
      id: templateId,
      dailyItemId: regular.dailyItemId,
      itemTemplateId: templateId,
      version: 9,
      name: "着替え",
      unit: "枚",
      requiredQuantity: 5,
      observedQuantity: 4,
      isChecked: false,
    },
  ]);
});
