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
import type { DailySession, LoadDailyDataInput } from "../src/types/daily";
import type { SharedDailyState } from "../src/types/shared-daily";

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

const sessionDate = "2026-08-01";

function dailySession(): DailySession {
  return {
    dailySessionId: "33333333-3333-4333-8333-333333333333",
    familyId: "family-1",
    childId: "child-1",
    sessionDate,
    version: 1,
    isChecked: false,
    checkedAt: null,
    checkedByMemberId: null,
    checkedByUserId: null,
    checkedByDisplayName: null,
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
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    items: [],
  };
}

function dailySuccessState(): SharedDailyState {
  const session = dailySession();
  return {
    status: "success",
    sessionDate,
    session,
    preparationSession: {
      date: sessionDate,
      checkedBy: "",
      confirmedAt: null,
      completedAt: null,
      items: [],
      thanksSent: false,
    },
    checkView: { items: [] },
  };
}

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
  dailyData?: SharedDailyState;
  dailyError?: Error;
  sessionDate?: string;
}) {
  const calls = {
    membership: 0,
    sharedSettings: 0,
    sessionDate: 0,
    daily: [] as LoadDailyDataInput[],
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
      getJapanDateString: () => {
        calls.sessionDate += 1;
        return input.sessionDate ?? sessionDate;
      },
      loadSharedDailyDataForFamily: async (dailyInput: LoadDailyDataInput) => {
        calls.daily.push(dailyInput);
        if (input.dailyError) {
          throw input.dailyError;
        }
        return (
          input.dailyData ?? {
            status: "not_found",
            sessionDate: dailyInput.sessionDate,
          }
        );
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
  assert.equal(calls.sessionDate, 0);
  assert.deepEqual(calls.daily, []);
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
  assert.equal(calls.sessionDate, 1);
  assert.deepEqual(calls.daily, [
    {
      familyId: "family-1",
      childId: "child-1",
      sessionDate,
    },
  ]);
  if (dataSource.mode === "shared") {
    assert.deepEqual(dataSource.initialDailyData, {
      status: "not_found",
      sessionDate,
    });
  }
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
  assert.equal(calls.sessionDate, 0);
  assert.deepEqual(calls.daily, []);
});

test("membership query failure stops before settings and daily loading", async () => {
  const { deps, calls } = createDependencies({
    currentUser: { status: "authenticated", user },
    membershipError: new Error("membership failed"),
  });

  assert.deepEqual(await getHomeDataSource(deps), {
    mode: "shared-error",
    reason: "membership-query-failed",
  });
  assert.equal(calls.sharedSettings, 0);
  assert.equal(calls.sessionDate, 0);
  assert.deepEqual(calls.daily, []);
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
  const { deps, calls } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: null,
  });

  assert.deepEqual(await getHomeDataSource(deps), { mode: "local" });
  assert.equal(calls.sessionDate, 0);
  assert.deepEqual(calls.daily, []);
});

test("shared settings load failure remains a shared-error", async () => {
  const { deps, calls } = createDependencies({
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
  assert.equal(calls.sessionDate, 0);
  assert.deepEqual(calls.daily, []);
});

test("missing shared child stops before daily loading", async () => {
  const { deps, calls } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: membership(),
    sharedSettings: {
      ok: false,
      error: {
        type: "child_missing",
        issues: [{ path: "children", code: "child_missing" }],
      },
    },
  });

  assert.deepEqual(await getHomeDataSource(deps), {
    mode: "shared-error",
    reason: "shared-data-missing",
  });
  assert.equal(calls.sessionDate, 0);
  assert.deepEqual(calls.daily, []);
});

test("shared success keeps canonical daily data and the mapped child scope", async () => {
  const expectedDailyData = dailySuccessState();
  const scopedSettings: SharedSettingsAppData = {
    ...sharedInitialData,
    childId: "selected-child",
  };
  const { deps, calls } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: membership({ familyId: "selected-family" }),
    sharedSettings: { ok: true, data: scopedSettings },
    dailyData: expectedDailyData,
  });

  const dataSource = await getHomeDataSource(deps);

  assert.equal(dataSource.mode, "shared");
  assert.deepEqual(calls.daily, [
    {
      familyId: "selected-family",
      childId: "selected-child",
      sessionDate,
    },
  ]);
  if (dataSource.mode === "shared") {
    assert.equal(dataSource.initialData, scopedSettings);
    assert.equal(dataSource.initialDailyData, expectedDailyData);
    assert.equal(dataSource.initialDailyData.status, "success");
    if (dataSource.initialDailyData.status === "success") {
      assert.equal(
        dataSource.initialDailyData.session,
        expectedDailyData.status === "success"
          ? expectedDailyData.session
          : null,
      );
    }
    assert.doesNotThrow(() => JSON.stringify(dataSource));
  }
});

test("daily not_found keeps shared settings without local fallback", async () => {
  const { deps } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: membership(),
    dailyData: { status: "not_found", sessionDate },
  });

  const dataSource = await getHomeDataSource(deps);

  assert.equal(dataSource.mode, "shared");
  if (dataSource.mode === "shared") {
    assert.equal(dataSource.initialData, sharedInitialData);
    assert.deepEqual(dataSource.initialDailyData, {
      status: "not_found",
      sessionDate,
    });
    assert.doesNotThrow(() => JSON.stringify(dataSource));
  }
});

test("every daily failure remains in shared mode and is serializable", async () => {
  const states: SharedDailyState[] = [
    { status: "forbidden", sessionDate },
    { status: "invalid_state", sessionDate },
    {
      status: "transport_error",
      sessionDate,
      error: { kind: "rpc_error", message: "fetch failed", code: "PGRST000" },
    },
    {
      status: "invalid_response",
      sessionDate,
      error: {
        kind: "invalid_response",
        message: "invalid payload",
        issues: [{ path: "response", code: "invalid_status_envelope" }],
      },
    },
    {
      status: "invalid_input",
      sessionDate,
      error: {
        kind: "invalid_input",
        message: "invalid input",
        issues: [{ path: "familyId", code: "invalid_uuid" }],
      },
    },
  ];

  for (const state of states) {
    const { deps } = createDependencies({
      currentUser: { status: "authenticated", user },
      membership: membership(),
      dailyData: state,
    });
    const dataSource = await getHomeDataSource(deps);

    assert.equal(dataSource.mode, "shared");
    if (dataSource.mode === "shared") {
      assert.equal(dataSource.initialData, sharedInitialData);
      assert.equal(dataSource.initialDailyData, state);
      assert.doesNotThrow(() => JSON.stringify(dataSource));
    }
  }
});

test("unexpected daily loader rejection becomes shared daily transport error", async () => {
  const { deps } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: membership(),
    dailyError: new Error("unexpected"),
  });

  const dataSource = await getHomeDataSource(deps);

  assert.equal(dataSource.mode, "shared");
  if (dataSource.mode === "shared") {
    assert.deepEqual(dataSource.initialDailyData, {
      status: "transport_error",
      sessionDate,
      error: {
        kind: "rpc_error",
        message: "Shared daily data server load failed",
      },
    });
  }
});

test("sharing not started stays local and never resolves a daily date", async () => {
  const { deps, calls } = createDependencies({
    currentUser: { status: "authenticated", user },
    membership: membership({
      isSharingStarted: false,
      sharingStartedAt: null,
    }),
  });

  assert.deepEqual(await getHomeDataSource(deps), { mode: "local" });
  assert.equal(calls.sessionDate, 0);
  assert.deepEqual(calls.daily, []);
});
