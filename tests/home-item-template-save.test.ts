import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHomeRoughStateChange,
  saveHomeCustomItemEdit,
  saveHomeRoughState,
} from "../src/lib/home-item-template-save";
import type { HomeDataSource } from "../src/lib/home-data-source";
import type { SharedSettingsAppData } from "../src/lib/family-sharing/shared-settings";
import type { CustomizableItem } from "../src/types/preparation";

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

test("local item edit save uses existing local storage path and then applies state", async () => {
  const calls: string[] = [];

  await saveHomeCustomItemEdit(
    { mode: "local" },
    "template-regular",
    nextCustomItems,
    { name: "Towel", count: 4 },
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
    { name: "Towel", count: 4 },
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
