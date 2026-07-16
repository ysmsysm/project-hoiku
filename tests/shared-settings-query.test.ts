import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultRoughStates } from "../src/data/defaultCustomItems";
import { loadSharedSettingsWithClient } from "../src/lib/family-sharing/shared-settings-query";

const familyId = "family-1";
const childId = "child-1";

test("loads only active templates and filters weekdays before mapping", async () => {
  const calls: unknown[] = [];
  const client = createSharedSettingsMockClient(calls, {
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
    item_templates: [
      {
        id: "active-rough",
        family_id: familyId,
        child_id: childId,
        kind: "rough",
        name: "Diaper",
        default_quantity: 1,
        unit: "pack",
        sort_order: 1,
        current_rough_state: "refill",
      },
    ],
    item_template_weekdays: [
      {
        item_template_id: "inactive-spot",
        family_id: familyId,
        weekday: 2,
      },
    ],
  });

  const result = await loadSharedSettingsWithClient(client, familyId);

  assert.equal(
    calls.some(
      (call) =>
        Array.isArray(call) &&
        call[0] === "eq" &&
        call[1] === "item_templates" &&
        call[2] === "is_active" &&
        call[3] === true,
    ),
    true,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(
      result.data.customItems.map((item) => item.id),
      ["active-rough"],
    );
    assert.deepEqual(result.data.roughStates, {
      "active-rough": defaultRoughStates["rough-tissue"],
    });
  }
});

function createSharedSettingsMockClient(
  calls: unknown[],
  rows: Record<string, unknown[]>,
): SupabaseClient {
  return {
    from(table: string) {
      calls.push(["from", table]);
      const query = {
        select(columns: string) {
          calls.push(["select", table, columns]);
          return this;
        },
        eq(column: string, value: unknown) {
          calls.push(["eq", table, column, value]);
          return this;
        },
        order(column: string, options: unknown) {
          calls.push(["order", table, column, options]);
          return this;
        },
        then(
          onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({ data: rows[table] ?? [], error: null }).then(
            onFulfilled,
            onRejected,
          );
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
