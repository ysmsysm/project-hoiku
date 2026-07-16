import assert from "node:assert/strict";
import test from "node:test";
import {
  canAddHomeDurableItem,
  canDeleteHomeDurableItems,
  canEditHomeChildProfile,
  canEditHomeDurableSettings,
  canEditHomeExistingItemDetails,
  canEditHomeItemWeekdays,
  canEditHomeRoughItemUnit,
  canSortHomeDurableItems,
  canToggleHomeRoughState,
  getHomeLocalStorageLoadPlan,
  getSharedInitialDurableSettings,
  sharedSettingsLoadErrorBody,
  sharedSettingsLoadErrorTitle,
  toHomeSharedErrorReason,
  type HomeDataSource,
} from "../src/lib/home-data-source";
import type { SharedSettingsAppData } from "../src/lib/family-sharing/shared-settings";

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
  customItems: [
    {
      id: "template-regular",
      name: "Shirt",
      unit: "pcs",
      count: 3,
      category: "持ち物",
    },
    {
      id: "template-rough",
      name: "Diaper",
      unit: "pack",
      count: 1,
      category: "ざっくり管理",
    },
  ],
  roughStates: {
    "template-rough": "補充",
  },
};

test("local mode keeps existing localStorage loading and durable settings editing", () => {
  const dataSource: HomeDataSource = { mode: "local" };

  assert.deepEqual(getHomeLocalStorageLoadPlan(dataSource), {
    durableSettings: true,
    dailyData: true,
  });
  assert.equal(getSharedInitialDurableSettings(dataSource), null);
  assert.equal(canEditHomeChildProfile(dataSource), true);
  assert.equal(canEditHomeDurableSettings(dataSource), true);
  assert.equal(canEditHomeExistingItemDetails(dataSource), true);
  assert.equal(canEditHomeRoughItemUnit(dataSource), true);
  assert.equal(canToggleHomeRoughState(dataSource), true);
  assert.equal(canAddHomeDurableItem(dataSource, "持ち物"), true);
  assert.equal(canAddHomeDurableItem(dataSource, "スポット追加"), true);
  assert.equal(canAddHomeDurableItem(dataSource, "ざっくり管理"), true);
  assert.equal(canDeleteHomeDurableItems(dataSource), true);
  assert.equal(canEditHomeItemWeekdays(dataSource), true);
  assert.equal(canSortHomeDurableItems(dataSource), true);
});

test("shared mode uses initialData and skips durable localStorage loading", () => {
  const dataSource: HomeDataSource = {
    mode: "shared",
    familyId: "family-1",
    initialData: sharedInitialData,
    childProfileEditable: true,
    durableItemsEditable: false,
  };

  assert.deepEqual(getHomeLocalStorageLoadPlan(dataSource), {
    durableSettings: false,
    dailyData: true,
  });
  assert.equal(getSharedInitialDurableSettings(dataSource), sharedInitialData);
  assert.deepEqual(getSharedInitialDurableSettings(dataSource)?.childProfile, {
    name: "Sota",
    iconType: "default",
    iconId: "default-baby",
    iconUrl: null,
    birthday: null,
    photoUrl: null,
  });
  assert.deepEqual(
    getSharedInitialDurableSettings(dataSource)?.customItems.map((item) => item.id),
    ["template-regular", "template-rough"],
  );
  assert.deepEqual(getSharedInitialDurableSettings(dataSource)?.roughStates, {
    "template-rough": "補充",
  });
});

test("shared mode separates durable item editing permissions by operation", () => {
  const dataSource: HomeDataSource = {
    mode: "shared",
    familyId: "family-1",
    initialData: sharedInitialData,
    childProfileEditable: true,
    durableItemsEditable: false,
  };

  assert.equal(canEditHomeChildProfile(dataSource), true);
  assert.equal(canEditHomeDurableSettings(dataSource), false);
  assert.equal(canEditHomeExistingItemDetails(dataSource), true);
  assert.equal(canEditHomeRoughItemUnit(dataSource), true);
  assert.equal(canToggleHomeRoughState(dataSource), true);
  assert.equal(canAddHomeDurableItem(dataSource, "持ち物"), true);
  assert.equal(canAddHomeDurableItem(dataSource, "ざっくり管理"), true);
  assert.equal(canAddHomeDurableItem(dataSource, "スポット追加"), false);
  assert.equal(canDeleteHomeDurableItems(dataSource), true);
  assert.equal(canEditHomeItemWeekdays(dataSource), false);
  assert.equal(canSortHomeDurableItems(dataSource), false);
});

test("shared-error does not fall back to localStorage and has error copy", () => {
  const dataSource: HomeDataSource = {
    mode: "shared-error",
    reason: "settings-query-failed",
  };

  assert.deepEqual(getHomeLocalStorageLoadPlan(dataSource), {
    durableSettings: false,
    dailyData: false,
  });
  assert.equal(getSharedInitialDurableSettings(dataSource), null);
  assert.equal(sharedSettingsLoadErrorTitle, "家族共有データを読み込めませんでした。");
  assert.equal(sharedSettingsLoadErrorBody, "ページを再読み込みしてください。");
});

test("shared settings errors map to safe home error reasons", () => {
  assert.equal(
    toHomeSharedErrorReason({
      type: "query_failed",
    }),
    "settings-query-failed",
  );
  assert.equal(
    toHomeSharedErrorReason({
      type: "child_missing",
    }),
    "shared-data-missing",
  );
  assert.equal(
    toHomeSharedErrorReason({
      type: "invalid_data",
    }),
    "shared-data-invalid",
  );
  assert.equal(
    toHomeSharedErrorReason({
      type: "multiple_children",
    }),
    "shared-data-invalid",
  );
});
