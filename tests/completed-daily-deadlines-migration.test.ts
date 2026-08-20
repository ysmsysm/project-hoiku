import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260821000100_allow_completed_daily_deadlines.sql";
const bytes = readFileSync(migrationPath);
const sql = bytes.toString("utf8");

test("completed daily deadline migration is ordered, transactional and BOM-free", () => {
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(migrationPath, /20260821000100_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("completed daily correction guard adds only due date editing", () => {
  assert.match(
    sql,
    /add_template'', ''add_temporary'', ''delete''[\s\S]*add_template'', ''add_temporary'', ''delete'', ''set_due_date''/i,
  );
  assert.match(sql, /daily_spot_completed_deadline_guard_not_found/i);
  assert.doesNotMatch(sql, /insert\s+into|update\s+public\.|delete\s+from|grant\s+execute|security\s+definer/i);
});

test("the existing scoped and versioned spot RPC is patched in place", () => {
  assert.match(
    sql,
    /mutate_daily_spot_item\(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date\)/i,
  );
  assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?function|auth\.users/i);
});
