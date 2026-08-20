import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260820000100_require_recheck_after_preparation.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");
const baseSql = readFileSync(
  "supabase/migrations/20260719000500_add_complete_daily_check_rpc.sql",
  "utf8",
);

test("daily check recheck migration is ordered and BOM-free", () => {
  assert.equal(
    migrationBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    false,
  );
  assert.match(migrationPath, /20260820000100_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("recheck uses existing completion timestamps after locking the session", () => {
  assert.match(
    sql,
    /daily_sessions\.checked_at,[\s\S]*daily_sessions\.prepared_at,[\s\S]*daily_sessions\.version/i,
  );
  assert.match(sql, /session_date = p_session_date[\s\S]*for update;/i);
  assert.match(
    sql,
    /target_session_checked_at is null[\s\S]*or target_session_prepared_at > target_session_checked_at/i,
  );
  assert.match(
    sql,
    /daily_sessions\.checked_at is null[\s\S]*or daily_sessions\.prepared_at > daily_sessions\.checked_at/i,
  );
});

test("recheck refreshes only check metadata and preserves preparation metadata", () => {
  assert.match(baseSql, /checked_by_member_id = current_member_id/i);
  assert.match(baseSql, /checked_by_user_id = current_user_id/i);
  assert.match(baseSql, /checked_by_display_name = current_member_display_name/i);
  assert.match(baseSql, /version = daily_sessions\.version \+ 1/i);
  assert.match(sql, /prepared_at \+ interval ''1 microsecond''/i);
  assert.doesNotMatch(
    sql,
    /prepared_at\s*=|prepared_by_member_id\s*=|prepared_by_user_id\s*=|prepared_by_display_name\s*=/i,
  );
  assert.doesNotMatch(sql, /update public\.daily_items/i);
});
