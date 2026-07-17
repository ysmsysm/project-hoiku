import assert from "node:assert/strict";
import test from "node:test";
import { defaultCustomItems, defaultRoughStates } from "../src/data/defaultCustomItems";
import {
  mapSharedSettingsRowsToAppData,
  type SharedSettingsRows,
} from "../src/lib/family-sharing/shared-settings";

const childId = "child-1";
const familyId = "family-1";

const baseRows = (): SharedSettingsRows => ({
  children: [
    {
      id: childId,
      family_id: familyId,
      name: "Sota",
      icon_type: "default",
      icon_id: "default-baby",
      icon_url: null,
    },
  ],
  itemTemplates: [
    {
      id: "template-rough",
      family_id: familyId,
      child_id: childId,
      kind: "rough",
      name: "Diaper",
      default_quantity: 1,
      unit: "pack",
      sort_order: 30,
      current_rough_state: "refill",
    },
    {
      id: "template-spot",
      family_id: familyId,
      child_id: childId,
      kind: "spot",
      name: "Letter",
      default_quantity: 1,
      unit: "",
      sort_order: 20,
      current_rough_state: null,
    },
    {
      id: "template-regular",
      family_id: familyId,
      child_id: childId,
      kind: "regular",
      name: "Shirt",
      default_quantity: 3,
      unit: "pcs",
      sort_order: 10,
      current_rough_state: null,
    },
  ],
  itemTemplateWeekdays: [
    {
      item_template_id: "template-spot",
      family_id: familyId,
      weekday: 5,
    },
    {
      item_template_id: "template-spot",
      family_id: familyId,
      weekday: 1,
    },
  ],
});

const assertIssue = (rows: SharedSettingsRows, expectedCode: string) => {
  const result = mapSharedSettingsRowsToAppData(rows);
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(
      result.error.issues.some((issue) => issue.code === expectedCode),
      true,
      `expected issue ${expectedCode}, got ${JSON.stringify(result.error.issues)}`,
    );
  }
};

test("maps regular, spot, rough, weekdays, sort order, rough states, and default icon", () => {
  const result = mapSharedSettingsRowsToAppData(baseRows());
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.data.childProfile, {
    name: "Sota",
    iconType: "default",
    iconId: "default-baby",
    iconUrl: null,
    birthday: null,
    photoUrl: null,
  });
  assert.equal(result.data.childId, childId);
  assert.deepEqual(
    result.data.customItems.map((item) => item.id),
    ["template-regular", "template-spot", "template-rough"],
  );
  assert.deepEqual(result.data.customItems[0], {
    id: "template-regular",
    name: "Shirt",
    unit: "pcs",
    count: 3,
    category: defaultCustomItems[0].category,
    weekdays: [],
  });
  assert.deepEqual(result.data.customItems[1], {
    id: "template-spot",
    name: "Letter",
    unit: "",
    count: 1,
    category: defaultCustomItems[6].category,
    weekdays: [1, 5],
  });
  assert.deepEqual(result.data.customItems[2].category, defaultCustomItems[9].category);
  assert.deepEqual(result.data.roughStates, {
    "template-rough": defaultRoughStates["rough-tissue"],
  });
});

test("maps image icon to iconUrl and photoUrl", () => {
  const rows = baseRows();
  rows.children[0].icon_type = "image";
  rows.children[0].icon_url = "https://example.com/child.png";

  const result = mapSharedSettingsRowsToAppData(rows);
  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.data.childProfile.iconType, "image");
    assert.equal(result.data.childProfile.iconUrl, "https://example.com/child.png");
    assert.equal(result.data.childProfile.photoUrl, "https://example.com/child.png");
  }
});

test("rejects missing child and multiple children", () => {
  const missing = baseRows();
  missing.children = [];
  const missingResult = mapSharedSettingsRowsToAppData(missing);
  assert.deepEqual(missingResult, {
    ok: false,
    error: {
      code: "child_missing",
      issues: [{ path: "children", code: "child_missing" }],
    },
  });

  const multiple = baseRows();
  multiple.children.push({ ...multiple.children[0], id: "child-2" });
  const multipleResult = mapSharedSettingsRowsToAppData(multiple);
  assert.equal(multipleResult.ok, false);

  if (!multipleResult.ok) {
    assert.equal(multipleResult.error.code, "multiple_children");
  }
});

