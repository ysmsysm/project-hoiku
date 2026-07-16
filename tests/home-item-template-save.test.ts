import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHomeRoughStateChange,
  appendHomeCustomItemToCategory,
  saveHomeCustomItemAdd,
  saveHomeCustomItemDelete,
  saveHomeCustomItemEdit,
  saveHomeRoughState,
} from "../src/lib/home-item-template-save";
import type { HomeDataSource } from "../src/lib/home-data-source";
import type { SharedSettingsAppData } from "../src/lib/family-sharing/shared-settings";
import type { CustomizableItem } from "../src/types/preparation";

const regularUuid = "11111111-1111-4111-8111-111111111111";
const roughUuid = "22222222-2222-4222-8222-222222222222";

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
      weekdays: [1, 5],
    },
    "十分",
    dependencies,
  );
  assert.deepEqual(spotResult.item.weekdays, [1, 5]);
  assert.deepEqual(
    savedItems[1].find((item) => item.id === "custom-2")?.weekdays,
    [1, 5],
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
