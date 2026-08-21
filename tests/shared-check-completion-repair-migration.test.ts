import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const previousMigration = readFileSync(
  "supabase/migrations/20260821000400_include_rough_refill_in_preparation.sql",
  "utf8",
);
const migrationPath =
  "supabase/migrations/20260821000500_repair_shared_check_completion.sql";
const bytes = readFileSync(migrationPath);
const sql = bytes.toString("utf8");

test("shared check completion repair is ordered, transactional and BOM-free", () => {
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(migrationPath, /20260821000500_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("repair gives the scoped RPC authority for its existing template row lock", () => {
  assert.match(previousMigration, /perform item_templates\.id[\s\S]*for update/i);
  assert.match(
    sql,
    /complete_daily_check\(uuid,\s*uuid,\s*date,\s*integer\)/i,
  );
  assert.match(sql, /owner to postgres/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.doesNotMatch(sql, /grant\s+update/i);
  assert.doesNotMatch(sql, /update public\.item_templates/i);
});

test("repair preserves authenticated-only execution without replacing the function", () => {
  assert.match(
    sql,
    /revoke all on function public\.complete_daily_check\(uuid, uuid, date, integer\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.complete_daily_check\(uuid, uuid, date, integer\)[\s\S]*to authenticated/i,
  );
  assert.doesNotMatch(sql, /create or replace function/i);
  assert.doesNotMatch(sql, /alter table|create policy/i);
});
