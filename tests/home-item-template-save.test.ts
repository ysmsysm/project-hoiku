import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyHomeRoughStateChange,
  appendHomeCustomItemToCategory,
  canInterruptHomeCustomItemSorting,
  canUpdateHomeCustomItemDragPointer,
  getHomeCustomItemDragCenterY,
  getHomeCustomItemDragTargetIndex,
  reorderHomeCustomItemsInCategory,
  saveHomeCustomItemAdd,
  saveHomeCustomItemDelete,
  saveHomeCustomItemEdit,
  saveHomeCustomItemSortOrder,
  saveHomeRoughState,
} from "../src/lib/home-item-template-save";
import { defaultCustomItems } from "../src/data/defaultCustomItems";
import type { HomeDataSource } from "../src/lib/home-data-source";
import type { SharedSettingsAppData } from "../src/lib/family-sharing/shared-settings";
import type { CustomizableItem } from "../src/types/preparation";

const regularUuid = "11111111-1111-4111-8111-111111111111";
const roughUuid = "22222222-2222-4222-8222-222222222222";
const regularCategory = defaultCustomItems[0].category;
const spotCategory = defaultCustomItems[6].category;
const roughCategory = defaultCustomItems[9].category;
const dragRowRects = [
  { top: 0, height: 56 },
  { top: 56, height: 56 },
  { top: 112, height: 56 },
  { top: 168, height: 56 },
];
const fiveDragItems: CustomizableItem[] = [
  { id: "A", name: "A", unit: "unit", count: 1, category: regularCategory },
  { id: "B", name: "B", unit: "unit", count: 1, category: regularCategory },
  { id: "C", name: "C", unit: "unit", count: 1, category: regularCategory },
  { id: "D", name: "D", unit: "unit", count: 1, category: regularCategory },
  { id: "E", name: "E", unit: "unit", count: 1, category: regularCategory },
];
const homeClientSource = readFileSync("app/HomeClient.tsx", "utf8");

const customItems: CustomizableItem[] = [
  {
    id: "template-regular",
    name: "Shirt",
    unit: "pcs",
    count: 3,
    category: "持ち物",
  },
];

const nextCustomItems: CustomizableItem[] = [
  {
    ...customItems[0],
    name: "Towel",
    count: 4,
  },
];

const sharedInitialData: SharedSettingsAppData = {
  childId: "child-1",
  childProfile: {
    name: "Sota",
    iconType: "default",
    iconId: "default-baby",
    iconUrl: null,
    birthday: null,
    photoUrl: null,
  },
  customItems,
  roughStates: {
    "template-rough": "十分",
  },
};

test("appends a new item at the end of its category", () => {
  const items: CustomizableItem[] = [
    { id: "regular-1", name: "A", unit: "枚", count: 1, category: "持ち物" },
    { id: "regular-2", name: "B", unit: "枚", count: 1, category: "持ち物" },
    { id: "spot-1", name: "C", unit: "個", count: 1, category: "スポット追加" },
    { id: "rough-1", name: "D", unit: "pack", count: 1, category: "ざっくり管理" },
  ];
  const added: CustomizableItem = {
    id: "regular-new",
    name: "New",
    unit: "枚",
    count: 2,
    category: "持ち物",
    weekdays: [],
  };

  assert.deepEqual(
    appendHomeCustomItemToCategory(items, added).map((item) => item.id),
    ["regular-1", "regular-2", "regular-new", "spot-1", "rough-1"],
  );
});

test("appends only the saved item to the latest items without reverting concurrent changes", () => {
  const savedItem: CustomizableItem = {
    id: regularUuid,
    name: "Saved",
    unit: "枚",
    count: 1,
    category: "持ち物",
    weekdays: [],
  };
  const latestItems: CustomizableItem[] = [
    {
      id: "regular-1",
      name: "Edited while saving",
      unit: "枚",
      count: 3,
      category: "持ち物",
    },
    {
      id: "concurrent-item",
      name: "Added while saving",
      unit: "枚",
      count: 1,
      category: "持ち物",
    },
  ];

  assert.deepEqual(appendHomeCustomItemToCategory(latestItems, savedItem), [
    ...latestItems,
    savedItem,
  ]);
});

test("reorders only items in the selected category", () => {
  const items: CustomizableItem[] = [
    { id: "regular-1", name: "A", unit: "unit", count: 1, category: regularCategory },
    { id: "regular-2", name: "B", unit: "unit", count: 1, category: regularCategory },
    { id: "spot-1", name: "C", unit: "unit", count: 1, category: spotCategory },
    { id: "spot-2", name: "D", unit: "unit", count: 1, category: spotCategory },
    { id: "rough-1", name: "E", unit: "pack", count: 1, category: roughCategory },
  ];

  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      items,
      spotCategory,
      "spot-2",
      0,
    ).map((item) => item.id),
    ["regular-1", "regular-2", "spot-2", "spot-1", "rough-1"],
  );
  assert.equal(
    reorderHomeCustomItemsInCategory(
      items,
      spotCategory,
      "regular-1",
      0,
    ),
    items,
  );
});

