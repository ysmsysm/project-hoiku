import assert from "node:assert/strict";
import test from "node:test";
import {
  createSharedSettingsPreview,
  parseSharedSettingsPreview,
} from "../src/lib/family-sharing/shared-settings-preview-cache";
import type { SharedSettingsAppData } from "../src/lib/family-sharing/shared-settings";

const settings: SharedSettingsAppData = {
  childId: "child-id-must-not-be-cached",
  childProfile: {
    name: "そうた",
    iconType: "image",
    iconId: "default-baby",
    iconUrl: "https://example.com/private.png",
    birthday: null,
    photoUrl: "https://example.com/private.png",
  },
  customItems: [
    {
      id: "regular-1",
      updatedAt: "2026-09-08T00:00:00.000Z",
      name: "着替え",
      unit: "枚",
      count: 3,
      category: "持ち物",
      weekdays: [],
    },
    {
      id: "spot-1",
      updatedAt: "2026-09-08T00:00:00.000Z",
      name: "水遊びタオル",
      unit: "枚",
      count: 1,
      category: "スポット追加",
      weekdays: [1, 3],
    },
    {
      id: "rough-1",
      updatedAt: "2026-09-08T00:00:00.000Z",
      name: "おむつ",
      unit: "枚",
      count: 5,
      category: "ざっくり管理",
      weekdays: [],
    },
  ],
  roughStates: { "rough-1": "少ない" },
};

test("shared preview contains only static display settings", () => {
  const preview = createSharedSettingsPreview(settings);
  const serialized = JSON.stringify({
    ...preview,
    checked_at: "must-not-survive",
    prepared_at: "must-not-survive",
    deferred: true,
    thanksSent: true,
    dailyRoughState: "refill",
  });
  const parsed = parseSharedSettingsPreview(serialized);

  assert.deepEqual(parsed, preview);
  const cached = JSON.stringify(preview);
  assert.doesNotMatch(cached, /child-id-must-not-be-cached|private\.png|updatedAt/);
  assert.doesNotMatch(
    cached,
    /checked_at|prepared_at|deferred|thanks|dailyRoughState/,
  );
  assert.deepEqual(preview.items[1].weekdays, [1, 3]);
  assert.equal(preview.items[2].roughState, "少ない");
});

test("shared preview parser rejects malformed or inconsistent cached data", () => {
  assert.equal(parseSharedSettingsPreview("not-json"), null);
  assert.equal(
    parseSharedSettingsPreview(
      JSON.stringify({
        version: 1,
        childName: "そうた",
        items: [
          {
            id: "regular-1",
            name: "着替え",
            unit: "枚",
            count: 3,
            category: "持ち物",
            weekdays: [1],
            roughState: null,
          },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    parseSharedSettingsPreview(
      JSON.stringify({
        version: 1,
        childName: "そうた",
        items: [
          {
            id: "rough-1",
            name: "おむつ",
            unit: "枚",
            count: 5,
            category: "ざっくり管理",
            weekdays: [],
            roughState: null,
          },
        ],
      }),
    ),
    null,
  );
});
