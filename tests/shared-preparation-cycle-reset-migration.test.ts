import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260821000300_reset_shared_preparation_cycle.sql";
const bytes = readFileSync(migrationPath);
const sql = bytes.toString("utf8");

test("shared preparation cycle migration is ordered, transactional and BOM-free", () => {
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(migrationPath, /20260821000300_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("recheck detects and resets every current preparation kind", () => {
  assert.match(sql, /complete_daily_check\(uuid,uuid,date,integer\)/i);
  assert.match(sql, /daily_items\.kind = 'regular'[\s\S]*greatest/i);
  assert.match(
    sql,
    /daily_items\.kind = 'spot'[\s\S]*daily_items\.is_checked = false/i,
  );
  assert.match(
    sql,
    /daily_items\.kind = 'rough'[\s\S]*daily_items\.rough_state = 'refill'[\s\S]*daily_items\.is_carryover = true/i,
  );
  assert.match(
    sql,
    /new_reset text :=[\s\S]*is_prepared = false,[\s\S]*is_deferred = false/i,
  );
  assert.match(sql, /shared_preparation_cycle_reset_contract_not_found/i);
});

test("completed spots are marked without deletion and re-add clears the marker", () => {
  assert.match(
    sql,
    /complete_daily_preparation\(uuid,uuid,date,integer\)[\s\S]*is_checked = true/i,
  );
  assert.match(sql, /daily_items\.is_prepared = true/i);
  assert.match(sql, /daily_items\.is_deferred = false/i);
  assert.match(
    sql,
    /mutate_daily_spot_item\(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date\)[\s\S]*is_checked = false/i,
  );
  assert.doesNotMatch(sql, /delete\s+from|deleted_at\s*=/i);
});

test("already reopened rows are repaired without touching current work or carryover links", () => {
  assert.match(sql, /daily_sessions\.prepared_at is null/i);
  assert.match(sql, /daily_items\.updated_at < daily_sessions\.checked_at/i);
  assert.match(sql, /is_prepared = false,[\s\S]*is_deferred = false/i);
  assert.doesNotMatch(
    sql,
    /set\s+is_carryover\s*=|,\s*is_carryover\s*=|set\s+carried_from_daily_item_id\s*=|,\s*carried_from_daily_item_id\s*=|set\s+carryover_pending_shortage_count\s*=|,\s*carryover_pending_shortage_count\s*=/i,
  );
});