test("calculates one-step drag insertion targets", () => {
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 86,
      rowRects: dragRowRects,
      currentTargetIndex: 1,
      lastMoveDirection: null,
    }),
    2,
  );
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 82,
      rowRects: dragRowRects,
      currentTargetIndex: 2,
      lastMoveDirection: null,
    }),
    1,
  );
});

test("calculates multi-step drag insertion targets without limiting jumps", () => {
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 210,
      rowRects: dragRowRects,
      currentTargetIndex: 1,
      lastMoveDirection: null,
    }),
    4,
  );
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 20,
      rowRects: dragRowRects,
      currentTargetIndex: 3,
      lastMoveDirection: null,
    }),
    0,
  );
});

test("calculates first, last, and unchanged drag insertion targets", () => {
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: -20,
      rowRects: dragRowRects,
      currentTargetIndex: 2,
      lastMoveDirection: null,
    }),
    0,
  );
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 260,
      rowRects: dragRowRects,
      currentTargetIndex: 2,
      lastMoveDirection: null,
    }),
    4,
  );
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 80,
      rowRects: dragRowRects,
      currentTargetIndex: 1,
      lastMoveDirection: null,
    }),
    1,
  );
});

test("keeps drag insertion targets inside the available range", () => {
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 260,
      rowRects: dragRowRects,
      currentTargetIndex: 99,
      lastMoveDirection: null,
    }),
    4,
  );
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: -20,
      rowRects: dragRowRects,
      currentTargetIndex: -10,
      lastMoveDirection: null,
    }),
    0,
  );
});

test("keeps a drag target from reversing on small upward jitter after moving down", () => {
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 80,
      rowRects: dragRowRects,
      currentTargetIndex: 2,
      lastMoveDirection: "down",
    }),
    2,
  );
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 77,
      rowRects: dragRowRects,
      currentTargetIndex: 2,
      lastMoveDirection: "down",
    }),
    1,
  );
});

test("keeps a drag target from reversing on small downward jitter after moving up", () => {
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 88,
      rowRects: dragRowRects,
      currentTargetIndex: 1,
      lastMoveDirection: "up",
    }),
    1,
  );
  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: 91,
      rowRects: dragRowRects,
      currentTargetIndex: 1,
      lastMoveDirection: "up",
    }),
    2,
  );
});

test("uses the dragged row center so downward movement works from an upper grab point", () => {
  const rowRectsWithoutB = [
    { top: 0, height: 56 },
    { top: 112, height: 56 },
    { top: 168, height: 56 },
    { top: 224, height: 56 },
  ];
  const pointerOffsetY = 4;
  const rowHeight = 56;
  const belowCGrabY = 117;
  const belowCIndex = getHomeCustomItemDragTargetIndex({
    pointerY: getHomeCustomItemDragCenterY({
      pointerY: belowCGrabY,
      pointerOffsetY,
      rowHeight,
    }),
    rowRects: rowRectsWithoutB,
    currentTargetIndex: 1,
    lastMoveDirection: null,
  });

  assert.equal(
    getHomeCustomItemDragTargetIndex({
      pointerY: belowCGrabY,
      rowRects: rowRectsWithoutB,
      currentTargetIndex: 1,
      lastMoveDirection: null,
    }),
    1,
  );
  assert.equal(belowCIndex, 2);
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "B",
      belowCIndex,
    ).map((item) => item.id),
    ["A", "C", "B", "D", "E"],
  );
});

test("calculates downward insertion targets against the actual DOM row positions", () => {
  const rowRectsWithoutB = [
    { top: 0, height: 56 },
    { top: 112, height: 56 },
    { top: 168, height: 56 },
    { top: 224, height: 56 },
  ];
  const pointerOffsetY = 4;
  const rowHeight = 56;
  const dragCenterY = (pointerY: number) =>
    getHomeCustomItemDragCenterY({ pointerY, pointerOffsetY, rowHeight });

  const belowCIndex = getHomeCustomItemDragTargetIndex({
    pointerY: dragCenterY(117),
    rowRects: rowRectsWithoutB,
    currentTargetIndex: 1,
    lastMoveDirection: null,
  });
  const belowDIndex = getHomeCustomItemDragTargetIndex({
    pointerY: dragCenterY(173),
    rowRects: rowRectsWithoutB,
    currentTargetIndex: belowCIndex,
    lastMoveDirection: "down",
  });
  const belowEIndex = getHomeCustomItemDragTargetIndex({
    pointerY: dragCenterY(229),
    rowRects: rowRectsWithoutB,
    currentTargetIndex: belowDIndex,
    lastMoveDirection: "down",
  });

  assert.equal(belowCIndex, 2);
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "B",
      belowCIndex,
    ).map((item) => item.id),
    ["A", "C", "B", "D", "E"],
  );
  assert.equal(belowDIndex, 3);
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "B",
      belowDIndex,
    ).map((item) => item.id),
    ["A", "C", "D", "B", "E"],
  );
  assert.equal(belowEIndex, 4);
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "B",
      belowEIndex,
    ).map((item) => item.id),
    ["A", "C", "D", "E", "B"],
  );
});

