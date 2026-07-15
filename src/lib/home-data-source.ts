import type { SharedSettingsAppData } from "./family-sharing/shared-settings";

export type HomeSharedErrorReason =
  | "membership-query-failed"
  | "settings-query-failed"
  | "shared-data-missing"
  | "shared-data-invalid";

export type HomeDataSource =
  | {
      mode: "local";
    }
  | {
      mode: "shared";
      familyId: string;
      initialData: SharedSettingsAppData;
      childProfileEditable: true;
      durableItemsEditable: false;
    }
  | {
      mode: "shared-error";
      reason: HomeSharedErrorReason;
    };

export type HomeLocalStorageLoadPlan = {
  durableSettings: boolean;
  dailyData: boolean;
};

type SharedSettingsLoadErrorLike = {
  type:
    | "query_failed"
    | "child_missing"
    | "multiple_children"
    | "invalid_data";
};

export const sharedSettingsReadonlyMessage =
  "家族共有中の設定編集は、現在準備中です。";

export const sharedSettingsLoadErrorTitle =
  "家族共有データを読み込めませんでした。";

export const sharedSettingsLoadErrorBody = "ページを再読み込みしてください。";

export function getHomeLocalStorageLoadPlan(
  dataSource: HomeDataSource,
): HomeLocalStorageLoadPlan {
  return {
    durableSettings: dataSource.mode === "local",
    dailyData: dataSource.mode !== "shared-error",
  };
}

export function getSharedInitialDurableSettings(dataSource: HomeDataSource) {
  return dataSource.mode === "shared" ? dataSource.initialData : null;
}

export function canEditHomeDurableSettings(dataSource: HomeDataSource) {
  return dataSource.mode === "local";
}

export function canEditHomeExistingItemDetails(dataSource: HomeDataSource) {
  return dataSource.mode === "local" || dataSource.mode === "shared";
}

export function canEditHomeRoughItemUnit(dataSource: HomeDataSource) {
  return dataSource.mode === "local" || dataSource.mode === "shared";
}

export function canToggleHomeRoughState(dataSource: HomeDataSource) {
  return dataSource.mode === "local" || dataSource.mode === "shared";
}

export function canAddHomeDurableItems(dataSource: HomeDataSource) {
  return dataSource.mode === "local";
}

export function canDeleteHomeDurableItems(dataSource: HomeDataSource) {
  return dataSource.mode === "local";
}

export function canEditHomeItemWeekdays(dataSource: HomeDataSource) {
  return dataSource.mode === "local";
}

export function canSortHomeDurableItems(dataSource: HomeDataSource) {
  return dataSource.mode === "local";
}

export function canEditHomeChildProfile(dataSource: HomeDataSource) {
  return dataSource.mode === "local" || dataSource.mode === "shared";
}

export function toHomeSharedErrorReason(
  error: SharedSettingsLoadErrorLike,
): HomeSharedErrorReason {
  if (error.type === "query_failed") {
    return "settings-query-failed";
  }

  if (error.type === "child_missing") {
    return "shared-data-missing";
  }

  return "shared-data-invalid";
}
