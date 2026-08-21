import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260821000200_reflect_all_preparation_results.sql";
const bytes = readFileSync(migrationPath);
const sql = bytes.toString("utf8");

test("all preparation results migration is ordered, transactional and BOM-free", () => {
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(migrationPath, /20260821000200_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("completion preserves regular sync and atomically settles prepared rough state", () => {
  assert.match(sql, /complete_preparation_regular_contract_missing/i);
  assert.match(sql, /observed_quantity = daily_items\.required_quantity/i);
  assert.match(
    sql,
    /update public\.item_templates[\s\S]*current_rough_state = 'enough'/i,
  );
  assert.match(sql, /update public\.daily_items[\s\S]*rough_state = 'enough'/i);
  assert.match(sql, /daily_items\.kind = 'rough'/i);
  assert.match(sql, /daily_items\.is_prepared = true/i);
  assert.match(sql, /daily_items\.is_deferred = false/i);
  assert.match(sql, /version = daily_items\.version \+ 1/i);
  assert.match(sql, /updated_by_member_id = current_member_id/i);
  assert.match(sql, /updated_by_user_id = current_user_id/i);
  assert.match(sql, /updated_by_display_name = current_member_display_name/i);
});

test("completion locks rough templates before daily items and retains scoped RPC security", () => {
  assert.match(
    sql,
    /rough_template_lock_sql \|\| item_lock_anchor/i,
  );
  assert.match(
    sql,
    /alter function public\.complete_daily_preparation\(uuid, uuid, date, integer\)[\s\S]*owner to postgres/i,
  );
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.doesNotMatch(sql, /grant\s+execute|revoke\s+all/i);
});

test("existing rough results are repaired only before later explicit edits", () => {
  assert.match(sql, /daily_sessions\.prepared_at is not null/i);
  assert.match(sql, /item_templates\.updated_at <= daily_sessions\.prepared_at/i);
  assert.match(
    sql,
    /daily_items\.updated_at <= daily_sessions\.prepared_at[\s\S]*or daily_items\.carryover_resolved_at = daily_sessions\.prepared_at/i,
  );
  assert.doesNotMatch(sql, /delete\s+from|deleted_at\s*=/i);
});

test("a completed prepared template spot can be added again without duplication", () => {
  assert.match(sql, /mutate_daily_spot_item\(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date\)/i);
  assert.match(sql, /target_session_prepared/i);
  assert.match(sql, /target_item\.is_prepared = true/i);
  assert.match(sql, /target_item\.is_deferred = false/i);
  assert.match(sql, /set[\s\S]*is_prepared = false[\s\S]*due_date = p_due_date/i);
  assert.match(sql, /completed_template_spot_reopen_contract_not_found/i);
  assert.doesNotMatch(sql, /insert into public\.daily_items/i);
});