test("continues the same downward drag when pointer moves arrive from another row after reordering", () => {
  const rowRectsWithoutB = [
    { top: 0, height: 56 },
    { top: 112, height: 56 },
    { top: 168, height: 56 },
    { top: 224, height: 56 },
  ];
  const pointerOffsetY = 4;
  const rowHeight = 56;
  let previousTargetIndex = 1;
  let lastMoveDirection: "down" | "up" | null = null;
  let items = fiveDragItems;

  assert.equal(
    canUpdateHomeCustomItemDragPointer({
      activeCategory: regularCategory,
      activePointerId: 7,
      eventCategory: regularCategory,
      eventPointerId: 7,
    }),
    true,
  );
  assert.equal(
    canUpdateHomeCustomItemDragPointer({
      activeCategory: regularCategory,
      activePointerId: 7,
      eventCategory: spotCategory,
      eventPointerId: 7,
    }),
    false,
  );

  [117, 173, 229].forEach((pointerY) => {
    const nextTargetIndex = getHomeCustomItemDragTargetIndex({
      pointerY: getHomeCustomItemDragCenterY({
        pointerY,
        pointerOffsetY,
        rowHeight,
      }),
      rowRects: rowRectsWithoutB,
      currentTargetIndex: previousTargetIndex,
      lastMoveDirection,
    });

    assert.equal(nextTargetIndex > previousTargetIndex, true);
    lastMoveDirection = nextTargetIndex > previousTargetIndex ? "down" : "up";
    previousTargetIndex = nextTargetIndex;
    items = reorderHomeCustomItemsInCategory(
      items,
      regularCategory,
      "B",
      nextTargetIndex,
    );
  });

  assert.equal(previousTargetIndex, 4);
  assert.equal(lastMoveDirection, "down");
  assert.deepEqual(
    items.map((item) => item.id),
    ["A", "C", "D", "E", "B"],
  );
});

test("reorders five items through one-step, multi-row, and edge insert indexes", () => {
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "D",
      2,
    ).map((item) => item.id),
    ["A", "B", "D", "C", "E"],
  );
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "D",
      1,
    ).map((item) => item.id),
    ["A", "D", "B", "C", "E"],
  );
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "A",
      3,
    ).map((item) => item.id),
    ["B", "C", "D", "A", "E"],
  );
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "B",
      4,
    ).map((item) => item.id),
    ["A", "C", "D", "E", "B"],
  );
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "D",
      0,
    ).map((item) => item.id),
    ["D", "A", "B", "C", "E"],
  );
  assert.deepEqual(
    reorderHomeCustomItemsInCategory(
      fiveDragItems,
      regularCategory,
      "E",
      0,
    ).map((item) => item.id),
    ["E", "A", "B", "C", "D"],
  );
});

