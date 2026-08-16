import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260816000200_reflect_completed_preparation_in_check.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

test("completed preparation check migration is ordered and BOM-free", () => {
  assert.equal(
    migrationBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    false,
  );
  assert.match(migrationPath, /20260816000200_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("completion atomically reflects prepared regular items in canonical check data", () => {
  assert.match(
    sql,
    /complete_daily_preparation\(uuid,uuid,date,integer\)/i,
  );
  assert.match(
    sql,
    /update public\.daily_items[\s\S]*observed_quantity = daily_items\.required_quantity[\s\S]*shortage_count = 0/i,
  );
  assert.match(sql, /daily_items\.kind = 'regular'/i);
  assert.match(sql, /daily_items\.is_prepared = true/i);
  assert.match(sql, /daily_items\.is_deferred = false/i);
  assert.match(sql, /version = daily_items\.version \+ 1/i);
  assert.match(sql, /updated_by_member_id = current_member_id/i);
  assert.match(sql, /updated_by_user_id = current_user_id/i);
  assert.match(
    sql,
    /updated_by_display_name = current_member_display_name/i,
  );
});

test("completion patch preserves the locked RPC and carryover work", () => {
  assert.match(sql, /check_update_sql \|\| completion_anchor/i);
  assert.match(sql, /pg_catalog\.pg_get_functiondef/i);
  assert.doesNotMatch(sql, /create or replace function/i);
  assert.doesNotMatch(sql, /grant\s+execute|security\s+definer/i);
});
