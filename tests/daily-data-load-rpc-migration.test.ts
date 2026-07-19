import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260719000300_add_load_daily_data_rpc.sql";
const sql = readFileSync(migrationPath, "utf8");

const getFunctionSql = () => {
  const functionStart = sql.indexOf(
    "create or replace function public.load_daily_data",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

test("daily data load RPC migration is present with a read-only JSON signature", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(migrations.includes("20260719000300_add_load_daily_data_rpc.sql"));
  assert.match(
    sql,
    /create or replace function public\.load_daily_data\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date\s*\)/i,
  );
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.doesNotMatch(sql, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
});

test("daily data load RPC keeps execute access limited to authenticated users", () => {
  assert.match(
    sql,
    /revoke all on function public\.load_daily_data\(uuid, uuid, date\) from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.load_daily_data\(uuid, uuid, date\) from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.load_daily_data\(uuid, uuid, date\) from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.load_daily_data\(uuid, uuid, date\)\s+to authenticated;/i,
  );
});

test("daily data load RPC checks auth, family membership, and child ownership", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(functionSql, /if current_user_id is null[\s\S]*'status', 'forbidden'/i);
  assert.match(
    functionSql,
    /if not public\.is_family_member\(p_family_id\)[\s\S]*'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id/i,
  );
  assert.match(functionSql, /if target_child_id is null[\s\S]*'status', 'forbidden'/i);
});

test("daily data load RPC targets exactly one explicit session date and never creates missing rows", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_session_date date/i);
  assert.match(
    functionSql,
    /daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date/i,
  );
  assert.match(functionSql, /if target_session_id is null[\s\S]*'status', 'not_found'/i);
  assert.match(functionSql, /'session', null[\s\S]*'items', pg_catalog\.jsonb_build_array\(\)/i);
  assert.doesNotMatch(functionSql, /\bnow\(\)|current_date|timezone\(/i);
  assert.doesNotMatch(functionSql, /\binsert\s+into\s+public\.daily_sessions|\binsert\s+into\s+public\.daily_items/i);
});

test("daily data load RPC returns session versions and actor snapshots", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /'version', daily_sessions\.version/i);
  assert.match(functionSql, /'is_checked', daily_sessions\.checked_at is not null/i);
  assert.match(functionSql, /'checked_by_member_id', daily_sessions\.checked_by_member_id/i);
  assert.match(functionSql, /'checked_by_user_id', daily_sessions\.checked_by_user_id/i);
  assert.match(functionSql, /'checked_by_display_name', daily_sessions\.checked_by_display_name/i);
  assert.match(functionSql, /'is_prepared', daily_sessions\.prepared_at is not null/i);
  assert.match(functionSql, /'prepared_by_member_id', daily_sessions\.prepared_by_member_id/i);
  assert.match(functionSql, /'prepared_by_user_id', daily_sessions\.prepared_by_user_id/i);
  assert.match(functionSql, /'prepared_by_display_name', daily_sessions\.prepared_by_display_name/i);
  assert.match(functionSql, /'thanks_sent_by_member_id', daily_sessions\.thanks_sent_by_member_id/i);
  assert.match(functionSql, /'thanks_received_by_member_id', daily_sessions\.thanks_received_by_member_id/i);
  assert.match(functionSql, /'created_at', daily_sessions\.created_at/i);
  assert.match(functionSql, /'updated_at', daily_sessions\.updated_at/i);
});

test("daily data load RPC returns only active daily items with quantities, kinds, carryover, and versions", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /daily_items\.deleted_at is null/i);
  assert.match(functionSql, /'kind', daily_item_rows\.kind/i);
  assert.match(functionSql, /'is_ad_hoc', daily_item_rows\.is_ad_hoc/i);
  assert.match(functionSql, /'item_template_id', daily_item_rows\.item_template_id/i);
  assert.match(functionSql, /'required_quantity', daily_item_rows\.required_quantity/i);
  assert.match(functionSql, /'observed_quantity', daily_item_rows\.observed_quantity/i);
  assert.match(functionSql, /'shortage_count', daily_item_rows\.shortage_count/i);
  assert.match(
    functionSql,
    /'carryover_pending_shortage_count',\s*daily_item_rows\.carryover_pending_shortage_count/i,
  );
  assert.match(functionSql, /'rough_state', daily_item_rows\.rough_state/i);
  assert.match(functionSql, /'is_checked', daily_item_rows\.is_checked/i);
  assert.match(functionSql, /'is_deferred', daily_item_rows\.is_deferred/i);
  assert.match(functionSql, /'is_carryover', daily_item_rows\.is_carryover/i);
  assert.match(functionSql, /'carried_from_daily_item_id',\s*daily_item_rows\.carried_from_daily_item_id/i);
  assert.match(functionSql, /'version', daily_item_rows\.version/i);
  assert.match(functionSql, /'updated_by_member_id', daily_item_rows\.updated_by_member_id/i);
  assert.match(functionSql, /'updated_by_user_id', daily_item_rows\.updated_by_user_id/i);
  assert.match(functionSql, /'updated_by_display_name', daily_item_rows\.updated_by_display_name/i);
});

test("daily data load RPC returns stable item ordering and status envelope", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /order by daily_item_rows\.sort_order, daily_item_rows\.id/i);
  assert.match(functionSql, /'status', 'success'[\s\S]*'session', session_payload[\s\S]*'items', items_payload/i);
  assert.match(functionSql, /'status', 'invalid_state'/i);
  assert.match(functionSql, /'status', 'forbidden'/i);
  assert.match(functionSql, /'status', 'not_found'/i);
});
