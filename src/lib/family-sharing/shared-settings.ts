import { defaultCustomItems, defaultRoughStates } from "../../data/defaultCustomItems";
import type { ChildProfile } from "../../types/child";
import type {
  CustomizableItem,
  CustomItemCategory,
} from "../../types/preparation";

export type SharedSettingsChildRow = {
  id: string;
  family_id: string;
  name: string;
  icon_type: string | null;
  icon_id: string | null;
  icon_url: string | null;
};

export type SharedSettingsItemTemplateRow = {
  id: string;
  family_id: string;
  child_id: string;
  kind: string;
  name: string;
  default_quantity: number;
  unit: string | null;
  sort_order: number;
  current_rough_state: string | null;
};

export type SharedSettingsWeekdayRow = {
  item_template_id: string;
  family_id: string;
  weekday: number;
};

export type SharedSettingsRows = {
  children: SharedSettingsChildRow[];
  itemTemplates: SharedSettingsItemTemplateRow[];
  itemTemplateWeekdays: SharedSettingsWeekdayRow[];
};

export type SharedSettingsAppData = {
  childId: string;
  childProfile: ChildProfile;
  customItems: CustomizableItem[];
  roughStates: Record<string, RoughState>;
};

export type RoughState = (typeof roughStateByDbValue)[keyof typeof roughStateByDbValue];

export type SharedSettingsValidationIssue = {
  code: string;
  path: string;
};

export type SharedSettingsDataErrorCode =
  | "child_missing"
  | "multiple_children"
  | "invalid_data";

export type SharedSettingsDataError = {
  code: SharedSettingsDataErrorCode;
  issues: SharedSettingsValidationIssue[];
};

export type SharedSettingsMappingResult =
  | { ok: true; data: SharedSettingsAppData }
  | { ok: false; error: SharedSettingsDataError };

const itemKindToCategory = {
  regular: defaultCustomItems[0].category,
  spot: defaultCustomItems[6].category,
  rough: defaultCustomItems[9].category,
} satisfies Record<string, CustomItemCategory>;

const roughStateByDbValue = {
  enough: defaultRoughStates["rough-diaper"],
  low: defaultRoughStates["rough-wipe"],
  refill: defaultRoughStates["rough-tissue"],
} as const;

const isPlainString = (value: unknown): value is string =>
  typeof value === "string";

const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const charLength = (value: string) => Array.from(value).length;

const addIssue = (
  issues: SharedSettingsValidationIssue[],
  path: string,
  code: string,
) => {
  issues.push({ path, code });
};

const isKnownKind = (
  value: string,
): value is keyof typeof itemKindToCategory =>
  value === "regular" || value === "spot" || value === "rough";

const isKnownRoughState = (
  value: string,
): value is keyof typeof roughStateByDbValue =>
  value === "enough" || value === "low" || value === "refill";

export function mapSharedSettingsRowsToAppData(
  rows: SharedSettingsRows,
): SharedSettingsMappingResult {
  if (rows.children.length === 0) {
    return {
      ok: false,
      error: {
        code: "child_missing",
        issues: [{ path: "children", code: "child_missing" }],
      },
    };
  }

  if (rows.children.length > 1) {
    return {
      ok: false,
      error: {
        code: "multiple_children",
        issues: [{ path: "children", code: "multiple_children" }],
      },
    };
  }

  const issues: SharedSettingsValidationIssue[] = [];
  const child = rows.children[0];
  validateChild(child, issues);

  const itemTemplateIds = new Set(rows.itemTemplates.map((item) => item.id));
  const weekdaysByTemplateId = collectWeekdaysByTemplateId(
    rows.itemTemplateWeekdays,
    itemTemplateIds,
    issues,
  );
  const itemIds = new Set<string>();

  rows.itemTemplates.forEach((item, index) => {
    validateItemTemplate(item, index, child.id, itemIds, weekdaysByTemplateId, issues);
  });

  if (issues.length > 0) {
    return {
      ok: false,
      error: {
        code: "invalid_data",
        issues,
      },
    };
  }

  const sortedItems = [...rows.itemTemplates].sort(
    (first, second) =>
      first.sort_order - second.sort_order || first.id.localeCompare(second.id),
  );
  const customItems: CustomizableItem[] = sortedItems.map((item) => ({
    id: item.id,
    name: item.name,
    unit: item.unit as string,
    count: item.default_quantity,
    category: itemKindToCategory[item.kind as keyof typeof itemKindToCategory],
    weekdays: [...(weekdaysByTemplateId.get(item.id) ?? [])],
  }));
  const roughStates = sortedItems.reduce<Record<string, RoughState>>(
    (states, item) => {
      if (item.kind === "rough") {
        states[item.id] =
          roughStateByDbValue[
            item.current_rough_state as keyof typeof roughStateByDbValue
          ];
      }

      return states;
    },
    {},
  );

  return {
    ok: true,
    data: {
      childId: child.id,
      childProfile: mapChildToProfile(child),
      customItems,
      roughStates,
    },
  };
}

function mapChildToProfile(child: SharedSettingsChildRow): ChildProfile {
  const iconType = child.icon_type as ChildProfile["iconType"];
  const iconId = child.icon_id as ChildProfile["iconId"];
  const iconUrl = iconType === "image" ? child.icon_url : null;

  return {
    name: child.name,
    iconType,
    iconId,
    iconUrl,
    birthday: null,
    photoUrl: iconUrl,
  };
}

