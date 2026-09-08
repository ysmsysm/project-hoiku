import type { SharedSettingsAppData } from "./shared-settings";
import type { CustomItemCategory } from "../../types/preparation";

export const sharedSettingsPreviewCacheKey =
  "kodomo-locker:shared-settings-preview:v1";

export type SharedSettingsPreviewItem = {
  id: string;
  name: string;
  unit: string;
  count: number;
  category: CustomItemCategory;
  weekdays: number[];
  roughState: "十分" | "少ない" | "補充" | null;
};

export type SharedSettingsPreview = {
  version: 1;
  childName: string;
  items: SharedSettingsPreviewItem[];
};

const categories: CustomItemCategory[] = [
  "持ち物",
  "スポット追加",
  "ざっくり管理",
];
const roughStates = ["十分", "少ない", "補充"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCategory = (value: unknown): value is CustomItemCategory =>
  typeof value === "string" && categories.includes(value as CustomItemCategory);

const isWeekdays = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length <= 7 &&
  value.every(
    (weekday, index) =>
      Number.isInteger(weekday) &&
      weekday >= 0 &&
      weekday <= 6 &&
      value.indexOf(weekday) === index,
  );

const isRoughState = (
  value: unknown,
): value is SharedSettingsPreviewItem["roughState"] =>
  value === null ||
  (typeof value === "string" &&
    roughStates.includes(value as (typeof roughStates)[number]));

const parseItem = (value: unknown): SharedSettingsPreviewItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    Array.from(value.name).length > 80 ||
    typeof value.unit !== "string" ||
    Array.from(value.unit).length > 16 ||
    !Number.isInteger(value.count) ||
    (value.count as number) < 0 ||
    (value.count as number) > 999 ||
    !isCategory(value.category) ||
    !isWeekdays(value.weekdays) ||
    !isRoughState(value.roughState)
  ) {
    return null;
  }

  if (
    (value.category !== "スポット追加" && value.weekdays.length > 0) ||
    (value.category === "スポット追加" && (value.count as number) > 5) ||
    (value.category === "ざっくり管理") !== (value.roughState !== null)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    unit: value.unit,
    count: value.count as number,
    category: value.category,
    weekdays: [...value.weekdays],
    roughState: value.roughState,
  };
};

export function createSharedSettingsPreview(
  data: SharedSettingsAppData,
): SharedSettingsPreview {
  return {
    version: 1,
    childName: data.childProfile.name,
    items: data.customItems.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      count: item.count,
      category: item.category,
      weekdays: [...(item.weekdays ?? [])],
      roughState:
        item.category === "ざっくり管理"
          ? (data.roughStates[item.id] ?? null)
          : null,
    })),
  };
}

export function parseSharedSettingsPreview(
  serialized: string,
): SharedSettingsPreview | null {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }

  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.childName !== "string" ||
    value.childName.trim().length === 0 ||
    Array.from(value.childName).length > 8 ||
    !Array.isArray(value.items) ||
    value.items.length > 500
  ) {
    return null;
  }

  const items = value.items.map(parseItem);
  if (items.some((item) => item === null)) {
    return null;
  }

  const validItems = items as SharedSettingsPreviewItem[];
  if (new Set(validItems.map((item) => item.id)).size !== validItems.length) {
    return null;
  }

  return {
    version: 1,
    childName: value.childName,
    items: validItems,
  };
}

export function loadSharedSettingsPreview(): SharedSettingsPreview | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const serialized = window.localStorage.getItem(
      sharedSettingsPreviewCacheKey,
    );
    if (!serialized) {
      return null;
    }

    const preview = parseSharedSettingsPreview(serialized);
    if (!preview) {
      window.localStorage.removeItem(sharedSettingsPreviewCacheKey);
    }
    return preview;
  } catch {
    return null;
  }
}

export function saveSharedSettingsPreview(data: SharedSettingsAppData) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      sharedSettingsPreviewCacheKey,
      JSON.stringify(createSharedSettingsPreview(data)),
    );
  } catch {
    // A preview cache failure must not affect the canonical shared flow.
  }
}

export function clearSharedSettingsPreview() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(sharedSettingsPreviewCacheKey);
  } catch {
    // A preview cache failure must not affect local mode.
  }
}
