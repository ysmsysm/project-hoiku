import type { DailyItem, DailySession } from "../../types/daily";
import type {
  PreparationItem,
  PreparationSession,
} from "../../types/preparation";
import type {
  SharedDailyCheckItem,
  SharedDailyCheckView,
} from "../../types/shared-daily";

export function getDailyItemPreparationCount(item: DailyItem): number {
  if (item.kind === "regular") {
    const currentShortage =
      item.shortageCount ??
      Math.max(
        0,
        item.requiredQuantity - (item.observedQuantity ?? 0),
      );
    return Math.max(
      currentShortage,
      item.carryoverPendingShortageCount ?? 0,
    );
  }

  return item.requiredQuantity;
}

export function isDailyItemVisibleInPreparation(item: DailyItem): boolean {
  const count = getDailyItemPreparationCount(item);
  if (count <= 0) {
    return false;
  }

  if (item.kind === "rough") {
    return item.roughState === "refill" || item.isCarryover;
  }

  return true;
}

const preparationSourceByKind = {
  regular: "locker",
  spot: "spot",
  rough: "stock",
} as const;

function mapDailyItemToPreparationItem(
  item: DailyItem,
): PreparationItem {
  return {
    id: item.itemTemplateId ?? item.dailyItemId,
    dailyItemId: item.dailyItemId,
    itemTemplateId: item.itemTemplateId,
    dailyItemVersion: item.version,
    dailyKind: item.kind,
    name: item.name,
    unit: item.unit ?? "",
    count: getDailyItemPreparationCount(item),
    checked: item.isPrepared,
    later: item.isDeferred,
    carryover: item.isCarryover,
    source: preparationSourceByKind[item.kind],
    dueDate: item.dueDate,
  };
}

export function mapDailySessionToPreparationSession(
  session: DailySession,
): PreparationSession {
  return {
    date: session.sessionDate,
    checkedBy: session.checkedByDisplayName ?? "",
    confirmedAt: session.checkedAt,
    completedAt: session.completedAt,
    items: session.items
      .filter(isDailyItemVisibleInPreparation)
      .map(mapDailyItemToPreparationItem),
    thanksSent: session.thanksSent,
  };
}

function mapDailyItemToCheckItem(item: DailyItem): SharedDailyCheckItem {
  return {
    id: item.itemTemplateId ?? item.dailyItemId,
    dailyItemId: item.dailyItemId,
    itemTemplateId: item.itemTemplateId,
    version: item.version,
    name: item.name,
    unit: item.unit ?? "",
    requiredQuantity: item.requiredQuantity,
    observedQuantity: item.observedQuantity ?? 0,
    isChecked: item.isChecked,
  };
}

export function mapDailySessionToCheckView(
  session: DailySession,
): SharedDailyCheckView {
  return {
    items: session.items
      .filter(
        (item) => item.kind === "regular" && item.requiredQuantity > 0,
      )
      .map(mapDailyItemToCheckItem),
  };
}
