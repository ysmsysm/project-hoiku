import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260719000400_add_update_daily_item_rpc.sql";
const sql = readFileSync(migrationPath, "utf8");

const getFunctionSql = () => {
  const functionStart = sql.indexOf(
    "create or replace function public.update_daily_item",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

test("daily item update RPC migration is present with expected signature and security", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(migrations.includes("20260719000400_add_update_daily_item_rpc.sql"));
  assert.match(
    sql,
    /create or replace function public\.update_daily_item\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date,\s*p_daily_item_id uuid,\s*p_expected_version integer,\s*p_action text,\s*p_value jsonb\s*\)/i,
  );
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
});

test("daily item update RPC execute access is limited to authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.update_daily_item\(\s*uuid,\s*uuid,\s*date,\s*uuid,\s*integer,\s*text,\s*jsonb\s*\) from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.update_daily_item\(\s*uuid,\s*uuid,\s*date,\s*uuid,\s*integer,\s*text,\s*jsonb\s*\) from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.update_daily_item\(\s*uuid,\s*uuid,\s*date,\s*uuid,\s*integer,\s*text,\s*jsonb\s*\) from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.update_daily_item\(\s*uuid,\s*uuid,\s*date,\s*uuid,\s*integer,\s*text,\s*jsonb\s*\) to authenticated;/i,
  );
});

test("daily item update RPC checks auth, membership, operator snapshot, child, session, and item scope", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(functionSql, /if current_user_id is null[\s\S]*'status', 'forbidden'/i);
  assert.match(functionSql, /if not public\.is_family_member\(p_family_id\)[\s\S]*'status', 'forbidden'/i);
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
    /from public\.daily_sessions[\s\S]*daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date/i,
  );
  assert.match(
    functionSql,
    /from public\.daily_items[\s\S]*daily_items\.id = p_daily_item_id[\s\S]*daily_items\.family_id = p_family_id[\s\S]*daily_items\.daily_session_id = target_session_id[\s\S]*daily_items\.deleted_at is null/i,
  );
});

test("daily item update RPC validates action list, expected version, and value shapes", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_expected_version is null/i);
  assert.match(functionSql, /if p_expected_version < 1[\s\S]*'status', 'invalid_state'/i);
  assert.match(
    functionSql,
    /p_action not in \(\s*'set_observed_quantity',\s*'set_prepared',\s*'set_deferred'\s*\)/i,
  );
  assert.match(functionSql, /pg_catalog\.jsonb_typeof\(p_value\) <> 'object'/i);
  assert.match(functionSql, /jsonb_object_keys\(p_value\)[\s\S]*value_keys\.key <> 'observed_quantity'/i);
  assert.match(functionSql, /jsonb_object_keys\(p_value\)[\s\S]*value_keys\.key <> 'is_prepared'/i);
  assert.match(functionSql, /jsonb_object_keys\(p_value\)[\s\S]*value_keys\.key <> 'is_deferred'/i);
});

test("set_observed_quantity is regular-only and computes shortage count in the database", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_action = 'set_observed_quantity'/i);
  assert.match(functionSql, /target_item_kind <> 'regular'/i);
  assert.match(functionSql, /pg_catalog\.jsonb_typeof\(p_value -> 'observed_quantity'\) <> 'number'/i);
  assert.match(functionSql, /observed_quantity_text !~ '\^\[0-9\]\+\$'/i);
  assert.match(functionSql, /observed_quantity_value > target_item_required_quantity/i);
  assert.match(functionSql, /observed_quantity = observed_quantity_value/i);
  assert.match(
    functionSql,
    /shortage_count = target_item_required_quantity - observed_quantity_value/i,
  );
  assert.doesNotMatch(
    functionSql,
    /shortage_count\s*=\s*\(?p_value|required_quantity\s*=\s*\(?p_value/i,
  );
});

