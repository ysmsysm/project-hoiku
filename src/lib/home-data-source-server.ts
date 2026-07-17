import type { User } from "@supabase/supabase-js";
import type { CurrentUserResult } from "./auth/session";
import type { SharedSettingsLoadResult } from "./family-sharing/shared-settings-server";
import type { CurrentFamilyMembership } from "../types/family";
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
};

export async function getHomeDataSource(
  dependencies: HomeDataSourceDependencies,
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

  const sharedSettings = await dependencies.loadSharedSettingsForFamily(
    membership.familyId,
  );

  if (sharedSettings.ok === false) {
    return {
      mode: "shared-error",
      reason: toHomeSharedErrorReason(sharedSettings.error),
    };
  }

  return {
    mode: "shared",
    familyId: membership.familyId,
    initialData: sharedSettings.data,
    childProfileEditable: true,
    durableItemsEditable: false,
  };
}
