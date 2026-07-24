import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260719000600_add_ensure_daily_session_rpc.sql";
const sql = readFileSync(migrationPath, "utf8");

const getFunctionSql = () => {
  const functionStart = sql.indexOf(
    "create or replace function public.ensure_daily_session",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

const getDailySessionInsertSql = () => {
  const functionSql = getFunctionSql();
  const match = functionSql.match(
    /insert into public\.daily_sessions[\s\S]*?returning daily_sessions\.id into inserted_session_id;/i,
  );

  assert.ok(match);
  return match[0];
};

const getDailyItemsInsertSql = () => {
  const functionSql = getFunctionSql();
  const match = functionSql.match(
    /insert into public\.daily_items[\s\S]*?returning daily_items\.id/i,
  );

  assert.ok(match);
  return match[0];
};

test("daily session ensure RPC migration is present with expected signature and security", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(
    migrations.includes("20260719000600_add_ensure_daily_session_rpc.sql"),
  );
  assert.match(
    sql,
    /create or replace function public\.ensure_daily_session\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date\s*\)/i,
  );
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
});

test("daily session ensure RPC execute access is limited to authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.ensure_daily_session\(\s*uuid,\s*uuid,\s*date\s*\)\s+from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.ensure_daily_session\(\s*uuid,\s*uuid,\s*date\s*\)\s+from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.ensure_daily_session\(\s*uuid,\s*uuid,\s*date\s*\)\s+from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.ensure_daily_session\(\s*uuid,\s*uuid,\s*date\s*\)\s+to authenticated;/i,
  );
});

test("daily session ensure RPC validates required arguments with an invalid_state envelope", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_family_id is null/i);
  assert.match(functionSql, /p_child_id is null/i);
  assert.match(functionSql, /p_session_date is null/i);
  assert.match(
    functionSql,
    /'status', 'invalid_state'[\s\S]*'session', null[\s\S]*'created_session', false[\s\S]*'created_item_count', 0/i,
  );
});

test("daily session ensure RPC checks auth, family membership, member row, and child ownership", () => {
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
    /select family_members\.id[\s\S]*from public\.family_members[\s\S]*family_members\.family_id = p_family_id[\s\S]*family_members\.user_id = current_user_id/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id/i,
  );
  assert.match(
    functionSql,
    /if target_child_id is null[\s\S]*'status', 'forbidden'/i,
  );
});

test("daily session ensure RPC creates or reuses exactly one scoped daily session", () => {
  const functionSql = getFunctionSql();
  const insertSql = getDailySessionInsertSql();

  assert.match(insertSql, /insert into public\.daily_sessions/i);
  assert.match(insertSql, /family_id,\s*child_id,\s*session_date/i);
  assert.match(
    insertSql,
    /on conflict on constraint daily_sessions_one_per_day do nothing/i,
  );
  assert.match(
    functionSql,
    /created_session := inserted_session_id is not null/i,
  );
  assert.match(
    functionSql,
    /select daily_sessions\.id[\s\S]*from public\.daily_sessions[\s\S]*daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date/i,
  );
});

test("daily session ensure RPC does not update existing sessions or overwrite session state", () => {
  const functionSql = getFunctionSql();
  const insertSql = getDailySessionInsertSql();

  assert.doesNotMatch(functionSql, /update public\.daily_sessions/i);
  assert.doesNotMatch(
    insertSql,
    /checked_|prepared_|thanks_|version|created_at|updated_at/i,
  );
  assert.doesNotMatch(functionSql, /version\s*=\s*daily_sessions\.version \+ 1/i);
  assert.doesNotMatch(functionSql, /updated_at\s*=/i);
});

test("daily session ensure RPC inserts missing active template-derived items with DB conflict protection", () => {
  const insertSql = getDailyItemsInsertSql();

  assert.match(insertSql, /insert into public\.daily_items/i);
  assert.match(insertSql, /from public\.item_templates/i);
  assert.match(insertSql, /item_templates\.family_id = p_family_id/i);
  assert.match(insertSql, /item_templates\.child_id = p_child_id/i);
  assert.match(insertSql, /item_templates\.is_active = true/i);
  assert.match(
    insertSql,
    /on conflict \(daily_session_id, item_template_id\)\s+where item_template_id is not null\s+and deleted_at is null\s+do nothing/i,
  );
});

test("daily session ensure RPC uses regular template snapshots without observed or shortage values", () => {
  const insertSql = getDailyItemsInsertSql();

  assert.match(insertSql, /item_templates\.kind = 'regular'/i);
  assert.match(insertSql, /item_templates\.name/i);
  assert.match(insertSql, /item_templates\.default_quantity/i);
  assert.match(insertSql, /item_templates\.unit/i);
  assert.match(insertSql, /item_templates\.sort_order/i);
  assert.match(insertSql, /item_templates\.default_quantity,\s*null,\s*null,\s*null,\s*false/i);
  assert.match(insertSql, /false,\s*false,\s*false,\s*null,\s*false/i);
});

