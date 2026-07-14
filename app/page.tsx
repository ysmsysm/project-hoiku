import HomeClient from "./HomeClient";
import { getCurrentUser } from "../src/lib/auth/session";
import { getCurrentFamilyMembership } from "../src/lib/family-sharing/membership";
import { loadSharedSettingsForFamily } from "../src/lib/family-sharing/shared-settings-server";
import {
  toHomeSharedErrorReason,
  type HomeDataSource,
} from "../src/lib/home-data-source";

export default async function Home() {
  const dataSource = await getHomeDataSource();

  return <HomeClient dataSource={dataSource} />;
}

async function getHomeDataSource(): Promise<HomeDataSource> {
  const user = await getCurrentUser();

  if (!user) {
    return { mode: "local" };
  }

  let membership;

  try {
    membership = await getCurrentFamilyMembership(user);
  } catch {
    return {
      mode: "shared-error",
      reason: "membership-query-failed",
    };
  }

  if (!membership?.isSharingStarted) {
    return { mode: "local" };
  }

  const sharedSettings = await loadSharedSettingsForFamily(membership.familyId);

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
