import type { ChildProfile } from "../../types/child";
import type { CustomizableItem } from "../../types/preparation";

export type RoughState = "十分" | "少ない" | "補充";
export type PayloadValidationIssue = {
  path: string;
  code: string;
};

export type PayloadValidationResult =
  | { ok: true }
  | { ok: false; issues: PayloadValidationIssue[] };

export type FamilySharingLocalData = {
  child: ChildProfile;
  items: CustomizableItem[];
  roughStates: Record<string, RoughState>;
};

export type StartFamilyDataSharingPayload = {
  child: {
    name: string;
    iconType: ChildProfile["iconType"];
    iconId: ChildProfile["iconId"];
    iconUrl: string | null;
  };
  items: {
    localId: string;
    name: string;
    category: CustomizableItem["category"];
    count: number;
    unit: string;
    weekdays: number[];
    sortOrder: number;
    roughState: RoughState | null;
  }[];
};

const allowedRootKeys = ["child", "items"] as const;
const allowedChildKeys = ["name", "iconType", "iconId", "iconUrl"] as const;
const allowedItemKeys = [
  "localId",
  "name",
  "category",
  "count",
  "unit",
  "weekdays",
  "sortOrder",
  "roughState",
] as const;
const allowedCategories = ["持ち物", "スポット追加", "ざっくり管理"] as const;
const allowedRoughStates = ["十分", "少ない", "補充"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const charLength = (value: string) => Array.from(value).length;

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) => Object.keys(value).every((key) => allowedKeys.includes(key));

const isAllowedCategory = (
  value: unknown,
): value is CustomizableItem["category"] =>
  typeof value === "string" &&
  allowedCategories.includes(value as CustomizableItem["category"]);

const isAllowedRoughState = (value: unknown): value is RoughState =>
  typeof value === "string" && allowedRoughStates.includes(value as RoughState);

const addIssue = (
  issues: PayloadValidationIssue[],
  path: string,
  code: string,
) => {
  issues.push({ path, code });
};

export function buildStartFamilyDataSharingPayload(
  data: FamilySharingLocalData,
): StartFamilyDataSharingPayload {
  return {
    child: {
      name: data.child.name.trim(),
      iconType: data.child.iconType,
      iconId: data.child.iconId,
      iconUrl: data.child.iconType === "image" ? data.child.iconUrl : null,
    },
    items: data.items.map((item, index) => {
      const isSpotItem = item.category === "スポット追加";
      const isRoughItem = item.category === "ざっくり管理";

      return {
        localId: item.id,
        name: item.name.trim(),
        category: item.category,
        count: item.count,
        unit: item.unit,
        weekdays: isSpotItem ? [...(item.weekdays ?? [])] : [],
        sortOrder: index,
        roughState: isRoughItem ? (data.roughStates[item.id] ?? "十分") : null,
      };
    }),
  };
}

