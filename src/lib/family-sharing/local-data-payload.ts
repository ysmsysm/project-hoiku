import { defaultCustomItems, defaultRoughStates } from "../../data/defaultCustomItems";
import { defaultChildProfile } from "../storage";
import type { ChildProfile } from "../../types/child";
import type { CustomizableItem } from "../../types/preparation";
import type { AppRepository } from "../repositories/AppRepository";
import { appRepository } from "../repositories/app-repository";
import {
  buildStartFamilyDataSharingPayload,
  type PayloadValidationIssue,
  type FamilySharingLocalData,
  type RoughState,
  type StartFamilyDataSharingPayload,
  validateStartFamilyDataSharingPayload,
} from "./start-payload";

export {
  buildStartFamilyDataSharingPayload,
  validateStartFamilyDataSharingPayload,
};
export type { FamilySharingLocalData, StartFamilyDataSharingPayload };

const childProfileKey = "project-hoiku:child-profile";
const customItemsKey = "project-hoiku:custom-items";
const roughStatesKey = "project-hoiku:rough-states";

export type FamilySharingLocalStorageStatus = "saved" | "missing" | "invalid";

export type FamilySharingLocalStorageIssue = {
  key: "childProfile" | "customItems" | "roughStates" | "payload";
  code: string;
};

export type FamilySharingRawStorage = {
  childProfile: string | null;
  customItems: string | null;
  roughStates: string | null;
};

export type FamilySharingLocalDataPreparation =
  | {
      ok: true;
      data: FamilySharingLocalData;
      payload: StartFamilyDataSharingPayload;
      childName: string;
      storageStatus: Record<
        "childProfile" | "customItems" | "roughStates",
        FamilySharingLocalStorageStatus
      >;
      missingDefaultLabels: string[];
    }
  | {
      ok: false;
      childName: string | null;
      storageStatus: Record<
        "childProfile" | "customItems" | "roughStates",
        FamilySharingLocalStorageStatus
      >;
      missingDefaultLabels: string[];
      issues: (FamilySharingLocalStorageIssue | PayloadValidationIssue)[];
    };

type ParseResult<T> =
  | { status: "saved"; value: T }
  | { status: "missing"; value: T; defaultLabel: string }
  | { status: "invalid"; issue: FamilySharingLocalStorageIssue };

const canUseStorage = () => typeof window !== "undefined";

const cloneChildProfile = (profile: ChildProfile): ChildProfile => ({
  ...profile,
});

const cloneCustomItem = (item: CustomizableItem): CustomizableItem => ({
  ...item,
  weekdays: item.weekdays ? [...item.weekdays] : undefined,
});

const cloneDefaultCustomItems = () => defaultCustomItems.map(cloneCustomItem);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJson = (
  rawValue: string,
  key: FamilySharingLocalStorageIssue["key"],
) => {
  try {
    return { ok: true as const, value: JSON.parse(rawValue) as unknown };
  } catch {
    return {
      ok: false as const,
      issue: { key, code: "invalid_json" },
    };
  }
};

const normalizeCategory = (value: unknown) =>
  value === "今日だけ追加" ? "スポット追加" : value;

const isCustomItemCategory = (
  value: unknown,
): value is CustomizableItem["category"] =>
  value === "持ち物" || value === "スポット追加" || value === "ざっくり管理";

const isRoughState = (value: unknown): value is RoughState =>
  value === "十分" || value === "少ない" || value === "補充";

const isIntegerNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

export function createDefaultRoughStates(
  items: readonly CustomizableItem[],
): Record<string, RoughState> {
  return items.reduce<Record<string, RoughState>>((states, item) => {
    if (item.category === "ざっくり管理") {
      states[item.id] =
        defaultRoughStates[item.id as keyof typeof defaultRoughStates] ?? "十分";
    }

    return states;
  }, {});
}

export function loadFamilySharingLocalData(
  repository: AppRepository = appRepository,
): FamilySharingLocalData {
  const items = repository.loadCustomItems(defaultCustomItems);

  return {
    child: repository.loadChildProfile(),
    items,
    roughStates: repository.loadRoughStates(createDefaultRoughStates(items)),
  };
}

