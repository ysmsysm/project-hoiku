import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260820000300_reopen_preparation_after_check_correction.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

test("repreparation migration is ordered, transactional, and BOM-free", () => {
  assert.equal(
    migrationBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    false,
  );
  assert.match(migrationPath, /20260820000300_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("recheck detects a real current preparation target after locking items", () => {
  assert.match(sql, /order by daily_items\.id\s+for update;/i);
  assert.match(sql, /select exists[\s\S]*into repreparation_required/i);
  assert.doesNotMatch(sql, /pg_catalog\.exists/i);
  assert.match(sql, /is_prepared = false[\s\S]*is_deferred = false/i);
  assert.match(
    sql,
    /daily_items\.shortage_count[\s\S]*> 0[\s\S]*daily_items\.updated_at > target_session_prepared_at/i,
  );
  assert.match(sql, /daily_items\.shortage_count[\s\S]*> 0/i);
  assert.match(sql, /daily_items\.kind = 'spot'[\s\S]*required_quantity > 0/i);
  assert.match(sql, /daily_items\.kind = 'rough'[\s\S]*rough_state = 'refill'/i);
});

test("only a required repreparation invalidates completion and stale item flags", () => {
  assert.match(sql, /or repreparation_required[\s\S]*then/i);
  assert.match(sql, /prepared_at = case\s+when repreparation_required then null/i);
  assert.match(sql, /prepared_by_member_id = case[\s\S]*then null/i);
  assert.match(sql, /thanks_sent_at = case[\s\S]*then null/i);
  assert.match(sql, /thanks_received_by_member_id = case[\s\S]*then null/i);
  assert.match(
    sql,
    /if updated_session_id is not null and repreparation_required then[\s\S]*is_prepared = false,[\s\S]*is_deferred = false/i,
  );
  assert.match(sql, /version = daily_items\.version \+ 1/i);
  assert.match(sql, /version = daily_sessions\.version \+ 1/i);
  assert.match(
    sql,
    /update public\.daily_items[\s\S]*daily_items\.kind = 'regular'[\s\S]*daily_items\.shortage_count[\s\S]*> 0/i,
  );
});

test("migration keeps the existing function, permissions, and schema intact", () => {
  assert.match(sql, /pg_catalog\.pg_get_functiondef[\s\S]*complete_daily_check/i);
  assert.doesNotMatch(sql, /create table|alter table|drop function|grant execute/i);
  assert.doesNotMatch(sql, /delete from public\.daily_items/i);
});
