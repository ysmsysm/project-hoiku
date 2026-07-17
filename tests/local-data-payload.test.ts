import assert from "node:assert/strict";
import test from "node:test";
import { defaultCustomItems } from "../src/data/defaultCustomItems";
import {
  prepareFamilySharingLocalDataFromStorage,
  type FamilySharingRawStorage,
} from "../src/lib/family-sharing/local-data-payload";
import {
  buildStartFamilyDataSharingPayload,
  type FamilySharingLocalData,
  type StartFamilyDataSharingPayload,
  validateStartFamilyDataSharingPayload,
} from "../src/lib/family-sharing/start-payload";

const validRawStorage = (): FamilySharingRawStorage => ({
  childProfile: JSON.stringify({
    name: "はる",
    iconType: "image",
    iconId: "default-baby",
    iconUrl: "https://example.com/child.png",
    birthday: null,
    photoUrl: "https://example.com/child.png",
  }),
  customItems: JSON.stringify([
    {
      id: "regular-shirt",
      name: "シャツ",
      unit: "枚",
      count: 3,
      category: "持ち物",
      weekdays: [],
    },
    {
      id: "spot-letter",
      name: "おたより",
      unit: "枚",
      count: 1,
      category: "スポット追加",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
    {
      id: "rough-diaper",
      name: "おむつ",
      unit: "パック",
      count: 1,
      category: "ざっくり管理",
      weekdays: [],
    },
  ]),
  roughStates: JSON.stringify({
    "rough-diaper": "補充",
  }),
});

const validPayload = (): StartFamilyDataSharingPayload => ({
  child: {
    name: "はる",
    iconType: "default",
    iconId: "default-baby",
    iconUrl: null,
  },
  items: [
    {
      localId: "regular-shirt",
      name: "シャツ",
      category: "持ち物",
      count: 3,
      unit: "枚",
      weekdays: [],
      sortOrder: 0,
      roughState: null,
    },
    {
      localId: "spot-letter",
      name: "おたより",
      category: "スポット追加",
      count: 1,
      unit: "枚",
      weekdays: [1],
      sortOrder: 1,
      roughState: null,
    },
    {
      localId: "rough-diaper",
      name: "おむつ",
      category: "ざっくり管理",
      count: 1,
      unit: "パック",
      weekdays: [],
      sortOrder: 2,
      roughState: "十分",
    },
  ],
});

const assertInvalidPayload = (payload: unknown, expectedCode: string) => {
  const result = validateStartFamilyDataSharingPayload(payload);
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(
      result.issues.some((issue) => issue.code === expectedCode),
      true,
    );
  }
};

test("builds a start_family_data_sharing payload from durable local settings", () => {
  const localData: FamilySharingLocalData & Record<string, unknown> = {
    child: {
      name: "  はる  ",
      iconType: "image",
      iconId: "default-baby",
      iconUrl: "https://example.com/child.png",
      birthday: "2024-04-01",
      photoUrl: "https://example.com/child.png",
    },
    items: [
      {
        id: "regular-shirt",
        name: "シャツ",
        unit: "枚",
        count: 3,
        category: "持ち物",
        weekdays: [1],
      },
      {
        id: "spot-letter",
        name: "おたより",
        unit: "枚",
        count: 1,
        category: "スポット追加",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      },
      {
        id: "rough-diaper",
        name: "おむつ",
        unit: "パック",
        count: 1,
        category: "ざっくり管理",
      },
    ],
    roughStates: {
      "rough-diaper": "補充",
    },
    preparationSession: {
      checkedBy: "ママ",
      confirmedAt: "2026-07-12T00:00:00.000Z",
      completedAt: "2026-07-12T00:00:00.000Z",
      thanksSent: true,
      items: [
        {
          id: "regular-shirt",
          name: "シャツ",
          unit: "枚",
          count: 1,
          checked: true,
          later: true,
          carryover: true,
        },
      ],
    },
    spotAdditions: [{ itemId: "spot-letter", dueDate: "2026-07-13" }],
  };
  const before = structuredClone(localData);

  const payload = buildStartFamilyDataSharingPayload(localData);

  assert.deepEqual(payload, {
    child: {
      name: "はる",
      iconType: "image",
      iconId: "default-baby",
      iconUrl: "https://example.com/child.png",
    },
    items: [
      {
        localId: "regular-shirt",
        name: "シャツ",
        category: "持ち物",
        count: 3,
        unit: "枚",
        weekdays: [],
        sortOrder: 0,
        roughState: null,
      },
      {
        localId: "spot-letter",
        name: "おたより",
        category: "スポット追加",
        count: 1,
        unit: "枚",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        sortOrder: 1,
        roughState: null,
      },
      {
        localId: "rough-diaper",
        name: "おむつ",
        category: "ざっくり管理",
        count: 1,
        unit: "パック",
        weekdays: [],
        sortOrder: 2,
        roughState: "補充",
      },
    ],
  });
  assert.equal(JSON.stringify(payload).includes("thanksSent"), false);
  assert.equal(JSON.stringify(payload).includes("later"), false);
  assert.equal(JSON.stringify(payload).includes("carryover"), false);
  assert.equal(JSON.stringify(payload).includes("checked"), false);
  assert.equal(JSON.stringify(payload).includes("dueDate"), false);
  assert.deepEqual(localData, before);
});

test("builds a valid payload when there are no item templates", () => {
  const payload = buildStartFamilyDataSharingPayload({
    child: {
      name: "そうた",
      iconType: "default",
      iconId: "default-baby",
      iconUrl: null,
      birthday: null,
      photoUrl: null,
    },
    items: [],
    roughStates: {},
  });

  assert.deepEqual(payload, {
    child: {
      name: "そうた",
      iconType: "default",
      iconId: "default-baby",
      iconUrl: null,
    },
    items: [],
  });
});