export function readFamilySharingRawStorage(): FamilySharingRawStorage {
  if (!canUseStorage()) {
    return {
      childProfile: null,
      customItems: null,
      roughStates: null,
    };
  }

  return {
    childProfile: window.localStorage.getItem(childProfileKey),
    customItems: window.localStorage.getItem(customItemsKey),
    roughStates: window.localStorage.getItem(roughStatesKey),
  };
}

export function prepareFamilySharingLocalDataFromStorage(
  rawStorage: FamilySharingRawStorage = readFamilySharingRawStorage(),
): FamilySharingLocalDataPreparation {
  const childProfile = parseChildProfile(rawStorage.childProfile);
  const customItems = parseCustomItems(rawStorage.customItems);
  const roughStates = parseRoughStates(
    rawStorage.roughStates,
    customItems.status === "invalid" ? [] : customItems.value,
  );
  const storageStatus = {
    childProfile: childProfile.status,
    customItems: customItems.status,
    roughStates: roughStates.status,
  };
  const missingDefaultLabels = [
    childProfile.status === "missing" ? childProfile.defaultLabel : null,
    customItems.status === "missing" ? customItems.defaultLabel : null,
    roughStates.status === "missing" ? roughStates.defaultLabel : null,
  ].filter((label): label is string => label !== null);

  if (childProfile.status === "invalid") {
    return {
      ok: false,
      childName: null,
      storageStatus,
      missingDefaultLabels,
      issues: [childProfile.issue],
    };
  }

  if (customItems.status === "invalid") {
    return {
      ok: false,
      childName: childProfile.value.name,
      storageStatus,
      missingDefaultLabels,
      issues: [customItems.issue],
    };
  }

  if (roughStates.status === "invalid") {
    return {
      ok: false,
      childName: childProfile.value.name,
      storageStatus,
      missingDefaultLabels,
      issues: [roughStates.issue],
    };
  }

  const data: FamilySharingLocalData = {
    child: childProfile.value,
    items: customItems.value,
    roughStates: roughStates.value,
  };
  const payload = buildStartFamilyDataSharingPayload(data);
  const validation = validateStartFamilyDataSharingPayload(payload);

  if (validation.ok === false) {
    return {
      ok: false,
      childName: payload.child.name,
      storageStatus,
      missingDefaultLabels,
      issues: validation.issues,
    };
  }

  return {
    ok: true,
    data,
    payload,
    childName: payload.child.name,
    storageStatus,
    missingDefaultLabels,
  };
}

function parseChildProfile(rawValue: string | null): ParseResult<ChildProfile> {
  if (rawValue === null) {
    return {
      status: "missing",
      value: cloneChildProfile(defaultChildProfile),
      defaultLabel: "子ども設定",
    };
  }

  const parsed = parseJson(rawValue, "childProfile");
  if (!parsed.ok) {
    return { status: "invalid", issue: parsed.issue };
  }

  if (!isPlainObject(parsed.value)) {
    return {
      status: "invalid",
      issue: { key: "childProfile", code: "invalid_structure" },
    };
  }

  const savedName = parsed.value.name;

  if (typeof savedName !== "string") {
    return {
      status: "invalid",
      issue: { key: "childProfile", code: "invalid_structure" },
    };
  }

  const iconUrlResult = normalizeIconUrl(parsed.value);
  if (!iconUrlResult.ok) {
    return {
      status: "invalid",
      issue: { key: "childProfile", code: "invalid_icon_url" },
    };
  }

  const iconUrl = iconUrlResult.value;
  if (parsed.value.iconType === "image" && !iconUrl) {
    return {
      status: "invalid",
      issue: { key: "childProfile", code: "missing_image_icon_url" },
    };
  }

  const iconType =
    parsed.value.iconType === "image" && iconUrl ? "image" : "default";

  if (
    parsed.value.iconType !== undefined &&
    parsed.value.iconType !== "default" &&
    parsed.value.iconType !== "image"
  ) {
    return {
      status: "invalid",
      issue: { key: "childProfile", code: "invalid_icon_type" },
    };
  }

  if (
    parsed.value.iconId !== undefined &&
    parsed.value.iconId !== "default-baby"
  ) {
    return {
      status: "invalid",
      issue: { key: "childProfile", code: "invalid_icon_id" },
    };
  }

  const birthday = parsed.value.birthday;
  const normalizedBirthday = typeof birthday === "string" ? birthday : null;

  return {
    status: "saved",
    value: {
      ...cloneChildProfile(defaultChildProfile),
      name: savedName,
      iconType,
      iconId: "default-baby",
      iconUrl,
      photoUrl: iconUrl,
      birthday: normalizedBirthday,
    },
  };
}

