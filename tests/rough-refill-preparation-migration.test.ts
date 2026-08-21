import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260821000400_include_rough_refill_in_preparation.sql";
const bytes = readFileSync(migrationPath);
const sql = bytes.toString("utf8");

test("rough refill preparation migration is ordered, transactional and BOM-free", () => {
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(migrationPath, /20260821000400_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("check completion snapshots active rough templates into scoped daily items", () => {
  assert.match(sql, /complete_daily_check\(uuid,uuid,date,integer\)/i);
  assert.match(
    sql,
    /perform item_templates\.id[\s\S]*order by item_templates\.id[\s\S]*for update/i,
  );
  assert.match(
    sql,
    /update public\.daily_items[\s\S]*rough_state = item_templates\.current_rough_state/i,
  );
  assert.match(sql, /daily_items\.daily_session_id = target_session_id/i);
  assert.match(sql, /item_templates\.family_id = p_family_id/i);
  assert.match(sql, /item_templates\.child_id = p_child_id/i);
  assert.match(sql, /daily_items\.kind = 'rough'/i);
  assert.match(sql, /item_templates\.kind = 'rough'/i);
  assert.match(sql, /item_templates\.is_active = true/i);
  assert.match(sql, /version = daily_items\.version \+ 1/i);
  assert.match(sql, /updated_by_member_id = current_member_id/i);
  assert.match(sql, /updated_by_user_id = current_user_id/i);
  assert.match(sql, /updated_by_display_name = current_member_display_name/i);
  assert.match(sql, /daily_check_rough_sync_contract_not_found/i);
});

test("existing unchecked preparation is repaired only from state known at check time", () => {
  assert.match(sql, /daily_sessions\.checked_at is not null/i);
  assert.match(sql, /daily_sessions\.prepared_at is null/i);
  assert.match(sql, /item_templates\.updated_at <= daily_sessions\.checked_at/i);
  assert.doesNotMatch(sql, /delete\s+from|is_prepared\s*=|is_deferred\s*=/i);
  assert.doesNotMatch(sql, /grant\s+execute|revoke\s+all/i);
});
