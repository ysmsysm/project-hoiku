import assert from "node:assert/strict";
import test from "node:test";
import { saveHomeChildProfile } from "../src/lib/home-child-profile-save";
import type { HomeDataSource } from "../src/lib/home-data-source";
import type { SharedSettingsAppData } from "../src/lib/family-sharing/shared-settings";
import type { ChildProfile } from "../src/types/child";

const childProfile: ChildProfile = {
  name: "Sota",
  iconType: "default",
  iconId: "default-baby",
  iconUrl: null,
  birthday: null,
  photoUrl: null,
};

const sharedInitialData: SharedSettingsAppData = {
  childId: "child-1",
  childProfile,
  customItems: [],
  roughStates: {},
};

test("local child profile save uses local storage path and then applies state", async () => {
  const calls: string[] = [];

  await saveHomeChildProfile({ mode: "local" }, childProfile, {
    applyChildProfile: () => calls.push("apply"),
    saveLocalChildProfile: () => calls.push("local"),
    saveSharedChildProfile: async () => {
      calls.push("shared");
    },
  });

  assert.deepEqual(calls, ["local", "apply"]);
});

test("shared child profile save uses Supabase path and then applies state", async () => {
  const calls: string[] = [];

  await saveHomeChildProfile(sharedDataSource(), childProfile, {
    applyChildProfile: () => calls.push("apply"),
    saveLocalChildProfile: () => calls.push("local"),
    saveSharedChildProfile: async (input) => {
      calls.push(`${input.familyId}:${input.childId}`);
    },
  });

  assert.deepEqual(calls, ["family-1:child-1", "apply"]);
});

test("shared child profile save does not apply state when Supabase save fails", async () => {
  const calls: string[] = [];
  const error = new Error("save failed");

  await assert.rejects(
    saveHomeChildProfile(sharedDataSource(), childProfile, {
      applyChildProfile: () => calls.push("apply"),
      saveLocalChildProfile: () => calls.push("local"),
      saveSharedChildProfile: async () => {
        calls.push("shared");
        throw error;
      },
    }),
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
