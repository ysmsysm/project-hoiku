import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260726000100_add_complete_daily_preparation_rpc.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

const getFunctionSql = () => {
  const functionStart = sql.indexOf(
    "create or replace function public.complete_daily_preparation",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

test("daily preparation completion migration is present, UTF-8 without BOM, and has the expected signature and security", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(
    migrations.includes(
      "20260726000100_add_complete_daily_preparation_rpc.sql",
    ),
  );
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
  assert.match(
    sql,
    /create or replace function public\.complete_daily_preparation\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date,\s*p_expected_version integer\s*\)/i,
  );
  assert.match(getFunctionSql(), /returns jsonb/i);
  assert.match(getFunctionSql(), /security invoker/i);
  assert.match(getFunctionSql(), /set search_path = ''/i);
  assert.doesNotMatch(sql, /drop function public\.complete_daily_preparation/i);
});

test("daily preparation completion execute access is limited to authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.complete_daily_preparation\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\) from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.complete_daily_preparation\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\) from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.complete_daily_preparation\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\) from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.complete_daily_preparation\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\) to authenticated;/i,
  );
});

test("daily preparation completion checks auth, membership, operator snapshot, child, and family-child-date session scope", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    functionSql,
    /if current_user_id is null[\s\S]*'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /if not public\.is_family_member\(p_family_id\)[\s\S]*'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /select\s+family_members\.id,\s*family_members\.display_name[\s\S]*from public\.family_members[\s\S]*family_members\.family_id = p_family_id[\s\S]*family_members\.user_id = current_user_id/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id/i,
  );
  assert.match(
    functionSql,
    /from public\.daily_sessions[\s\S]*daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date[\s\S]*for update;/i,
  );
});

test("daily preparation completion is versioned, checked-only, and idempotent after session lock", () => {
  const functionSql = getFunctionSql();
  const sessionLockIndex = functionSql.search(
    /from public\.daily_sessions[\s\S]*?for update;/i,
  );
  const idempotentIndex = functionSql.indexOf(
    "if target_session_prepared_at is not null then",
  );
  const versionIndex = functionSql.indexOf(
    "if target_session_version <> p_expected_version then",
  );
  const checkedIndex = functionSql.indexOf(
    "if target_session_checked_at is null then",
  );

  assert.ok(sessionLockIndex >= 0);
  assert.ok(idempotentIndex > sessionLockIndex);
  assert.ok(versionIndex > idempotentIndex);
  assert.ok(checkedIndex > versionIndex);
  assert.match(
    functionSql,
    /if target_session_prepared_at is not null then[\s\S]*'status', 'success'[\s\S]*'changed', false[\s\S]*'session', session_payload/i,
  );
  assert.match(
    functionSql,
    /if target_session_version <> p_expected_version then[\s\S]*'status', 'conflict'[\s\S]*'changed', false[\s\S]*'session', session_payload/i,
  );
  assert.match(
    functionSql,
    /if target_session_checked_at is null then[\s\S]*'status', 'invalid_state'[\s\S]*'reason', 'daily_check_incomplete'/i,
  );
});

test("daily preparation completion uses the UI preparation predicate and rejects an unfinished active item while excluding deferred and zero-quantity items", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /from public\.daily_items[\s\S]*daily_items\.family_id = p_family_id[\s\S]*daily_items\.daily_session_id = target_session_id[\s\S]*daily_items\.deleted_at is null/i,
  );
  assert.match(functionSql, /daily_items\.is_prepared = false/i);
  assert.match(functionSql, /daily_items\.is_deferred = false/i);
  assert.match(
    functionSql,
    /daily_items\.kind = 'regular'[\s\S]*greatest\(\s*coalesce\(\s*daily_items\.shortage_count,\s*daily_items\.required_quantity\s*-\s*coalesce\(daily_items\.observed_quantity, 0\)\s*\),\s*coalesce\(daily_items\.carryover_pending_shortage_count, 0\)\s*\) > 0/i,
  );
  assert.match(
    functionSql,
    /daily_items\.kind = 'spot'[\s\S]*daily_items\.required_quantity > 0/i,
  );
  assert.match(
    functionSql,
    /daily_items\.kind = 'rough'[\s\S]*daily_items\.required_quantity > 0[\s\S]*daily_items\.rough_state = 'refill'[\s\S]*daily_items\.is_carryover = true/i,
  );
  assert.match(
    functionSql,
    /if incomplete_item_id is not null then[\s\S]*'status', 'invalid_state'[\s\S]*'reason', 'preparation_items_incomplete'/i,
  );
});