test("rejects invalid child icon values", () => {
  const invalidIconType = baseRows();
  invalidIconType.children[0].icon_type = "emoji";
  assertIssue(invalidIconType, "invalid_icon_type");

  const missingImageUrl = baseRows();
  missingImageUrl.children[0].icon_type = "image";
  missingImageUrl.children[0].icon_url = null;
  assertIssue(missingImageUrl, "missing_image_icon_url");
});

test("rejects invalid kind, missing id, duplicate id, and child mismatch", () => {
  const invalidKind = baseRows();
  invalidKind.itemTemplates[0].kind = "daily";
  assertIssue(invalidKind, "invalid_item_kind");

  const missingId = baseRows();
  missingId.itemTemplates[0].id = "";
  assertIssue(missingId, "invalid_item_id");

  const duplicateId = baseRows();
  duplicateId.itemTemplates[1].id = "template-regular";
  assertIssue(duplicateId, "duplicate_item_id");

  const childMismatch = baseRows();
  childMismatch.itemTemplates[0].child_id = "other-child";
  assertIssue(childMismatch, "item_child_id_mismatch");
});

test("rejects invalid quantity and weekdays", () => {
  const invalidRegularQuantity = baseRows();
  invalidRegularQuantity.itemTemplates[2].default_quantity = -1;
  assertIssue(invalidRegularQuantity, "invalid_item_count");

  const invalidSpotQuantity = baseRows();
  invalidSpotQuantity.itemTemplates[1].default_quantity = 6;
  assertIssue(invalidSpotQuantity, "invalid_item_count");

  const invalidWeekday = baseRows();
  invalidWeekday.itemTemplateWeekdays[0].weekday = 7;
  assertIssue(invalidWeekday, "invalid_item_weekday");

  const duplicateWeekday = baseRows();
  duplicateWeekday.itemTemplateWeekdays[1].weekday = 5;
  assertIssue(duplicateWeekday, "duplicate_item_weekday");
});

test("maps a zero-quantity spot with zero to seven weekdays", () => {
  for (const weekdays of [[], [3], [0, 6], [0, 1, 2, 3, 4, 5, 6]]) {
    const rows = baseRows();
    rows.itemTemplates[1].default_quantity = 0;
    rows.itemTemplateWeekdays = weekdays.map((weekday) => ({
      item_template_id: "template-spot",
      family_id: familyId,
      weekday,
    }));

    const result = mapSharedSettingsRowsToAppData(rows);
    assert.equal(result.ok, true);
    if (result.ok) {
      const spot = result.data.customItems.find(
        (item) => item.id === "template-spot",
      );
      assert.equal(spot?.count, 0);
      assert.deepEqual(spot?.weekdays, weekdays);
    }
  }
});

test("rejects rough state inconsistencies", () => {
  const missingRoughState = baseRows();
  missingRoughState.itemTemplates[0].current_rough_state = null;
  assertIssue(missingRoughState, "missing_current_rough_state");

  const invalidRoughState = baseRows();
  invalidRoughState.itemTemplates[0].current_rough_state = "empty";
  assertIssue(invalidRoughState, "invalid_current_rough_state");

  const unexpectedRoughState = baseRows();
  unexpectedRoughState.itemTemplates[2].current_rough_state = "enough";
  assertIssue(unexpectedRoughState, "unexpected_current_rough_state");
});

test("rejects weekday rows for unknown templates and non-spot templates", () => {
  const unknownTemplate = baseRows();
  unknownTemplate.itemTemplateWeekdays.push({
    item_template_id: "missing-template",
    family_id: familyId,
    weekday: 2,
  });
  assertIssue(unknownTemplate, "unknown_item_template_id");

  const regularWeekday = baseRows();
  regularWeekday.itemTemplateWeekdays.push({
    item_template_id: "template-regular",
    family_id: familyId,
    weekday: 2,
  });
  assertIssue(regularWeekday, "invalid_item_weekdays");
});
