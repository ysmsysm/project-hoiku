import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHomeSharedItemTemplateMutationFallback,
  executeHomeSharedDailySpotMutation,
  executeHomeSharedRoughMutation,
  isHomeCompletedSpotCorrectionAction,
} from "../src/lib/home-shared-check-corrections";
import { mutateDailySpotItem } from "../src/lib/family-sharing/mutate-daily-spot-item";
import {
  updateSharedItemTemplate,
  updateSharedRoughItemState,
} from "../src/lib/family-sharing/update-item-template";
import type { CustomizableItem } from "../src/types/preparation";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const templateId = "33333333-3333-4333-8333-333333333333";
const dailyItemId = "44444444-4444-4444-8444-444444444444";
const dailySessionId = "55555555-5555-4555-8555-555555555555";
const memberId = "66666666-6666-4666-8666-666666666666";
const userId = "77777777-7777-4777-8777-777777777777";
const updatedAt = "2026-08-15T01:00:00.000000+00:00";
const nextUpdatedAt = "2026-08-15T01:00:01.000000+00:00";

test("owner and member shared durable quantity edits apply validated RPC success when settings reload fails", async () => {
  for (const role of ["owner", "member"] as const) {
    const customItems = [
      {
        id: templateId,
        category: "持ち物",
        name: "半袖",
        count: 3,
        unit: "枚",
        weekdays: [],
        updatedAt,
      } as CustomizableItem,
      {
        id: dailyItemId,
        category: "持ち物",
        name: "下着",
        count: 3,
        unit: "枚",
        weekdays: [],
        updatedAt,
      } as CustomizableItem,
    ];
    const result = await updateSharedItemTemplate(
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
              kind: "regular",
              name: "半袖",
              default_quantity: 4,
              unit: "枚",
              current_rough_state: null,
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
        kind: "regular",
        name: "半袖",
        defaultQuantity: 4,
        unit: null,
      },
    );
    assert.equal(result.status, "success", role);
    if (result.status !== "success") continue;

    const fallbackItems = applyHomeSharedItemTemplateMutationFallback({
      itemId: templateId,
      result,
      customItems,
    });
    assert.deepEqual(
      fallbackItems.map(({ id, name, count, unit, weekdays, updatedAt: token }) => ({
        id,
        name,
        count,
        unit,
        weekdays,
        updatedAt: token,
      })),
      [
        {
          id: templateId,
          name: "半袖",
          count: 4,
          unit: "枚",
          weekdays: [],
          updatedAt: nextUpdatedAt,
        },
        {
          id: dailyItemId,
          name: "下着",
          count: 3,
          unit: "枚",
          weekdays: [],
          updatedAt,
        },
      ],
      role,
    );
    assert.equal(customItems[0].count, 3, role);
  }
});

test("authenticated shared rough caller applies RPC success when settings reload fails", async () => {
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
  const execution = await executeHomeSharedRoughMutation(
    {
      itemId: templateId,
      nextState: "少ない",
      roughStates: { [templateId]: "十分" },
      customItems,
    },
    {
      save: () =>
        updateSharedRoughItemState(
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
        ),
      async reloadCanonical() {
        return false;
      },
    },
  );
  assert.equal(execution.status, "success");
  if (execution.status !== "success") return;
  assert.equal(execution.fallback?.roughStates[templateId], "少ない");
  assert.equal(execution.fallback?.customItems[0].updatedAt, nextUpdatedAt);
  assert.equal(customItems[0].updatedAt, updatedAt);
});

test("Home completed spot corrections accept actual add, delete and deadline envelopes", async () => {
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
  assert.equal(isHomeCompletedSpotCorrectionAction("set_due_date"), true);
});

test("authenticated completed shared add and remove use production runner and canonical reload", async () => {
  const sessionDate = "2026-08-15";
  const item = {
    id: dailyItemId,
    daily_item_id: dailyItemId,
    session_id: dailySessionId,
    daily_session_id: dailySessionId,
    family_id: familyId,
    item_template_id: templateId,
    kind: "spot",
    is_ad_hoc: false,
    name: "水筒",
    required_quantity: 1,
    observed_quantity: null,
    shortage_count: null,
    quantity: 1,
    unit: "個",
    rough_state: null,
    is_checked: false,
    is_prepared: false,
    is_deferred: false,
    is_carryover: false,
    carryover_pending_shortage_count: null,
    carried_from_daily_item_id: null,
    carryover_processed_at: null,
    carryover_resolved_at: null,
    due_date: null,
    sort_order: 0,
    version: 1,
    updated_by_member_id: memberId,
    updated_by_user_id: userId,
    updated_by_display_name: "miri",
    created_at: updatedAt,
    updated_at: updatedAt,
  };
  const session = {
    id: dailySessionId,
    session_id: dailySessionId,
    family_id: familyId,
    child_id: childId,
    session_date: sessionDate,
    version: 3,
    is_checked: true,
    checked_by_member_id: memberId,
    checked_by_user_id: userId,
    checked_by_display_name: "miri",
    checked_at: updatedAt,
    is_prepared: true,
    prepared_by_member_id: memberId,
    prepared_by_user_id: userId,
    prepared_by_display_name: "miri",
    prepared_at: nextUpdatedAt,
    thanks_sent_at: null,
    thanks_sent_by_member_id: null,
    thanks_sent_by_user_id: null,
    thanks_sent_by_display_name: null,
    thanks_received_by_member_id: null,
    thanks_received_by_user_id: null,
    thanks_received_by_display_name: null,
    created_at: updatedAt,
    updated_at: nextUpdatedAt,
  };
  for (const role of ["owner", "member"] as const) {
    const calls: string[] = [];
    let canonicalItems = [item];
    const client = {
      async rpc(functionName: string, args: Record<string, unknown>) {
        calls.push(`${role}:${functionName}`);
      if (functionName === "mutate_daily_spot_item") {
        const deleting = args.p_action === "delete";
        canonicalItems = deleting ? [] : [item];
        return {
          data: {
            status: "success",
            changed: true,
            item: {
              daily_item_id: dailyItemId,
              version: deleting ? 2 : 1,
              deleted_at: deleting ? nextUpdatedAt : null,
              due_date: null,
              item_template_id: templateId,
              is_ad_hoc: false,
            },
          },
          error: null,
        };
      }
      return {
        data: { status: "success", session, items: canonicalItems },
        error: null,
      };
      },
    };
    const added = await executeHomeSharedDailySpotMutation(
      client,
      { action: "add_template", familyId, childId, sessionDate, itemTemplateId: templateId, dueDate: null },
      dailySessionId,
    );
    assert.equal(added.status, "success");
    if (added.status !== "success") continue;
    assert.equal(added.state.session.isCompleted, true);
    assert.equal(added.state.session.items[0]?.itemTemplateId, templateId);

    const removed = await executeHomeSharedDailySpotMutation(
      client,
      { action: "delete", familyId, childId, sessionDate, dailyItemId, expectedVersion: 1 },
      dailySessionId,
    );
    assert.equal(removed.status, "success");
    if (removed.status !== "success") continue;
    assert.equal(removed.state.session.items.length, 0);
    assert.deepEqual(calls, [
      `${role}:mutate_daily_spot_item`,
      `${role}:load_daily_data`,
      `${role}:mutate_daily_spot_item`,
      `${role}:load_daily_data`,
    ]);
  }
});