test("daily session ensure RPC creates scheduled spot templates using item_template_weekdays only", () => {
  const insertSql = getDailyItemsInsertSql();

  assert.match(insertSql, /item_templates\.kind = 'spot'/i);
  assert.match(insertSql, /from public\.item_template_weekdays/i);
  assert.match(
    insertSql,
    /item_template_weekdays\.item_template_id = item_templates\.id/i,
  );
  assert.match(
    insertSql,
    /item_template_weekdays\.weekday =\s*extract\(dow from p_session_date\)::smallint/i,
  );
  assert.doesNotMatch(insertSql, /item_templates\.weekday/i);
  assert.match(insertSql, /item_template_id,\s*kind,\s*name/i);
  assert.match(insertSql, /is_ad_hoc[\s\S]*false/i);
});

test("daily session ensure RPC snapshots all active rough templates and their current rough state", () => {
  const insertSql = getDailyItemsInsertSql();

  assert.match(insertSql, /item_templates\.kind = 'rough'/i);
  assert.doesNotMatch(insertSql, /current_rough_state\s*=\s*'refill'/i);
  assert.match(
    insertSql,
    /when item_templates\.kind = 'rough' then item_templates\.current_rough_state/i,
  );
  assert.match(insertSql, /rough_state/i);
  assert.match(insertSql, /observed_quantity[\s\S]*shortage_count[\s\S]*carryover_pending_shortage_count/i);
});

test("daily session ensure RPC does not perform carryover, ad hoc spot, update, or delete work", () => {
  const functionSql = getFunctionSql();
  const insertSql = getDailyItemsInsertSql();

  assert.doesNotMatch(functionSql, /\bupdate public\.daily_items\b/i);
  assert.doesNotMatch(functionSql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(functionSql, /from public\.daily_sessions[\s\S]*session_date < p_session_date/i);
  assert.doesNotMatch(functionSql, /\bis_deferred\s*=\s*true/i);
  assert.doesNotMatch(functionSql, /carryover_processed_at\s*=|carryover_resolved_at\s*=/i);
  assert.doesNotMatch(functionSql, /carried_from_daily_item_id\s*=/i);
  assert.match(insertSql, /is_carryover[\s\S]*false/i);
  assert.match(insertSql, /is_ad_hoc[\s\S]*false/i);
  assert.match(insertSql, /updated_by_member_id[\s\S]*updated_by_user_id[\s\S]*updated_by_display_name/i);
});

test("daily session ensure RPC can backfill missing template items on rerun without changing existing items", () => {
  const functionSql = getFunctionSql();
  const insertSql = getDailyItemsInsertSql();

  assert.match(functionSql, /select daily_sessions\.id[\s\S]*into target_session_id/i);
  assert.match(insertSql, /from public\.item_templates/i);
  assert.match(insertSql, /do nothing/i);
  assert.doesNotMatch(functionSql, /update public\.daily_items/i);
});

test("daily session ensure RPC returns a load-compatible session payload without items", () => {
  const functionSql = getFunctionSql();

  for (const key of [
    "id",
    "session_id",
    "family_id",
    "child_id",
    "session_date",
    "version",
    "is_checked",
    "checked_by_member_id",
    "checked_by_user_id",
    "checked_by_display_name",
    "checked_at",
    "is_prepared",
    "prepared_by_member_id",
    "prepared_by_user_id",
    "prepared_by_display_name",
    "prepared_at",
    "thanks_sent_at",
    "thanks_sent_by_member_id",
    "thanks_sent_by_user_id",
    "thanks_sent_by_display_name",
    "thanks_received_by_member_id",
    "thanks_received_by_user_id",
    "thanks_received_by_display_name",
    "created_at",
    "updated_at",
  ]) {
    assert.match(functionSql, new RegExp(`'${key}'`, "i"));
  }

  assert.doesNotMatch(functionSql, /'items'/i);
});

test("daily session ensure RPC returns status envelope with creation metadata", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /'status', 'success'[\s\S]*'session', session_payload[\s\S]*'created_session', created_session[\s\S]*'created_item_count', created_item_count/i,
  );
  assert.match(functionSql, /'status', 'forbidden'/i);
  assert.match(functionSql, /'status', 'invalid_state'/i);
  assert.match(functionSql, /select pg_catalog\.count\(\*\)::integer[\s\S]*into created_item_count/i);
});
