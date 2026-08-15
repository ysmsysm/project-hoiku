import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260815000400_allow_completed_daily_deletions.sql";
const bytes = readFileSync(migrationPath);
const sql = bytes.toString("utf8");

test("completed daily deletion migration is ordered and BOM-free", () => {
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(migrationPath, /20260815000400_/);
});

test("completed daily correction guard adds delete but keeps due date forbidden", () => {
  assert.match(
    sql,
    /add_template'', ''add_temporary''[\s\S]*add_template'', ''add_temporary'', ''delete''/i,
  );
  assert.doesNotMatch(sql, /''set_due_date''/i);
  assert.match(sql, /daily_spot_completed_delete_guard_not_found/i);
});
