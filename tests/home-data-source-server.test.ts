import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { getHomeDataSource } from "../src/lib/home-data-source-server";
import {
  isAuthSessionMissingError,
  type CurrentUserResult,
} from "../src/lib/auth/session";
import type { SharedSettingsAppData } from "../src/lib/family-sharing/shared-settings";
import type { SharedSettingsLoadResult } from "../src/lib/family-sharing/shared-settings-query";
import type { CurrentFamilyMembership } from "../src/types/family";

const user = { id: "user-1" } as User;

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
  customItems: [],
  roughStates: {},
};

function membership(
  overrides: Partial<CurrentFamilyMembership> = {},
): CurrentFamilyMembership {
  return {
    memberId: "member-1",
    familyId: "family-1",
    role: "member",
    displayName: "So",
    sharingStartedAt: "2026-07-17T00:00:00.000Z",
    isSharingStarted: true,
    isPreSharingOwner: false,
    ...overrides,
  };
}

function createDependencies(input: {
  currentUser: CurrentUserResult;
  membership?: CurrentFamilyMembership | null;
  membershipError?: Error;
  sharedSettings?: SharedSettingsLoadResult;
}) {
  const calls = {
    membership: 0,
    sharedSettings: 0,
  };

  return {
    calls,
    deps: {
      getCurrentUserResult: async () => input.currentUser,
      getCurrentFamilyMembership: async () => {
        calls.membership += 1;
        if (input.membershipError) {
          throw input.membershipError;
        }
        return input.membership ?? null;
      },
      loadSharedSettingsForFamily: async () => {
        calls.sharedSettings += 1;
        return input.sharedSettings ?? { ok: true, data: sharedInitialData };
      },
    },
  };
}

test("successful auth with no user uses local mode", async () => {
  const { deps, calls } = createDependencies({
    currentUser: { status: "unauthenticated" },
  });

  assert.deepEqual(await getHomeDataSource(deps), { mode: "local" });
  assert.equal(calls.membership, 0);
  assert.equal(calls.sharedSettings, 0);
});

test("successful auth with user continues to membership and shared settings", async () => {
  const { deps, calls } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: membership(),
  });

  const dataSource = await getHomeDataSource(deps);

  assert.equal(dataSource.mode, "shared");
  assert.equal(calls.membership, 1);
  assert.equal(calls.sharedSettings, 1);
});

test("auth verification failure returns an error data source instead of local", async () => {
  const { deps, calls } = createDependencies({
    currentUser: {
      status: "error",
      error: new Error("fetch failed"),
    },
  });

  assert.deepEqual(await getHomeDataSource(deps), {
    mode: "shared-error",
    reason: "auth-check-failed",
  });
  assert.equal(calls.membership, 0);
  assert.equal(calls.sharedSettings, 0);
});

test("auth session missing is classified as normal unauthenticated state", () => {
  assert.equal(
    isAuthSessionMissingError({
      name: "AuthSessionMissingError",
      message: "Auth session missing!",
    }),
    true,
  );
  assert.equal(
    isAuthSessionMissingError({
      name: "AuthRetryableFetchError",
      message: "fetch failed",
    }),
    false,
  );
});

test("logged-in user without membership keeps the existing local behavior", async () => {
  const { deps } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: null,
  });

  assert.deepEqual(await getHomeDataSource(deps), { mode: "local" });
});

test("shared settings load failure remains a shared-error", async () => {
  const { deps } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: membership(),
    sharedSettings: {
      ok: false,
      error: {
        type: "query_failed",
        source: "children",
        message: "fetch failed",
      },
    },
  });

  assert.deepEqual(await getHomeDataSource(deps), {
    mode: "shared-error",
    reason: "settings-query-failed",
  });
});