export function validateStartFamilyDataSharingPayload(
  payload: unknown,
): PayloadValidationResult {
  const issues: PayloadValidationIssue[] = [];

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      issues: [{ path: "$", code: "invalid_payload" }],
    };
  }

  if (!hasOnlyKeys(payload, allowedRootKeys)) {
    addIssue(issues, "$", "unexpected_key");
  }

  const child = payload.child;
  if (!isPlainObject(child)) {
    addIssue(issues, "child", "invalid_child");
  } else {
    validateChildPayload(child, issues);
  }

  const items = payload.items;
  if (!Array.isArray(items)) {
    addIssue(issues, "items", "invalid_items");
  } else {
    validateItemsPayload(items, issues);
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function validateChildPayload(
  child: Record<string, unknown>,
  issues: PayloadValidationIssue[],
) {
  if (!hasOnlyKeys(child, allowedChildKeys)) {
    addIssue(issues, "child", "unexpected_key");
  }

  const name = child.name;
  if (typeof name !== "string") {
    addIssue(issues, "child.name", "invalid_child_name");
  } else {
    const normalizedName = name.trim();
    const nameLength = charLength(normalizedName);
    if (nameLength < 1 || nameLength > 8) {
      addIssue(issues, "child.name", "invalid_child_name");
    }
  }

  const iconType =
    child.iconType === undefined || child.iconType === null
      ? "default"
      : child.iconType;
  if (iconType !== "default" && iconType !== "image") {
    addIssue(issues, "child.iconType", "invalid_child_icon_type");
  }

  const iconId =
    child.iconId === undefined || child.iconId === null
      ? "default-baby"
      : child.iconId;
  if (iconId !== "default-baby") {
    addIssue(issues, "child.iconId", "invalid_child_icon_id");
  }

  let iconUrl: string | null = null;
  if (child.iconUrl !== undefined && child.iconUrl !== null) {
    if (typeof child.iconUrl !== "string") {
      addIssue(issues, "child.iconUrl", "invalid_child_icon_url");
    } else {
      const trimmedIconUrl = child.iconUrl.trim();
      iconUrl = trimmedIconUrl || null;
      if (iconUrl !== null && charLength(iconUrl) > 2048) {
        addIssue(issues, "child.iconUrl", "invalid_child_icon_url");
      }
    }
  }

  if (iconType === "image" && iconUrl === null) {
    addIssue(issues, "child.iconUrl", "invalid_child_icon_image_url");
  }

  if (iconType === "default" && iconUrl !== null) {
    addIssue(issues, "child.iconUrl", "invalid_child_icon_default_url");
  }
}

function validateItemsPayload(
  items: unknown[],
  issues: PayloadValidationIssue[],
) {
  if (items.length > 200) {
    addIssue(issues, "items", "invalid_items_count");
  }

  const localIds = new Set<string>();

  items.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!isPlainObject(item)) {
      addIssue(issues, path, "invalid_item");
      return;
    }

    if (!hasOnlyKeys(item, allowedItemKeys)) {
      addIssue(issues, path, "unexpected_key");
    }

    const localId =
      typeof item.localId === "string" ? item.localId.trim() : null;
    if (!localId || charLength(localId) > 128) {
      addIssue(issues, `${path}.localId`, "invalid_item_local_id");
    } else if (localIds.has(localId)) {
      addIssue(issues, `${path}.localId`, "duplicate_item_local_id");
    } else {
      localIds.add(localId);
    }

    if (typeof item.name !== "string") {
      addIssue(issues, `${path}.name`, "invalid_item_name");
    } else {
      const nameLength = charLength(item.name.trim());
      if (nameLength < 1 || nameLength > 80) {
        addIssue(issues, `${path}.name`, "invalid_item_name");
      }
    }

    const category = item.category;
    if (!isAllowedCategory(category)) {
      addIssue(issues, `${path}.category`, "invalid_item_category");
    }

    validateItemCount(item.count, category, `${path}.count`, issues);

    if (typeof item.unit !== "string" || charLength(item.unit) > 16) {
      addIssue(issues, `${path}.unit`, "invalid_item_unit");
    }

    if (
      typeof item.sortOrder !== "number" ||
      !Number.isInteger(item.sortOrder) ||
      item.sortOrder < 0 ||
      item.sortOrder > 100000
    ) {
      addIssue(issues, `${path}.sortOrder`, "invalid_item_sort_order");
    }

    validateItemWeekdays(item.weekdays, category, `${path}.weekdays`, issues);
    validateItemRoughState(
      item.roughState,
      category,
      `${path}.roughState`,
      issues,
    );
  });
}

function validateItemCount(
  count: unknown,
  category: unknown,
  path: string,
  issues: PayloadValidationIssue[],
) {
  if (typeof count !== "number" || !Number.isInteger(count)) {
    addIssue(issues, path, "invalid_item_count");
    return;
  }

  if (category === "スポット追加") {
    if (count < 1 || count > 99) {
      addIssue(issues, path, "invalid_item_count");
    }
    return;
  }

  if (count < 0 || count > 999) {
    addIssue(issues, path, "invalid_item_count");
  }
}

function validateItemWeekdays(
  weekdays: unknown,
  category: unknown,
  path: string,
  issues: PayloadValidationIssue[],
) {
  if (!Array.isArray(weekdays)) {
    addIssue(issues, path, "invalid_item_weekdays");
    return;
  }

  if (category !== "スポット追加" && weekdays.length > 0) {
    addIssue(issues, path, "invalid_item_weekdays");
  }

  if (category === "スポット追加" && weekdays.length > 2) {
    addIssue(issues, path, "invalid_item_weekdays");
  }

  const seenWeekdays = new Set<number>();
  weekdays.forEach((weekday, index) => {
    if (
      typeof weekday !== "number" ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6
    ) {
      addIssue(issues, `${path}[${index}]`, "invalid_item_weekday");
      return;
    }

    if (seenWeekdays.has(weekday)) {
      addIssue(issues, `${path}[${index}]`, "duplicate_item_weekday");
      return;
    }

    seenWeekdays.add(weekday);
  });
}

function validateItemRoughState(
  roughState: unknown,
  category: unknown,
  path: string,
  issues: PayloadValidationIssue[],
) {
  if (category === "ざっくり管理") {
    if (!isAllowedRoughState(roughState)) {
      addIssue(issues, path, "invalid_item_rough_state");
    }
    return;
  }

  if (roughState !== null && roughState !== undefined) {
    addIssue(issues, path, "invalid_item_rough_state");
  }
}