test("reads saved local data and prepares the displayed child name", () => {
  const prepared = prepareFamilySharingLocalDataFromStorage(validRawStorage());

  assert.equal(prepared.ok, true);
  assert.equal(prepared.childName, "はる");
  assert.deepEqual(prepared.storageStatus, {
    childProfile: "saved",
    customItems: "saved",
    roughStates: "saved",
  });

  if (prepared.ok) {
    assert.equal(prepared.payload.child.name, prepared.childName);
    assert.deepEqual(prepared.payload.items[1].weekdays, [
      0, 1, 2, 3, 4, 5, 6,
    ]);
    assert.deepEqual(validateStartFamilyDataSharingPayload(prepared.payload), {
      ok: true,
    });
  }
});

test("uses default settings when local data has not been saved", () => {
  const prepared = prepareFamilySharingLocalDataFromStorage({
    childProfile: null,
    customItems: null,
    roughStates: null,
  });

  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.storageStatus, {
    childProfile: "missing",
    customItems: "missing",
    roughStates: "missing",
  });
  assert.deepEqual(prepared.missingDefaultLabels, [
    "子ども設定",
    "持ち物設定",
    "ざっくり管理の状態",
  ]);

  if (prepared.ok) {
    assert.equal(prepared.payload.child.name, "そうた");
    assert.equal(prepared.payload.items.length, defaultCustomItems.length);
    assert.deepEqual(validateStartFamilyDataSharingPayload(prepared.payload), {
      ok: true,
    });
  }
});

test("treats broken JSON as invalid without silently using defaults", () => {
  const prepared = prepareFamilySharingLocalDataFromStorage({
    ...validRawStorage(),
    customItems: "{broken",
  });

  assert.equal(prepared.ok, false);
  assert.equal(prepared.storageStatus.customItems, "invalid");
  assert.equal("payload" in prepared, false);
});

test("treats structurally invalid saved data as invalid", () => {
  const prepared = prepareFamilySharingLocalDataFromStorage({
    ...validRawStorage(),
    customItems: JSON.stringify({ id: "not-an-array" }),
  });

  assert.equal(prepared.ok, false);
  assert.equal(prepared.storageStatus.customItems, "invalid");
  assert.equal("payload" in prepared, false);
});

test("validates child name length and required value", () => {
  assertInvalidPayload(
    { ...validPayload(), child: { ...validPayload().child, name: " " } },
    "invalid_child_name",
  );
  assertInvalidPayload(
    {
      ...validPayload(),
      child: { ...validPayload().child, name: "123456789" },
    },
    "invalid_child_name",
  );
});

test("validates item count boundaries", () => {
  const twoHundredItems = Array.from({ length: 200 }, (_, index) => ({
    localId: `item-${index}`,
    name: `item-${index}`,
    category: "持ち物",
    count: 0,
    unit: "枚",
    weekdays: [],
    sortOrder: index,
    roughState: null,
  }));
  assert.deepEqual(
    validateStartFamilyDataSharingPayload({
      ...validPayload(),
      items: twoHundredItems,
    }),
    { ok: true },
  );

  assertInvalidPayload(
    {
      ...validPayload(),
      items: [
        ...twoHundredItems,
        {
          localId: "item-200",
          name: "item-200",
          category: "持ち物",
          count: 0,
          unit: "枚",
          weekdays: [],
          sortOrder: 200,
          roughState: null,
        },
      ],
    },
    "invalid_items_count",
  );
});

test("detects duplicate local ids and invalid categories", () => {
  const duplicateLocalIdPayload = validPayload();
  duplicateLocalIdPayload.items[1] = {
    ...duplicateLocalIdPayload.items[1],
    localId: "regular-shirt",
  };
  assertInvalidPayload(duplicateLocalIdPayload, "duplicate_item_local_id");

  const invalidCategoryPayload = validPayload();
  invalidCategoryPayload.items[0] = {
    ...invalidCategoryPayload.items[0],
    category: "不正" as never,
  };
  assertInvalidPayload(invalidCategoryPayload, "invalid_item_category");
});

test("detects invalid weekdays", () => {
  const invalidWeekdayPayload = validPayload();
  invalidWeekdayPayload.items[1] = {
    ...invalidWeekdayPayload.items[1],
    weekdays: [7],
  };
  assertInvalidPayload(invalidWeekdayPayload, "invalid_item_weekday");

  const tooManyWeekdaysPayload = validPayload();
  tooManyWeekdaysPayload.items[1] = {
    ...tooManyWeekdaysPayload.items[1],
    weekdays: [0, 1, 2, 3, 4, 5, 6, 0],
  };
  assertInvalidPayload(tooManyWeekdaysPayload, "invalid_item_weekdays");

  const duplicateWeekdayPayload = validPayload();
  duplicateWeekdayPayload.items[1] = {
    ...duplicateWeekdayPayload.items[1],
    weekdays: [1, 1],
  };
  assertInvalidPayload(duplicateWeekdayPayload, "duplicate_item_weekday");
});

test("detects invalid rough states and counts", () => {
  const invalidRoughStatePayload = validPayload();
  invalidRoughStatePayload.items[2] = {
    ...invalidRoughStatePayload.items[2],
    roughState: "不正" as never,
  };
  assertInvalidPayload(invalidRoughStatePayload, "invalid_item_rough_state");

  const invalidCountPayload = validPayload();
  invalidCountPayload.items[1] = {
    ...invalidCountPayload.items[1],
    count: 0,
  };
  assertInvalidPayload(invalidCountPayload, "invalid_item_count");
});