test("daily preparation completion updates only preparation session fields and increments version once", () => {
  const functionSql = getFunctionSql();
  const sessionUpdate = functionSql.match(
    /update public\.daily_sessions[\s\S]*?returning daily_sessions\.id into updated_session_id;/i,
  )?.[0];

  assert.ok(sessionUpdate);
  assert.match(sessionUpdate, /prepared_at = completed_at/i);
  assert.match(
    sessionUpdate,
    /prepared_by_member_id = current_member_id/i,
  );
  assert.match(sessionUpdate, /prepared_by_user_id = current_user_id/i);
  assert.match(
    sessionUpdate,
    /prepared_by_display_name = current_member_display_name/i,
  );
  assert.match(
    sessionUpdate,
    /version = daily_sessions\.version \+ 1/i,
  );
  assert.match(
    sessionUpdate,
    /daily_sessions\.version = p_expected_version/i,
  );
  assert.match(sessionUpdate, /daily_sessions\.prepared_at is null/i);
  assert.doesNotMatch(
    sessionUpdate,
    /checked_at\s*=|checked_by_\w+\s*=|thanks_\w+\s*=/i,
  );
});

test("daily preparation completion resolves only prepared non-deferred carryovers, preserves user snapshots, and versions the item mutation", () => {
  const functionSql = getFunctionSql();
  const carryoverUpdate = functionSql.match(
    /update public\.daily_items\s+set\s+carryover_resolved_at = completed_at[\s\S]*?daily_items\.carryover_resolved_at is null;/i,
  )?.[0];

  assert.ok(carryoverUpdate);
  assert.match(carryoverUpdate, /daily_items\.is_carryover = true/i);
  assert.match(carryoverUpdate, /daily_items\.is_prepared = true/i);
  assert.match(carryoverUpdate, /daily_items\.is_deferred = false/i);
  assert.match(
    carryoverUpdate,
    /daily_items\.carryover_resolved_at is null/i,
  );
  assert.match(carryoverUpdate, /version = daily_items\.version \+ 1/i);
  assert.doesNotMatch(
    carryoverUpdate,
    /updated_by_member_id\s*=|updated_by_user_id\s*=|updated_by_display_name\s*=/i,
  );
});

test("daily preparation completion returns load-compatible session data and all required status envelopes", () => {
  const functionSql = getFunctionSql();

  for (const key of [
    "id",
    "session_id",
    "family_id",
    "child_id",
    "session_date",
    "version",
    "is_checked",
    "checked_at",
    "is_prepared",
    "prepared_by_member_id",
    "prepared_by_user_id",
    "prepared_by_display_name",
    "prepared_at",
    "created_at",
    "updated_at",
  ]) {
    assert.match(functionSql, new RegExp(`'${key}'`, "i"));
  }

  assert.match(
    functionSql,
    /'status', 'success'[\s\S]*'changed', true[\s\S]*'session', session_payload/i,
  );
  assert.match(functionSql, /'status', 'conflict'/i);
  assert.match(functionSql, /'status', 'invalid_state'/i);
  assert.match(functionSql, /'status', 'forbidden'/i);
  assert.match(functionSql, /'status', 'not_found'/i);
});
