import assert from "node:assert/strict";
import test from "node:test";
import {
  saveSharedChildProfile,
  toChildrenUpdate,
  type SharedChildProfileClient,
} from "../src/lib/family-sharing/save-child-profile";
import type { ChildProfile } from "../src/types/child";

const defaultProfile: ChildProfile = {
  name: "Sota",
  iconType: "default",
  iconId: "default-baby",
  iconUrl: null,
  birthday: null,
  photoUrl: null,
};

test("maps child profile to children update columns only", () => {
  assert.deepEqual(toChildrenUpdate(defaultProfile), {
    name: "Sota",
    icon_type: "default",
    icon_id: "default-baby",
    icon_url: null,
  });
});

test("clears icon_url for default icon updates", () => {
  assert.deepEqual(
    toChildrenUpdate({
      ...defaultProfile,
      iconUrl: "https://example.com/old.png",
      photoUrl: "https://example.com/old.png",
    }),
    {
      name: "Sota",
      icon_type: "default",
      icon_id: "default-baby",
      icon_url: null,
    },
  );
});

test("updates shared child profile with child id and family id filters", async () => {
  const calls: unknown[] = [];
  const client = createMockClient(calls, { data: { id: "child-1" }, error: null });

  await saveSharedChildProfile(client, {
    familyId: "family-1",
    childId: "child-1",
    childProfile: defaultProfile,
  });

  assert.deepEqual(calls, [
    ["from", "children"],
    ["update", toChildrenUpdate(defaultProfile)],
    ["eq", "id", "child-1"],
    ["eq", "family_id", "family-1"],
    ["select", "id"],
    ["maybeSingle"],
  ]);
});

test("throws when shared child profile update fails", async () => {
  const updateError = new Error("update failed");

  await assert.rejects(
    saveSharedChildProfile(
      createMockClient([], { data: null, error: updateError }),
      {
        familyId: "family-1",
        childId: "child-1",
        childProfile: defaultProfile,
      },
    ),
    updateError,
  );
});

test("throws when shared child profile update matches no rows", async () => {
  await assert.rejects(
    saveSharedChildProfile(createMockClient([], { data: null, error: null }), {
      familyId: "family-1",
      childId: "child-1",
      childProfile: defaultProfile,
    }),
    /shared_child_profile_not_found/,
  );
});

test("does not run an ambiguous shared child profile update without ids", async () => {
  const missingFamilyCalls: unknown[] = [];

  await assert.rejects(
    saveSharedChildProfile(
      createMockClient(missingFamilyCalls, {
        data: { id: "child-1" },
        error: null,
      }),
      {
        familyId: "",
        childId: "child-1",
        childProfile: defaultProfile,
      },
    ),
    /missing_familyId/,
  );

  assert.deepEqual(missingFamilyCalls, []);

  const missingChildCalls: unknown[] = [];

  await assert.rejects(
    saveSharedChildProfile(
      createMockClient(missingChildCalls, {
        data: { id: "child-1" },
        error: null,
      }),
      {
        familyId: "family-1",
        childId: " ",
        childProfile: defaultProfile,
      },
    ),
    /missing_childId/,
  );

  assert.deepEqual(missingChildCalls, []);
});

function createMockClient(
  calls: unknown[],
  result: { data: { id: string } | null; error: Error | null },
): SharedChildProfileClient {
  const query = {
    update(value: unknown) {
      calls.push(["update", value]);
      return this;
    },
    eq(column: string, value: string) {
      calls.push(["eq", column, value]);
      return this;
    },
    select(columns: string) {
      calls.push(["select", columns]);
      return this;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
  };

  return {
    from(table: string) {
      calls.push(["from", table]);
      return query;
    },
  } as unknown as SharedChildProfileClient;
}
