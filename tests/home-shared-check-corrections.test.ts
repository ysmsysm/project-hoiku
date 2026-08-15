import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHomeSharedRoughMutationFallback,
  isHomeCompletedSpotCorrectionAction,
} from "../src/lib/home-shared-check-corrections";
import { mutateDailySpotItem } from "../src/lib/family-sharing/mutate-daily-spot-item";
import { updateSharedRoughItemState } from "../src/lib/family-sharing/update-item-template";
import type { CustomizableItem } from "../src/types/preparation";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const templateId = "33333333-3333-4333-8333-333333333333";
const dailyItemId = "44444444-4444-4444-8444-444444444444";
const updatedAt = "2026-08-15T01:00:00.000000+00:00";
const nextUpdatedAt = "2026-08-15T01:00:01.000000+00:00";

test("Home rough fallback consumes the actual validated RPC response", async () => {
  const result = await updateSharedRoughItemState(
    {
      async rpc() {
        return {
          data: {
            status: "success",
            changed: true,
            reason: null,
            family_id: familyId,
            child_id: childId,
            item_template_id: templateId,
            kind: "rough",
            name: "おむつ",
            default_quantity: 1,
            unit: "袋",
            current_rough_state: "low",
            weekdays: [],
            sort_order: 0,
            is_active: true,
            updated_at: nextUpdatedAt,
          },
          error: null,
        };
      },
    },
    {
      familyId,
      childId,
      itemTemplateId: templateId,
      expectedUpdatedAt: updatedAt,
      currentRoughState: "low",
    },
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;

  const customItems = [
    {
      id: templateId,
      category: "ざっくり管理",
      name: "おむつ",
      count: 1,
      unit: "袋",
      updatedAt,
    } as CustomizableItem,
  ];
  const applied = applyHomeSharedRoughMutationFallback({
    itemId: templateId,
    nextState: "少ない",
    result,
    roughStates: { [templateId]: "十分" },
    customItems,
  });
  assert.equal(applied.roughStates[templateId], "少ない");
  assert.equal(applied.customItems[0].updatedAt, nextUpdatedAt);
  assert.equal(customItems[0].updatedAt, updatedAt);
});

test("Home completed spot corrections accept actual add and delete envelopes", async () => {
  const calls: string[] = [];
  const client = {
    async rpc(_name: string, args: Record<string, unknown>) {
      const action = String(args.p_action);
      calls.push(action);
      return {
        data: {
          status: "success",
          changed: true,
          item: {
            daily_item_id: dailyItemId,
            version: action === "delete" ? 2 : 1,
            deleted_at:
              action === "delete" ? "2026-08-15T02:00:00.000000+00:00" : null,
            due_date: null,
            item_template_id: templateId,
            is_ad_hoc: false,
          },
        },
        error: null,
      };
    },
  };
  const scope = { familyId, childId, sessionDate: "2026-08-15" };
  const added = await mutateDailySpotItem(client, {
    ...scope,
    action: "add_template",
    itemTemplateId: templateId,
    dueDate: null,
  });
  const deleted = await mutateDailySpotItem(client, {
    ...scope,
    action: "delete",
    dailyItemId,
    expectedVersion: 1,
  });
  assert.equal(added.status, "success");
  assert.equal(deleted.status, "success");
  assert.deepEqual(calls, ["add_template", "delete"]);
  assert.equal(isHomeCompletedSpotCorrectionAction("add_template"), true);
  assert.equal(isHomeCompletedSpotCorrectionAction("add_temporary"), true);
  assert.equal(isHomeCompletedSpotCorrectionAction("delete"), true);
  assert.equal(isHomeCompletedSpotCorrectionAction("set_due_date"), false);
});
