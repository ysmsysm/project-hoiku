import type { User } from "@supabase/supabase-js";
import type { CurrentUserResult } from "./auth/session";
import type { SharedSettingsLoadResult } from "./family-sharing/shared-settings-server";
import type { CurrentFamilyMembership } from "../types/family";
import type { LoadDailyDataInput } from "../types/daily";
import type { SharedDailyState } from "../types/shared-daily";
import { isDailyDataUuid } from "./family-sharing/daily-data";
import {
  toHomeSharedErrorReason,
  type HomeDataSource,
} from "./home-data-source";

type HomeDataSourceDependencies = {
  getCurrentUserResult: () => Promise<CurrentUserResult>;
  getCurrentFamilyMembership: (
    user: User,
  ) => Promise<CurrentFamilyMembership | null>;
  loadSharedSettingsForFamily: (
    familyId: string,
  ) => Promise<SharedSettingsLoadResult>;
  getJapanDateString: () => string;
  loadSharedDailyDataForFamily: (
    input: LoadDailyDataInput,
  ) => Promise<SharedDailyState>;
};

type HomeDataSourceOptions = {
  deferSharedDailyData?: boolean;
};

const dailyLoadFailure = (sessionDate: string): SharedDailyState => ({
  status: "transport_error",
  sessionDate,
  error: {
    kind: "rpc_error",
    message: "Shared daily data server load failed",
  },
});

export async function getHomeDataSource(
  dependencies: HomeDataSourceDependencies,
  options: HomeDataSourceOptions = {},
): Promise<HomeDataSource> {
  const currentUser = await dependencies.getCurrentUserResult();

  if (currentUser.status === "error") {
    return {
      mode: "shared-error",
      reason: "auth-check-failed",
    };
  }

  if (currentUser.status === "unauthenticated") {
    return { mode: "local" };
  }

  let membership;

  try {
    membership = await dependencies.getCurrentFamilyMembership(
      currentUser.user,
    );
  } catch {
    return {
      mode: "shared-error",
      reason: "membership-query-failed",
    };
  }

  if (!membership?.isSharingStarted) {
    return { mode: "local" };
  }

  if (!isDailyDataUuid(membership.memberId)) {
    return {
      mode: "shared-error",
      reason: "membership-query-failed",
    };
  }

  const sharedSettings = await dependencies.loadSharedSettingsForFamily(
    membership.familyId,
  );

  if (sharedSettings.ok === false) {
    return {
      mode: "shared-error",
      reason: toHomeSharedErrorReason(sharedSettings.error),
    };
  }

  const sessionDate = dependencies.getJapanDateString();
  let initialDailyData: SharedDailyState;

  if (options.deferSharedDailyData) {
    initialDailyData = { status: "loading", sessionDate };
  } else {
    try {
      initialDailyData = await dependencies.loadSharedDailyDataForFamily({
        familyId: membership.familyId,
        childId: sharedSettings.data.childId,
        sessionDate,
      });
    } catch {
      initialDailyData = dailyLoadFailure(sessionDate);
    }
  }

  return {
    mode: "shared",
    familyId: membership.familyId,
    currentMemberId: membership.memberId,
    initialData: sharedSettings.data,
    initialDailyData,
    childProfileEditable: true,
    durableItemsEditable: false,
  };
}
