import type { HomeDataSource } from "./home-data-source";
import type {
  SaveSharedItemTemplateEditInput,
  SaveSharedRoughStateInput,
} from "./family-sharing/save-item-template";
import type { CustomizableItem } from "../types/preparation";

type SaveHomeCustomItemEditDependencies = {
  applyCustomItems: (items: CustomizableItem[]) => void;
  saveLocalCustomItems: (items: CustomizableItem[]) => void;
  saveSharedItemTemplateEdit: (
    input: SaveSharedItemTemplateEditInput,
  ) => Promise<void>;
};

type SaveHomeRoughStateDependencies<RoughState extends string> = {
  applyRoughStates: (states: Record<string, RoughState>) => void;
  saveLocalRoughStates: (states: Record<string, RoughState>) => void;
  saveSharedRoughState: (input: SaveSharedRoughStateInput) => Promise<void>;
};

export function applyHomeRoughStateChange<RoughState extends string>(
  currentStates: Record<string, RoughState>,
  itemId: string,
  roughState: RoughState,
) {
  return {
    ...currentStates,
    [itemId]: roughState,
  };
}

export async function saveHomeCustomItemEdit(
  dataSource: Exclude<HomeDataSource, { mode: "shared-error" }>,
  itemId: string,
  nextItems: CustomizableItem[],
  sharedChanges: SaveSharedItemTemplateEditInput["changes"],
  dependencies: SaveHomeCustomItemEditDependencies,
) {
  if (dataSource.mode === "shared") {
    await dependencies.saveSharedItemTemplateEdit({
      familyId: dataSource.familyId,
      childId: dataSource.initialData.childId,
      itemId,
      changes: sharedChanges,
    });
    dependencies.applyCustomItems(nextItems);
    return;
  }

  dependencies.saveLocalCustomItems(nextItems);
  dependencies.applyCustomItems(nextItems);
}

export async function saveHomeRoughState<RoughState extends string>(
  dataSource: Exclude<HomeDataSource, { mode: "shared-error" }>,
  itemId: string,
  roughState: RoughState,
  nextStates: Record<string, RoughState>,
  dependencies: SaveHomeRoughStateDependencies<RoughState>,
) {
  if (dataSource.mode === "shared") {
    await dependencies.saveSharedRoughState({
      familyId: dataSource.familyId,
      childId: dataSource.initialData.childId,
      itemId,
      roughState,
    });
    dependencies.applyRoughStates(nextStates);
    return;
  }

  dependencies.saveLocalRoughStates(nextStates);
  dependencies.applyRoughStates(nextStates);
}