test("authenticated completed shared deadline set, change and clear use production runner and canonical reload", async () => {
  const sessionDate = "2026-08-15";
  const session = {
    id: dailySessionId,
    session_id: dailySessionId,
    family_id: familyId,
    child_id: childId,
    session_date: sessionDate,
    version: 3,
    is_checked: true,
    checked_by_member_id: memberId,
    checked_by_user_id: userId,
    checked_by_display_name: "miri",
    checked_at: updatedAt,
    is_prepared: true,
    prepared_by_member_id: memberId,
    prepared_by_user_id: userId,
    prepared_by_display_name: "miri",
    prepared_at: nextUpdatedAt,
    thanks_sent_at: null,
    thanks_sent_by_member_id: null,
    thanks_sent_by_user_id: null,
    thanks_sent_by_display_name: null,
    thanks_received_by_member_id: null,
    thanks_received_by_user_id: null,
    thanks_received_by_display_name: null,
    created_at: updatedAt,
    updated_at: nextUpdatedAt,
  };

  for (const role of ["owner", "member"] as const) {
    let version = 1;
    let dueDate: string | null = null;
    const calls: Array<{ functionName: string; dueDate: unknown }> = [];
    const client = {
      async rpc(functionName: string, args: Record<string, unknown>) {
        calls.push({ functionName, dueDate: args.p_due_date });
        if (functionName === "mutate_daily_spot_item") {
          dueDate = (args.p_due_date as string | null) ?? null;
          version += 1;
          return {
            data: {
              status: "success",
              changed: true,
              item: {
                daily_item_id: dailyItemId,
                version,
                deleted_at: null,
                due_date: dueDate,
                item_template_id: templateId,
                is_ad_hoc: false,
              },
            },
            error: null,
          };
        }
        return {
          data: {
            status: "success",
            session,
            items: [
              {
                id: dailyItemId,
                daily_item_id: dailyItemId,
                session_id: dailySessionId,
                daily_session_id: dailySessionId,
                family_id: familyId,
                item_template_id: templateId,
                kind: "spot",
                is_ad_hoc: false,
                name: "water bottle",
                required_quantity: 1,
                observed_quantity: null,
                shortage_count: null,
                quantity: 1,
                unit: "item",
                rough_state: null,
                is_checked: false,
                is_prepared: false,
                is_deferred: false,
                is_carryover: false,
                carryover_pending_shortage_count: null,
                carried_from_daily_item_id: null,
                carryover_processed_at: null,
                carryover_resolved_at: null,
                due_date: dueDate,
                sort_order: 0,
                version,
                updated_by_member_id: memberId,
                updated_by_user_id: userId,
                updated_by_display_name: "miri",
                created_at: updatedAt,
                updated_at: nextUpdatedAt,
              },
            ],
          },
          error: null,
        };
      },
    };

    for (const nextDueDate of ["2026-08-20", "2026-08-22", null]) {
      const execution = await executeHomeSharedDailySpotMutation(
        client,
        {
          action: "set_due_date",
          familyId,
          childId,
          sessionDate,
          dailyItemId,
          expectedVersion: version,
          dueDate: nextDueDate,
        },
        dailySessionId,
      );
      assert.equal(execution.status, "success", `${role}:${String(nextDueDate)}`);
      if (execution.status !== "success") continue;
      assert.equal(execution.state.session.isCompleted, true);
      assert.equal(execution.state.session.items[0]?.dueDate, nextDueDate);
    }

    assert.deepEqual(
      calls.map(({ functionName }) => functionName),
      [
        "mutate_daily_spot_item",
        "load_daily_data",
        "mutate_daily_spot_item",
        "load_daily_data",
        "mutate_daily_spot_item",
        "load_daily_data",
      ],
    );
    assert.deepEqual(
      calls
        .filter(({ functionName }) => functionName === "mutate_daily_spot_item")
        .map(({ dueDate: value }) => value),
      ["2026-08-20", "2026-08-22", null],
    );
  }
});
