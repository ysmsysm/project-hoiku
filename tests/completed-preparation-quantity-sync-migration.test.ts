import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260816000300_sync_completed_preparation_quantities.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

test("completed preparation quantity sync migration is ordered and BOM-free", () => {
  assert.equal(
    migrationBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    false,
  );
  assert.match(migrationPath, /20260816000300_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("remote completion contract is verified before guarded reconciliation", () => {
  assert.match(sql, /pg_catalog\.pg_get_functiondef\([\s\S]*complete_daily_preparation/i);
  assert.match(sql, /complete_preparation_quantity_contract_missing/i);
  assert.match(sql, /observed_quantity = daily_items\.required_quantity/i);
  assert.match(sql, /daily_items\.is_prepared = true/i);
  assert.match(sql, /daily_items\.is_deferred = false/i);
});

test("existing completed rows are corrected only before any post-completion edit", () => {
  assert.match(sql, /daily_sessions\.prepared_at is not null/i);
  assert.match(
    sql,
    /daily_items\.updated_at <= daily_sessions\.prepared_at/i,
  );
  assert.match(sql, /daily_items\.kind = 'regular'/i);
  assert.match(sql, /shortage_count = 0/i);
  assert.match(sql, /version = daily_items\.version \+ 1/i);
  assert.doesNotMatch(sql, /delete\s+from public\.daily_items/i);
});

test("completed quantity edits are allowed while preparation edits stay forbidden", () => {
  assert.match(
    sql,
    /p_action in \(''set_prepared'', ''set_deferred''\)/i,
  );
  assert.match(sql, /completed_quantity_guard_contract_missing/i);
  assert.doesNotMatch(
    sql,
    /p_action in \([^)]*set_observed_quantity/i,
  );
});
