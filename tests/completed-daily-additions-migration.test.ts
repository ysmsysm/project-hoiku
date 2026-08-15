import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260815000300_allow_completed_daily_additions.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

test("completed daily additions migration is ordered and BOM-free", () => {
  assert.equal(
    migrationBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    false,
  );
  assert.match(migrationPath, /20260815000300_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("completed sessions allow only template and temporary spot additions", () => {
  assert.match(
    sql,
    /if target_session_prepared[\s\S]*and p_action not in \(''add_template'', ''add_temporary''\)[\s\S]*then/i,
  );
  assert.match(sql, /daily_spot_prepared_guard_not_found/i);
  assert.doesNotMatch(
    sql,
    /p_action not in \([^)]*''delete''|p_action not in \([^)]*''set_due_date''/i,
  );
});

test("the existing scoped spot RPC is patched without a replacement permission path", () => {
  assert.match(
    sql,
    /mutate_daily_spot_item\(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date\)/i,
  );
  assert.doesNotMatch(sql, /grant\s+execute|security\s+definer|auth\.users/i);
});