function normalizeIconUrl(
  value: Record<string, unknown>,
): { ok: true; value: string | null } | { ok: false } {
  if (typeof value.iconUrl === "string" && value.iconUrl.trim()) {
    return { ok: true, value: value.iconUrl };
  }

  if (typeof value.photoUrl === "string" && value.photoUrl.trim()) {
    return { ok: true, value: value.photoUrl };
  }

  if (
    value.iconUrl !== undefined &&
    value.iconUrl !== null &&
    typeof value.iconUrl !== "string"
  ) {
    return { ok: false };
  }

  if (
    value.photoUrl !== undefined &&
    value.photoUrl !== null &&
    typeof value.photoUrl !== "string"
  ) {
    return { ok: false };
  }

  return { ok: true, value: null };
}

function parseCustomItems(
  rawValue: string | null,
): ParseResult<CustomizableItem[]> {
  if (rawValue === null) {
    return {
      status: "missing",
      value: cloneDefaultCustomItems(),
      defaultLabel: "持ち物設定",
    };
  }

  const parsed = parseJson(rawValue, "customItems");
  if (!parsed.ok) {
    return { status: "invalid", issue: parsed.issue };
  }

  if (!Array.isArray(parsed.value)) {
    return {
      status: "invalid",
      issue: { key: "customItems", code: "invalid_structure" },
    };
  }

  const items: CustomizableItem[] = [];
  for (const item of parsed.value) {
    if (!isPlainObject(item)) {
      return {
        status: "invalid",
        issue: { key: "customItems", code: "invalid_item_structure" },
      };
    }

    const category = normalizeCategory(item.category);
    if (
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.unit !== "string" ||
      !isIntegerNumber(item.count) ||
      !isCustomItemCategory(category)
    ) {
      return {
        status: "invalid",
        issue: { key: "customItems", code: "invalid_item_type" },
      };
    }

    if (
      item.weekdays !== undefined &&
      (!Array.isArray(item.weekdays) ||
        !item.weekdays.every((weekday) => isIntegerNumber(weekday)))
    ) {
      return {
        status: "invalid",
        issue: { key: "customItems", code: "invalid_item_weekdays_type" },
      };
    }

    const weekdays = Array.isArray(item.weekdays) ? item.weekdays : [];

    items.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      count: item.count,
      category,
      weekdays: [...weekdays],
    });
  }

  return { status: "saved", value: items };
}

function parseRoughStates(
  rawValue: string | null,
  items: readonly CustomizableItem[],
): ParseResult<Record<string, RoughState>> {
  const defaults = createDefaultRoughStates(items);

  if (rawValue === null) {
    return {
      status: "missing",
      value: defaults,
      defaultLabel: "ざっくり管理の状態",
    };
  }

  const parsed = parseJson(rawValue, "roughStates");
  if (!parsed.ok) {
    return { status: "invalid", issue: parsed.issue };
  }

  if (!isPlainObject(parsed.value)) {
    return {
      status: "invalid",
      issue: { key: "roughStates", code: "invalid_structure" },
    };
  }

  const roughStates: Record<string, RoughState> = { ...defaults };
  for (const [itemId, state] of Object.entries(parsed.value)) {
    if (!isRoughState(state)) {
      return {
        status: "invalid",
        issue: { key: "roughStates", code: "invalid_rough_state" },
      };
    }

    roughStates[itemId] = state;
  }

  return { status: "saved", value: roughStates };
}