test("prepared and deferred actions have the expected paired state transitions", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_action = 'set_prepared'/i);
  assert.match(functionSql, /pg_catalog\.jsonb_typeof\(p_value -> 'is_prepared'\) <> 'boolean'/i);
  assert.match(functionSql, /is_prepared = prepared_value/i);
  assert.match(
    functionSql,
    /is_deferred = case\s+when prepared_value then false\s+else daily_items\.is_deferred\s+end/i,
  );
  assert.match(functionSql, /p_action = 'set_deferred'/i);
  assert.match(functionSql, /pg_catalog\.jsonb_typeof\(p_value -> 'is_deferred'\) <> 'boolean'/i);
  assert.match(functionSql, /is_deferred = deferred_value/i);
  assert.match(
    functionSql,
    /is_prepared = case\s+when deferred_value then false\s+else daily_items\.is_prepared\s+end/i,
  );
});

test("daily item update RPC uses conditional versioned updates and returns conflicts without overwriting", () => {
  const functionSql = getFunctionSql();
  const updateStatements = functionSql.match(/update public\.daily_items[\s\S]*?returning daily_items\.id into updated_item_id;/gi) ?? [];

  assert.equal(updateStatements.length, 3);
  for (const updateStatement of updateStatements) {
    assert.match(updateStatement, /daily_items\.version = p_expected_version/i);
    assert.match(updateStatement, /version = daily_items\.version \+ 1/i);
    assert.match(updateStatement, /daily_items\.id = p_daily_item_id/i);
    assert.match(updateStatement, /daily_items\.deleted_at is null/i);
  }

  assert.match(
    functionSql,
    /if updated_item_id is null then[\s\S]*'status', 'conflict'[\s\S]*'item', item_payload/i,
  );
});

test("daily item update RPC saves operator snapshot and returns load_daily_data item keys", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /updated_by_member_id = current_member_id/i);
  assert.match(functionSql, /updated_by_user_id = current_user_id/i);
  assert.match(functionSql, /updated_by_display_name = current_member_display_name/i);
  for (const key of [
    "id",
    "daily_item_id",
    "session_id",
    "daily_session_id",
    "family_id",
    "item_template_id",
    "kind",
    "is_ad_hoc",
    "name",
    "required_quantity",
    "observed_quantity",
    "shortage_count",
    "quantity",
    "unit",
    "rough_state",
    "is_checked",
    "is_prepared",
    "is_deferred",
    "is_carryover",
    "carryover_pending_shortage_count",
    "carried_from_daily_item_id",
    "carryover_processed_at",
    "carryover_resolved_at",
    "due_date",
    "sort_order",
    "version",
    "updated_by_member_id",
    "updated_by_user_id",
    "updated_by_display_name",
    "created_at",
    "updated_at",
  ]) {
    assert.match(functionSql, new RegExp(`'${key}'`, "i"));
  }
});

test("daily item update RPC does not update sessions, insert, delete, checked, rough state, or carryover resolution", () => {
  const functionSql = getFunctionSql();

  assert.doesNotMatch(functionSql, /\binsert\s+into\b|\bdelete\s+from\b/i);
  assert.doesNotMatch(functionSql, /update public\.daily_sessions/i);
  assert.doesNotMatch(functionSql, /checked_at|checked_by_|prepared_at|prepared_by_|thanks_/i);
  assert.doesNotMatch(functionSql, /set_checked|set_rough_state/i);
  assert.doesNotMatch(functionSql, /is_checked\s*=|rough_state\s*=|is_carryover\s*=|carryover_pending_shortage_count\s*=|carryover_resolved_at\s*=/i);
});

test("daily item update RPC has status envelopes for success, conflict, forbidden, not_found, and invalid_state", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /'status', 'success'[\s\S]*'item', item_payload[\s\S]*'session', null/i);
  assert.match(functionSql, /'status', 'conflict'[\s\S]*'item', item_payload[\s\S]*'session', null/i);
  assert.match(functionSql, /'status', 'forbidden'[\s\S]*'item', null[\s\S]*'session', null/i);
  assert.match(functionSql, /'status', 'not_found'[\s\S]*'item', null[\s\S]*'session', null/i);
  assert.match(functionSql, /'status', 'invalid_state'[\s\S]*'item', null[\s\S]*'session', null/i);
});