test("home client uses stable item tracking and RAF for custom item dragging", () => {
  assert.match(homeClientSource, /getHomeCustomItemDragTargetIndex\(\{/);
  assert.match(homeClientSource, /canUpdateHomeCustomItemDragPointer\(\{/);
  assert.match(homeClientSource, /activeCustomItemDragTargetRef/);
  assert.match(homeClientSource, /activeCategory: dragTarget\.category/);
  assert.match(homeClientSource, /eventCategory: item\.category/);
  assert.match(homeClientSource, /window\.requestAnimationFrame/);
});

test("home client clears custom item drag state on pointer up and cancel", () => {
  assert.match(homeClientSource, /onPointerUp=\{finishCustomItemDrag\}/);
  assert.match(homeClientSource, /onPointerCancel=\{finishCustomItemDrag\}/);
  assert.match(homeClientSource, /window\.cancelAnimationFrame/);
  assert.match(homeClientSource, /activeCustomItemDragTargetRef\.current = null/);
  assert.match(homeClientSource, /setCustomItemDragState\(null\)/);
});

test("blocks sort-discarding item settings actions while sort order is saving", () => {
  const guardedActions = [
    "back",
    "close-settings",
    "toggle-child-settings",
    "start-other-category",
    "start-other-sort",
    "start-editing",
  ];

  assert.equal(canInterruptHomeCustomItemSorting(false), true);
  guardedActions.forEach(() => {
    assert.equal(canInterruptHomeCustomItemSorting(true), false);
  });
});

test("adds a rough state key without replacing existing state changes", () => {
  assert.deepEqual(
    applyHomeRoughStateChange(
      { existing: "補充", concurrent: "少ない" },
      roughUuid,
      "十分",
    ),
    {
      existing: "補充",
      concurrent: "少ない",
      [roughUuid]: "十分",
    },
  );
});

test("local item add saves the full category-tail array with a local id", async () => {
  const calls: string[] = [];
  const savedItems: CustomizableItem[][] = [];

  const result = await saveHomeCustomItemAdd(
    { mode: "local" },
    [
      { id: "regular-1", name: "A", unit: "枚", count: 1, category: "持ち物" },
      { id: "spot-1", name: "B", unit: "個", count: 1, category: "スポット追加" },
    ],
    {},
    { name: "Towel", count: 2, unit: "枚", category: "持ち物", weekdays: [] },
    "十分",
    {
      createLocalItemId: () => "custom-123",
      saveLocalCustomItems: (items) => {
        calls.push("local-items");
        savedItems.push(items);
      },
      saveLocalRoughStates: () => calls.push("local-rough"),
      saveSharedItemTemplateAdd: async () => {
        calls.push("shared");
        return { id: "unexpected", sortOrder: 0 };
      },
    },
  );

  assert.equal(result.item.id, "custom-123");
  assert.equal(result.initialRoughState, null);
  assert.deepEqual(savedItems[0].map((item) => item.id), [
    "regular-1",
    "custom-123",
    "spot-1",
  ]);
  assert.deepEqual(calls, ["local-items"]);
});

test("local rough and spot adds keep rough state and spot weekdays storage", async () => {
  const savedItems: CustomizableItem[][] = [];
  const savedRoughStates: Array<Record<string, string>> = [];
  const dependencies = {
    createLocalItemId: () => `custom-${savedItems.length + 1}`,
    saveLocalCustomItems: (items: CustomizableItem[]) => savedItems.push(items),
    saveLocalRoughStates: (states: Record<string, string>) =>
      savedRoughStates.push(states),
    saveSharedItemTemplateAdd: async () => {
      throw new Error("shared path should not be called");
    },
  };

  const roughResult = await saveHomeCustomItemAdd(
    { mode: "local" },
    [],
    { existing: "少ない" },
    {
      name: "Diapers",
      count: 1,
      unit: "pack",
      category: "ざっくり管理",
      weekdays: [],
    },
    "十分",
    dependencies,
  );
  assert.equal(roughResult.initialRoughState, "十分");
  assert.deepEqual(savedRoughStates[0], {
    existing: "少ない",
    "custom-1": "十分",
  });

  const spotResult = await saveHomeCustomItemAdd(
    { mode: "local" },
    savedItems[0],
    savedRoughStates[0],
    {
      name: "Blanket",
      count: 1,
      unit: "個",
      category: "スポット追加",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
    "十分",
    dependencies,
  );
  assert.deepEqual(spotResult.item.weekdays, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    savedItems[1].find((item) => item.id === "custom-2")?.weekdays,
    [0, 1, 2, 3, 4, 5, 6],
  );
});

test("local item adds accept quantity and rough unit write limits", async () => {
  const calls: string[] = [];
  const dependencies = {
    createLocalItemId: () => "custom-limit",
    saveLocalCustomItems: () => calls.push("local-items"),
    saveLocalRoughStates: () => calls.push("local-rough"),
    saveSharedItemTemplateAdd: async () => {
      calls.push("shared");
      return { id: regularUuid, sortOrder: 0 };
    },
  };

  await saveHomeCustomItemAdd(
    { mode: "local" },
    [],
    {},
    {
      name: "Limit",
      count: 5,
      unit: "u".repeat(10),
      category: "ざっくり管理",
      weekdays: [],
    },
    "十分",
    dependencies,
  );
  assert.deepEqual(calls, ["local-items", "local-rough"]);
});

test("local item adds reject invalid quantity and rough unit before persistence", async () => {
  for (const input of [
    { count: -1, unit: "pack" },
    { count: 1.5, unit: "pack" },
    { count: 6, unit: "pack" },
    { count: 10, unit: "pack" },
    { count: 11, unit: "pack" },
    { count: 999, unit: "pack" },
    { count: 1000, unit: "pack" },
    { count: 1, unit: "u".repeat(11) },
  ]) {
    const calls: string[] = [];
    await assert.rejects(
      saveHomeCustomItemAdd(
        { mode: "local" },
        [],
        {},
        {
          name: "Invalid",
          count: input.count,
          unit: input.unit,
          category: "ざっくり管理",
          weekdays: [],
        },
        "十分",
        {
          createLocalItemId: () => "custom-invalid",
          saveLocalCustomItems: () => calls.push("local-items"),
          saveLocalRoughStates: () => calls.push("local-rough"),
          saveSharedItemTemplateAdd: async () => {
            calls.push("shared");
            return { id: regularUuid, sortOrder: 0 };
          },
        },
      ),
      /invalid_home_/,
    );
    assert.deepEqual(calls, []);
  }
});

test("shared regular add uses Supabase and returns the database UUID", async () => {
  const calls: string[] = [];

  const result = await saveHomeCustomItemAdd(
    sharedDataSource(),
    customItems,
    {},
    { name: "Towel", count: 2, unit: "枚", category: "持ち物", weekdays: [] },
    "十分",
    {
      createLocalItemId: () => "unexpected-local-id",
      saveLocalCustomItems: () => calls.push("local-items"),
      saveLocalRoughStates: () => calls.push("local-rough"),
      saveSharedItemTemplateAdd: async (input) => {
        calls.push(JSON.stringify(input));
        return { id: regularUuid, sortOrder: 9 };
      },
    },
  );

  assert.equal(result.item.id, regularUuid);
  assert.equal(result.initialRoughState, null);
  assert.deepEqual(result.item, {
    id: regularUuid,
    name: "Towel",
    unit: "枚",
    count: 2,
    category: "持ち物",
    weekdays: [],
  });
  assert.deepEqual(JSON.parse(calls[0]), {
    familyId: "family-1",
    childId: "child-1",
    kind: "regular",
    name: "Towel",
    defaultQuantity: 2,
    unit: "枚",
    currentRoughState: null,
  });
  assert.equal(calls.length, 1);
});

test("shared rough add saves enough in the same insert and prepares both states with one UUID", async () => {
  const calls: string[] = [];
  const result = await saveHomeCustomItemAdd(
    sharedDataSource(),
    customItems,
    { "existing-rough": "少ない" },
    {
      name: "Diapers",
      count: 1,
      unit: "pack",
      category: "ざっくり管理",
      weekdays: [],
    },
    "十分",
    {
      createLocalItemId: () => "unexpected-local-id",
      saveLocalCustomItems: () => calls.push("local-items"),
      saveLocalRoughStates: () => calls.push("local-rough"),
      saveSharedItemTemplateAdd: async (input) => {
        calls.push(JSON.stringify(input));
        return { id: roughUuid, sortOrder: 10 };
      },
    },
  );

  assert.equal(result.item.id, roughUuid);
  assert.equal(result.initialRoughState, "十分");
  assert.deepEqual(JSON.parse(calls[0]), {
    familyId: "family-1",
    childId: "child-1",
    kind: "rough",
    name: "Diapers",
    defaultQuantity: 1,
    unit: "pack",
    currentRoughState: "enough",
  });
  assert.equal(calls.length, 1);
});

test("shared spot add sends weekdays and uses the RPC UUID without local persistence", async () => {
  const calls: string[] = [];
  const spotUuid = "44444444-4444-4444-8444-444444444444";

  const result = await saveHomeCustomItemAdd(
    sharedDataSource(),
    customItems,
    { "existing-rough": "少ない" },
    {
      name: "Water bottle",
      count: 0,
      unit: "個",
      category: "スポット追加",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
    "十分",
    {
      createLocalItemId: () => "unexpected-local-id",
      saveLocalCustomItems: () => calls.push("local-items"),
      saveLocalRoughStates: () => calls.push("local-rough"),
      saveSharedItemTemplateAdd: async (input) => {
        calls.push(JSON.stringify(input));
        return { id: spotUuid, sortOrder: 11 };
      },
    },
  );

  assert.deepEqual(result, {
    item: {
      id: spotUuid,
      name: "Water bottle",
      unit: "個",
      count: 0,
      category: "スポット追加",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
    initialRoughState: null,
  });
  assert.deepEqual(JSON.parse(calls[0]), {
    familyId: "family-1",
    childId: "child-1",
    kind: "spot",
    name: "Water bottle",
    defaultQuantity: 0,
    unit: "個",
    currentRoughState: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  assert.equal(calls.length, 1);
});

test("shared item add does not use local storage or return success when Supabase fails", async () => {
  const calls: string[] = [];
  const error = new Error("insert failed");

  await assert.rejects(
    saveHomeCustomItemAdd(
      sharedDataSource(),
      customItems,
      {},
      { name: "Towel", count: 2, unit: "枚", category: "持ち物", weekdays: [] },
      "十分",
      {
        createLocalItemId: () => "unexpected-local-id",
        saveLocalCustomItems: () => calls.push("local-items"),
        saveLocalRoughStates: () => calls.push("local-rough"),
        saveSharedItemTemplateAdd: async () => {
          calls.push("shared");
          throw error;
        },
      },
    ),
    error,
  );

  assert.deepEqual(calls, ["shared"]);
});

test("shared spot add with seven weekdays does not fall back to local storage when Supabase fails", async () => {
  const calls: string[] = [];
  const error = new Error("spot insert failed");

  await assert.rejects(
    saveHomeCustomItemAdd(
      sharedDataSource(),
      customItems,
      {},
      {
        name: "Water bottle",
        count: 0,
        unit: "個",
        category: "スポット追加",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      },
      "十分",
      {
        createLocalItemId: () => "unexpected-local-id",
        saveLocalCustomItems: () => calls.push("local-items"),
        saveLocalRoughStates: () => calls.push("local-rough"),
        saveSharedItemTemplateAdd: async (input) => {
          calls.push(JSON.stringify(input));
          throw error;
        },
      },
    ),
    error,
  );

  assert.deepEqual(JSON.parse(calls[0]), {
    familyId: "family-1",
    childId: "child-1",
    kind: "spot",
    name: "Water bottle",
    defaultQuantity: 0,
    unit: "個",
    currentRoughState: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  assert.equal(calls.length, 1);
});

test("local item edit save uses existing local storage path and then applies state", async () => {
  const calls: string[] = [];
  const limitItems = nextCustomItems.map((item) => ({
    ...item,
    count: 5,
    unit: "u".repeat(10),
  }));

  await saveHomeCustomItemEdit(
    { mode: "local" },
    "template-regular",
    limitItems,
    { name: "Towel", count: 5, unit: "u".repeat(10) },
    {
      applyCustomItems: () => calls.push("apply"),
      saveLocalCustomItems: () => calls.push("local"),
      saveSharedItemTemplateEdit: async () => {
        calls.push("shared");
      },
    },
  );

  assert.deepEqual(calls, ["local", "apply"]);
});

test("shared item edit save uses Supabase path and then applies state", async () => {
  const calls: string[] = [];

  await saveHomeCustomItemEdit(
    sharedDataSource(),
    "template-regular",
    nextCustomItems,
    { name: "Towel", count: 5, unit: "u".repeat(10) },
    {
      applyCustomItems: () => calls.push("apply"),
      saveLocalCustomItems: () => calls.push("local"),
      saveSharedItemTemplateEdit: async (input) => {
        calls.push(
          `${input.familyId}:${input.childId}:${input.itemId}:${input.changes.name}`,
        );
      },
    },
  );

  assert.deepEqual(calls, ["family-1:child-1:template-regular:Towel", "apply"]);
});

test("local and shared item edits reject invalid write values without applying state", async () => {
  for (const dataSource of [{ mode: "local" } as const, sharedDataSource()]) {
    for (const changes of [
      { count: -1 },
      { count: 1.5 },
      { count: 6 },
      { count: 10 },
      { count: 11 },
      { count: 999 },
      { count: 1000 },
      { unit: "u".repeat(11) },
    ]) {
      const calls: string[] = [];
      await assert.rejects(
        saveHomeCustomItemEdit(
          dataSource,
          "template-regular",
          nextCustomItems,
          changes,
          {
            applyCustomItems: () => calls.push("apply"),
            saveLocalCustomItems: () => calls.push("local"),
            saveSharedItemTemplateEdit: async () => {
              calls.push("shared");
            },
          },
        ),
        /invalid_home_/,
      );
      assert.deepEqual(calls, []);
    }
  }
});

test("shared item edit save does not apply state or local fallback when Supabase fails", async () => {
  const calls: string[] = [];
  const error = new Error("save failed");

  await assert.rejects(
    saveHomeCustomItemEdit(
      sharedDataSource(),
      "template-regular",
      nextCustomItems,
      { name: "Towel", count: 4 },
      {
        applyCustomItems: () => calls.push("apply"),
        saveLocalCustomItems: () => calls.push("local"),
        saveSharedItemTemplateEdit: async () => {
          calls.push("shared");
          throw error;
        },
      },
    ),
    error,
  );

  assert.deepEqual(calls, ["shared"]);
});

test("local item edit preserves weekday changes through the local storage path", async () => {
  const calls: string[] = [];
  const nextItemsWithWeekdays: CustomizableItem[] = [
    {
      id: "template-spot",
      name: "Bottle",
      unit: "count",
      count: 1,
      category: customItems[0].category,
      weekdays: [1, 3],
    },
  ];

  await saveHomeCustomItemEdit(
    { mode: "local" },
    "template-spot",
    nextItemsWithWeekdays,
    { name: "Bottle", count: 1, weekdays: [1, 3] },
    {
      applyCustomItems: (items) => calls.push(`apply:${items[0].weekdays?.join(",")}`),
      saveLocalCustomItems: (items) =>
        calls.push(`local:${items[0].weekdays?.join(",")}`),
      saveSharedItemTemplateEdit: async () => {
        calls.push("shared");
      },
    },
  );

  assert.deepEqual(calls, ["local:1,3", "apply:1,3"]);
});

test("shared item edit passes weekday changes to Supabase before applying state", async () => {
  const calls: string[] = [];
  const nextItemsWithWeekdays: CustomizableItem[] = [
    {
      id: "template-spot",
      name: "Bottle",
      unit: "count",
      count: 2,
      category: customItems[0].category,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
  ];

  await saveHomeCustomItemEdit(
    sharedDataSource(),
    "template-spot",
    nextItemsWithWeekdays,
    { name: "Bottle", count: 2, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    {
      applyCustomItems: (items) => calls.push(`apply:${items[0].weekdays?.length}`),
      saveLocalCustomItems: () => calls.push("local"),
      saveSharedItemTemplateEdit: async (input) => {
        calls.push(
          `${input.familyId}:${input.childId}:${input.itemId}:${input.changes.weekdays?.length}`,
        );
      },
    },
  );

  assert.deepEqual(calls, ["family-1:child-1:template-spot:7", "apply:7"]);
});

test("shared weekday edit failure keeps state unapplied and skips local fallback", async () => {
  const calls: string[] = [];
  const error = new Error("weekday save failed");
  const nextItemsWithWeekdays: CustomizableItem[] = [
    {
      id: "template-spot",
      name: "Bottle",
      unit: "count",
      count: 1,
      category: customItems[0].category,
      weekdays: [],
    },
  ];

  await assert.rejects(
    saveHomeCustomItemEdit(
      sharedDataSource(),
      "template-spot",
      nextItemsWithWeekdays,
      { name: "Bottle", count: 1, weekdays: [] },
      {
        applyCustomItems: () => calls.push("apply"),
        saveLocalCustomItems: () => calls.push("local"),
        saveSharedItemTemplateEdit: async () => {
          calls.push("shared");
          throw error;
        },
      },
    ),
    error,
  );

  assert.deepEqual(calls, ["shared"]);
});

test("local item delete uses the existing local durable settings path", () => {
  const calls: string[] = [];

  const result = saveHomeCustomItemDelete(
    { mode: "local" },
    "template-regular",
    [],
    {
      saveLocalCustomItems: (items) => calls.push(`local:${items.length}`),
      saveSharedItemTemplateDelete: async () => {
        calls.push("shared");
      },
    },
  );

  assert.equal(result, undefined);
  assert.deepEqual(calls, ["local:0"]);
});

test("shared item delete uses Supabase without local durable settings", async () => {
  const calls: string[] = [];

  await saveHomeCustomItemDelete(
    sharedDataSource(),
    "template-regular",
    [],
    {
      saveLocalCustomItems: () => calls.push("local"),
      saveSharedItemTemplateDelete: async (input) => {
        calls.push(`${input.familyId}:${input.childId}:${input.itemId}`);
      },
    },
  );

  assert.deepEqual(calls, ["family-1:child-1:template-regular"]);
});

test("shared item delete does not fall back to local storage when Supabase fails", async () => {
  const calls: string[] = [];
  const error = new Error("delete failed");

  await assert.rejects(
    saveHomeCustomItemDelete(
      sharedDataSource(),
      "template-regular",
      [],
      {
        saveLocalCustomItems: () => calls.push("local"),
        saveSharedItemTemplateDelete: async () => {
          calls.push("shared");
          throw error;
        },
      },
    ),
    error,
  );

  assert.deepEqual(calls, ["shared"]);
});

test("local sort order save keeps the existing local storage path and then applies state", async () => {
  const calls: string[] = [];
  const nextItems: CustomizableItem[] = [
    { ...customItems[0], id: regularUuid },
    {
      id: roughUuid,
      name: "Diaper",
      unit: "pack",
      count: 1,
      category: roughCategory,
    },
  ];

  await saveHomeCustomItemSortOrder({ mode: "local" }, nextItems, {
    applyCustomItems: () => calls.push("apply"),
    saveLocalCustomItems: () => calls.push("local"),
    saveSharedItemTemplateSortOrders: async () => {
      calls.push("shared");
    },
  });

  assert.deepEqual(calls, ["local", "apply"]);
});

test("shared sort order save sends every active item with unique consecutive orders before applying state", async () => {
  const calls: unknown[] = [];
  const nextItems: CustomizableItem[] = [
    { ...customItems[0], id: regularUuid },
    {
      id: roughUuid,
      name: "Diaper",
      unit: "pack",
      count: 1,
      category: roughCategory,
    },
  ];

  await saveHomeCustomItemSortOrder(sharedDataSource(), nextItems, {
    applyCustomItems: (items) => calls.push(["apply", items.map((item) => item.id)]),
    saveLocalCustomItems: () => calls.push(["local"]),
    saveSharedItemTemplateSortOrders: async (input) => {
      calls.push(["shared", input]);
    },
  });

  assert.deepEqual(calls, [
    [
      "shared",
      {
        familyId: "family-1",
        childId: "child-1",
        items: [
          { id: regularUuid, sortOrder: 0 },
          { id: roughUuid, sortOrder: 1 },
        ],
      },
    ],
    ["apply", [regularUuid, roughUuid]],
  ]);
});

test("shared sort order failure keeps state unapplied and skips local fallback", async () => {
  const calls: string[] = [];
  const error = new Error("sort save failed");

  await assert.rejects(
    saveHomeCustomItemSortOrder(
      sharedDataSource(),
      [{ ...customItems[0], id: regularUuid }],
      {
        applyCustomItems: () => calls.push("apply"),
        saveLocalCustomItems: () => calls.push("local"),
        saveSharedItemTemplateSortOrders: async () => {
          calls.push("shared");
          throw error;
        },
      },
    ),
    error,
  );

  assert.deepEqual(calls, ["shared"]);
});

test("local rough state save uses existing local storage path and then applies state", async () => {
  const calls: string[] = [];

  await saveHomeRoughState(
    { mode: "local" },
    "template-rough",
    "補充",
    { "template-rough": "補充" },
    {
      applyRoughStates: () => calls.push("apply"),
      saveLocalRoughStates: () => calls.push("local"),
      saveSharedRoughState: async () => {
        calls.push("shared");
      },
    },
  );

  assert.deepEqual(calls, ["local", "apply"]);
});

test("local rough state saves consecutive different item changes from the latest state", async () => {
  const savedStates: Array<Record<string, string>> = [];
  let currentStates: Record<string, string> = {
    "template-rough-a": "十分",
    "template-rough-b": "十分",
  };

  const dependencies = {
    applyRoughStates: (states: Record<string, string>) => {
      currentStates = states;
    },
    saveLocalRoughStates: (states: Record<string, string>) => {
      savedStates.push(states);
    },
    saveSharedRoughState: async () => {
      throw new Error("shared path should not be called");
    },
  };

  const firstStates = applyHomeRoughStateChange(
    currentStates,
    "template-rough-a",
    "少ない",
  );
  await saveHomeRoughState(
    { mode: "local" },
    "template-rough-a",
    "少ない",
    firstStates,
    dependencies,
  );

  const secondStates = applyHomeRoughStateChange(
    currentStates,
    "template-rough-b",
    "補充",
  );
  await saveHomeRoughState(
    { mode: "local" },
    "template-rough-b",
    "補充",
    secondStates,
    dependencies,
  );

  assert.deepEqual(currentStates, {
    "template-rough-a": "少ない",
    "template-rough-b": "補充",
  });
  assert.deepEqual(savedStates.at(-1), currentStates);
});

test("shared rough state save uses Supabase path and then applies state", async () => {
  const calls: string[] = [];

  await saveHomeRoughState(
    sharedDataSource(),
    "template-rough",
    "補充",
    { "template-rough": "補充" },
    {
      applyRoughStates: () => calls.push("apply"),
      saveLocalRoughStates: () => calls.push("local"),
      saveSharedRoughState: async (input) => {
        calls.push(
          `${input.familyId}:${input.childId}:${input.itemId}:${input.roughState}`,
        );
      },
    },
  );

  assert.deepEqual(calls, ["family-1:child-1:template-rough:補充", "apply"]);
});

test("shared rough state save does not apply state or local fallback when Supabase fails", async () => {
  const calls: string[] = [];
  const error = new Error("save failed");

  await assert.rejects(
    saveHomeRoughState(
      sharedDataSource(),
      "template-rough",
      "補充",
      { "template-rough": "補充" },
      {
        applyRoughStates: () => calls.push("apply"),
        saveLocalRoughStates: () => calls.push("local"),
        saveSharedRoughState: async () => {
          calls.push("shared");
          throw error;
        },
      },
    ),
    error,
  );

  assert.deepEqual(calls, ["shared"]);
});

function sharedDataSource(): Exclude<HomeDataSource, { mode: "shared-error" }> {
  return {
    mode: "shared",
    familyId: "family-1",
    initialData: sharedInitialData,
    childProfileEditable: true,
    durableItemsEditable: false,
  };
}