function validateChild(
  child: SharedSettingsChildRow,
  issues: SharedSettingsValidationIssue[],
) {
  if (!isPlainString(child.name) || charLength(child.name.trim()) < 1) {
    addIssue(issues, "children[0].name", "invalid_child_name");
  }

  if (child.icon_type !== "default" && child.icon_type !== "image") {
    addIssue(issues, "children[0].icon_type", "invalid_icon_type");
    return;
  }

  if (child.icon_id !== "default-baby") {
    addIssue(issues, "children[0].icon_id", "invalid_icon_id");
  }

  if (child.icon_type === "image") {
    if (!isPlainString(child.icon_url) || child.icon_url.trim() === "") {
      addIssue(issues, "children[0].icon_url", "missing_image_icon_url");
    } else if (charLength(child.icon_url) > 2048) {
      addIssue(issues, "children[0].icon_url", "invalid_icon_url");
    }
  }

  if (child.icon_type === "default" && child.icon_url !== null) {
    addIssue(issues, "children[0].icon_url", "invalid_default_icon_url");
  }
}

function collectWeekdaysByTemplateId(
  weekdays: SharedSettingsWeekdayRow[],
  itemTemplateIds: Set<string>,
  issues: SharedSettingsValidationIssue[],
) {
  const weekdaysByTemplateId = new Map<string, number[]>();
  const seenByTemplateId = new Map<string, Set<number>>();

  weekdays.forEach((weekdayRow, index) => {
    const path = `itemTemplateWeekdays[${index}]`;
    if (!itemTemplateIds.has(weekdayRow.item_template_id)) {
      addIssue(issues, `${path}.item_template_id`, "unknown_item_template_id");
    }

    if (!isInteger(weekdayRow.weekday) || weekdayRow.weekday < 0 || weekdayRow.weekday > 6) {
      addIssue(issues, `${path}.weekday`, "invalid_item_weekday");
      return;
    }

    const seenWeekdays =
      seenByTemplateId.get(weekdayRow.item_template_id) ?? new Set<number>();
    if (seenWeekdays.has(weekdayRow.weekday)) {
      addIssue(issues, `${path}.weekday`, "duplicate_item_weekday");
      return;
    }

    seenWeekdays.add(weekdayRow.weekday);
    seenByTemplateId.set(weekdayRow.item_template_id, seenWeekdays);
    const itemWeekdays = weekdaysByTemplateId.get(weekdayRow.item_template_id) ?? [];
    itemWeekdays.push(weekdayRow.weekday);
    itemWeekdays.sort((first, second) => first - second);
    weekdaysByTemplateId.set(weekdayRow.item_template_id, itemWeekdays);
  });

  return weekdaysByTemplateId;
}

function validateItemTemplate(
  item: SharedSettingsItemTemplateRow,
  index: number,
  childId: string,
  itemIds: Set<string>,
  weekdaysByTemplateId: Map<string, number[]>,
  issues: SharedSettingsValidationIssue[],
) {
  const path = `itemTemplates[${index}]`;

  if (item.child_id !== childId) {
    addIssue(issues, `${path}.child_id`, "item_child_id_mismatch");
  }

  if (!isPlainString(item.id) || item.id.trim() === "") {
    addIssue(issues, `${path}.id`, "invalid_item_id");
  } else if (itemIds.has(item.id)) {
    addIssue(issues, `${path}.id`, "duplicate_item_id");
  } else {
    itemIds.add(item.id);
  }

  if (!isKnownKind(item.kind)) {
    addIssue(issues, `${path}.kind`, "invalid_item_kind");
    return;
  }

  if (!isPlainString(item.name) || charLength(item.name.trim()) < 1 || charLength(item.name.trim()) > 80) {
    addIssue(issues, `${path}.name`, "invalid_item_name");
  }

  if (!isInteger(item.default_quantity)) {
    addIssue(issues, `${path}.default_quantity`, "invalid_item_count");
  } else if (
    item.kind === "spot"
      ? item.default_quantity < 1 || item.default_quantity > 99
      : item.default_quantity < 0 || item.default_quantity > 999
  ) {
    addIssue(issues, `${path}.default_quantity`, "invalid_item_count");
  }

  if (!isPlainString(item.unit) || charLength(item.unit) > 16) {
    addIssue(issues, `${path}.unit`, "invalid_item_unit");
  }

  if (!isInteger(item.sort_order) || item.sort_order < 0 || item.sort_order > 100000) {
    addIssue(issues, `${path}.sort_order`, "invalid_item_sort_order");
  }

  const weekdays = weekdaysByTemplateId.get(item.id) ?? [];
  if (item.kind !== "spot" && weekdays.length > 0) {
    addIssue(issues, `${path}.weekdays`, "invalid_item_weekdays");
  }

  if (item.kind === "spot" && weekdays.length > 2) {
    addIssue(issues, `${path}.weekdays`, "invalid_item_weekdays");
  }

  if (item.kind === "rough") {
    if (!isPlainString(item.current_rough_state)) {
      addIssue(issues, `${path}.current_rough_state`, "missing_current_rough_state");
    } else if (!isKnownRoughState(item.current_rough_state)) {
      addIssue(issues, `${path}.current_rough_state`, "invalid_current_rough_state");
    }
    return;
  }

  if (item.current_rough_state !== null) {
    addIssue(issues, `${path}.current_rough_state`, "unexpected_current_rough_state");
  }
}
