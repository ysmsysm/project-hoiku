import type { ChildProfile } from "../types/child";
import type { HomeDataSource } from "./home-data-source";
import type { SaveSharedChildProfileInput } from "./family-sharing/save-child-profile";

type SaveHomeChildProfileDependencies = {
  applyChildProfile: (profile: ChildProfile) => void;
  saveLocalChildProfile: (profile: ChildProfile) => void;
  saveSharedChildProfile: (input: SaveSharedChildProfileInput) => Promise<void>;
};

export async function saveHomeChildProfile(
  dataSource: Exclude<HomeDataSource, { mode: "shared-error" }>,
  childProfile: ChildProfile,
  dependencies: SaveHomeChildProfileDependencies,
) {
  if (dataSource.mode === "shared") {
    await dependencies.saveSharedChildProfile({
      familyId: dataSource.familyId,
      childId: dataSource.initialData.childId,
      childProfile,
    });
    dependencies.applyChildProfile(childProfile);
    return;
  }

  dependencies.saveLocalChildProfile(childProfile);
  dependencies.applyChildProfile(childProfile);
}
