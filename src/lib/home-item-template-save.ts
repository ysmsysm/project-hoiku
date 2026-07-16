import type { HomeDataSource } from "./home-data-source";
import {
  assertValidHomeItemQuantity,
  assertValidHomeRoughUnit,
} from "./home-item-template-constraints";
import type {
  SaveSharedItemTemplateAddInput,
  SaveSharedItemTemplateAddResult,
  SaveSharedItemTemplateDeleteInput,
  SaveSharedItemTemplateEditInput,
  SaveSharedRoughStateInput,
} from "./family-sharing/save-item-template";
import type {
  CustomizableItem,
  CustomItemCategory,
} from "../types/preparation";

export type SaveHomeCustomItemAddInput = {
  name: string;
  count: number;
  unit: string;
  category: CustomItemCategory;
  weekdays: number[];
};

export type SaveHomeCustomItemAddResult<RoughState extends string> = {
  item: CustomizableItem;
  initialRoughState: RoughState | null;
};

type SaveHomeCustomItemAddDependencies<RoughState extends string> = {
  createLocalItemId: () => string;
  saveLocalCustomItems: (items: CustomizableItem[]) => void;
  saveLocalRoughStates: (states: Record<string, RoughState>) => void;
  saveSharedItemTemplateAdd: (
    input: SaveSharedItemTemplateAddInput,
  ) => Promise<SaveSharedItemTemplateAddResult>;
};

type SaveHomeCustomItemEditDependencies = {
  applyCustomItems: (items: CustomizableItem[]) => void;
  saveLocalCustomItems: (items: CustomizableItem[]) => void;
  saveSharedItemTemplateEdit: (
    input: SaveSharedItemTemplateEditInput,
  ) => Promise<void>;
};

type SaveHomeCustomItemDeleteDependencies = {
  saveLocalCustomItems: (items: CustomizableItem[]) => void;
  saveSharedItemTemplateDelete: (
    input: SaveSharedItemTemplateDeleteInput,
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

export function appendHomeCustomItemToCategory(
  items: CustomizableItem[],
  item: CustomizableItem,
) {
  const lastCategoryIndex = items.findLastIndex(
    (currentItem) => currentItem.category === item.category,
  );

  if (lastCategoryIndex === -1) {
    return [...items, item];
  }

  return [
    ...items.slice(0, lastCategoryIndex + 1),
    item,
    ...items.slice(lastCategoryIndex + 1),
  ];
}

export async function saveHomeCustomItemAdd<RoughState extends string>(
  dataSource: Exclude<HomeDataSource, { mode: "shared-error" }>,
  currentItems: CustomizableItem[],
  currentRoughStates: Record<string, RoughState>,
  input: SaveHomeCustomItemAddInput,
  initialRoughState: RoughState,
  dependencies: SaveHomeCustomItemAddDependencies<RoughState>,
): Promise<SaveHomeCustomItemAddResult<RoughState>> {
  assertValidHomeItemQuantity(input.count);
  if (input.category === "ざっくり管理") {
    assertValidHomeRoughUnit(input.unit);
  }

  let itemId: string;

  if (dataSource.mode === "shared") {
    if (input.category === "スポット追加") {
      throw new Error("shared_spot_item_add_not_available");
    }

    const saved = await dependencies.saveSharedItemTemplateAdd({
      familyId: dataSource.familyId,
      childId: dataSource.initialData.childId,
      kind: input.category === "ざっくり管理" ? "rough" : "regular",
      name: input.name,
      defaultQuantity: input.count,
      unit: input.unit,
      currentRoughState:
        input.category === "ざっくり管理" ? "enough" : null,
    });
    itemId = saved.id;
  } else {
    itemId = dependencies.createLocalItemId();
  }

  const item: CustomizableItem = {
    id: itemId,
    name: input.name,
    unit: input.unit,
    count: input.count,
    category: input.category,
    weekdays: [...input.weekdays],
  };
  const itemInitialRoughState =
    input.category === "ざっくり管理" ? initialRoughState : null;

  if (dataSource.mode === "local") {
    const nextItems = appendHomeCustomItemToCategory(currentItems, item);
    dependencies.saveLocalCustomItems(nextItems);
    if (itemInitialRoughState !== null) {
      const nextRoughStates = {
        ...currentRoughStates,
        [itemId]: itemInitialRoughState,
      };
      dependencies.saveLocalRoughStates(nextRoughStates);
    }
  }

  return { item, initialRoughState: itemInitialRoughState };
}

export async function saveHomeCustomItemEdit(
  dataSource: Exclude<HomeDataSource, { mode: "shared-error" }>,
  itemId: string,
  nextItems: CustomizableItem[],
  sharedChanges: SaveSharedItemTemplateEditInput["changes"],
  dependencies: SaveHomeCustomItemEditDependencies,
) {
  if (sharedChanges.count !== undefined) {
    assertValidHomeItemQuantity(sharedChanges.count);
  }
  if (sharedChanges.unit !== undefined) {
    assertValidHomeRoughUnit(sharedChanges.unit);
  }

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

export function saveHomeCustomItemDelete(
  dataSource: Exclude<HomeDataSource, { mode: "shared-error" }>,
  itemId: string,
  nextItems: CustomizableItem[],
  dependencies: SaveHomeCustomItemDeleteDependencies,
) {
  if (dataSource.mode === "shared") {
    return dependencies.saveSharedItemTemplateDelete({
      familyId: dataSource.familyId,
      childId: dataSource.initialData.childId,
      itemId,
    });
  }

  dependencies.saveLocalCustomItems(nextItems);
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
